package app.lovable.a89517294eb14219b1dd14af0464d470;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import androidx.documentfile.provider.DocumentFile;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * SafStoragePlugin — Storage Access Framework plugin for Sangi POS.
 *
 * SETUP in MainActivity.java:
 *   registerPlugin(SafStoragePlugin.class);
 *
 * GRADLE dependency in app/build.gradle:
 *   implementation "androidx.documentfile:documentfile:1.0.1"
 *
 * HOW IT WORKS:
 *  1. Call openFolderPicker() once → user selects a folder → URI stored permanently.
 *  2. Call writeFile() / readFile() / getUri() as needed — no permission prompts ever again.
 *  3. Call hasFolderAccess() to check if a folder is already selected.
 *
 * ZERO storage permissions needed in AndroidManifest.xml.
 *
 * FIX NOTE: Uses @ActivityCallback (Capacitor 6+ pattern) instead of the deprecated
 * handleOnActivityResult() override, which was the root cause of the folder picker result
 * never being received and URIs never being saved.
 */
@CapacitorPlugin(name = "SafStorage")
public class SafStoragePlugin extends Plugin {

    private static final String TAG = "SafStoragePlugin";
    private static final String PREFS_NAME = "SafStoragePrefs";
    private static final String KEY_ROOT_URI = "rootUri";

    // ─────────────────────────────────────────────────────────────────────────
    // openFolderPicker  — uses correct Capacitor 6+ @ActivityCallback pattern
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Opens the Android system folder picker.
     * On success the selected URI is stored in SharedPreferences and returned.
     *
     * JS usage:
     *   const { uri } = await SafStorage.openFolderPicker();
     */
    @PluginMethod
    public void openFolderPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        // Correct Capacitor 6+ way — routes result back via @ActivityCallback below
        startActivityForResult(call, intent, "handleFolderPickerResult");
    }

    @ActivityCallback
    private void handleFolderPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Folder picker was cancelled");
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("No URI returned from picker");
            return;
        }

        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
            saveRootUri(treeUri.toString());

            JSObject ret = new JSObject();
            ret.put("uri", treeUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Permission error: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // hasFolderAccess
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns { hasAccess: boolean, uri: string | null }
     *
     * JS usage:
     *   const { hasAccess, uri } = await SafStorage.hasFolderAccess();
     */
    @PluginMethod
    public void hasFolderAccess(PluginCall call) {
        String storedUri = getSavedRootUri();
        boolean hasAccess = false;

        if (storedUri != null) {
            Uri uri = Uri.parse(storedUri);
            for (UriPermission perm : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (perm.getUri().equals(uri) && perm.isWritePermission()) {
                    hasAccess = true;
                    break;
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("hasAccess", hasAccess);
        ret.put("uri", hasAccess ? storedUri : null);
        call.resolve(ret);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // writeTextFile
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Writes a UTF-8 text file inside the selected folder.
     * Creates sub-folders (e.g. "Backup/myfile.json") automatically.
     *
     * JS usage:
     *   await SafStorage.writeTextFile({ relativePath: "Backup/backup_123.json", contents: "..." });
     *   // returns { uri: "content://..." }
     */
    @PluginMethod
    public void writeTextFile(PluginCall call) {
        String relativePath = call.getString("relativePath");
        String contents     = call.getString("contents");

        if (relativePath == null || contents == null) {
            call.reject("relativePath and contents are required");
            return;
        }

        DocumentFile rootDir = getRootDocumentFile();
        if (rootDir == null) { call.reject("No folder selected. Call openFolderPicker first."); return; }

        try {
            DocumentFile file = resolveOrCreateFile(rootDir, relativePath, "text/plain");
            if (file == null) { call.reject("Could not create file: " + relativePath); return; }

            writeBytes(file.getUri(), contents.getBytes(StandardCharsets.UTF_8));

            JSObject ret = new JSObject();
            ret.put("uri", file.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "writeTextFile error", e);
            call.reject("Write failed: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // writeBinaryFile (base64 input)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Writes a binary file (PDF, image, etc.) from a base64-encoded string.
     *
     * JS usage:
     *   await SafStorage.writeBinaryFile({
     *     relativePath: "Sales Report/report.pdf",
     *     base64Data: "<base64 string>",
     *     mimeType: "application/pdf"
     *   });
     */
    @PluginMethod
    public void writeBinaryFile(PluginCall call) {
        String relativePath = call.getString("relativePath");
        String base64Data   = call.getString("base64Data");
        String mimeType     = call.getString("mimeType", "application/octet-stream");

        if (relativePath == null || base64Data == null) {
            call.reject("relativePath and base64Data are required");
            return;
        }

        DocumentFile rootDir = getRootDocumentFile();
        if (rootDir == null) { call.reject("No folder selected. Call openFolderPicker first."); return; }

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            DocumentFile file = resolveOrCreateFile(rootDir, relativePath, mimeType);
            if (file == null) { call.reject("Could not create file: " + relativePath); return; }

            writeBytes(file.getUri(), bytes);

            JSObject ret = new JSObject();
            ret.put("uri", file.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "writeBinaryFile error", e);
            call.reject("Write failed: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // readTextFile
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Reads a text file from the selected folder.
     *
     * JS usage:
     *   const { contents } = await SafStorage.readTextFile({ relativePath: "Backup/backup_123.json" });
     */
    @PluginMethod
    public void readTextFile(PluginCall call) {
        String relativePath = call.getString("relativePath");
        if (relativePath == null) { call.reject("relativePath is required"); return; }

        DocumentFile rootDir = getRootDocumentFile();
        if (rootDir == null) { call.reject("No folder selected."); return; }

        DocumentFile file = resolveFile(rootDir, relativePath);
        if (file == null || !file.exists()) { call.reject("File not found: " + relativePath); return; }

        try {
            byte[] bytes = readBytes(file.getUri());
            JSObject ret = new JSObject();
            ret.put("contents", new String(bytes, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readTextFile error", e);
            call.reject("Read failed: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // getFileUri
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns the content:// URI of a file so it can be shared via the Share plugin.
     *
     * JS usage:
     *   const { uri } = await SafStorage.getFileUri({ relativePath: "Backup/backup_123.json" });
     */
    @PluginMethod
    public void getFileUri(PluginCall call) {
        String relativePath = call.getString("relativePath");
        if (relativePath == null) { call.reject("relativePath is required"); return; }

        DocumentFile rootDir = getRootDocumentFile();
        if (rootDir == null) { call.reject("No folder selected."); return; }

        DocumentFile file = resolveFile(rootDir, relativePath);
        if (file == null || !file.exists()) { call.reject("File not found: " + relativePath); return; }

        JSObject ret = new JSObject();
        ret.put("uri", file.getUri().toString());
        call.resolve(ret);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // listFiles
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lists files in a sub-folder.
     *
     * JS usage:
     *   const { files } = await SafStorage.listFiles({ relativePath: "Backup" });
     */
    @PluginMethod
    public void listFiles(PluginCall call) {
        String relativePath = call.getString("relativePath", "");

        DocumentFile rootDir = getRootDocumentFile();
        if (rootDir == null) { call.reject("No folder selected."); return; }

        DocumentFile dir = relativePath == null || relativePath.isEmpty()
            ? rootDir
            : resolveDir(rootDir, relativePath, false);

        if (dir == null || !dir.isDirectory()) {
            call.reject("Directory not found: " + relativePath);
            return;
        }

        DocumentFile[] children = dir.listFiles();
        JSObject ret = new JSObject();
        org.json.JSONArray names = new org.json.JSONArray();
        if (children != null) {
            for (DocumentFile f : children) names.put(f.getName());
        }
        ret.put("files", names);
        call.resolve(ret);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // deleteFile
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Deletes a file inside the selected folder.
     *
     * JS usage:
     *   await SafStorage.deleteFile({ relativePath: "Images/items/abc123.jpg" });
     */
    @PluginMethod
    public void deleteFile(PluginCall call) {
        String relativePath = call.getString("relativePath");
        if (relativePath == null) { call.reject("relativePath is required"); return; }

        DocumentFile rootDir = getRootDocumentFile();
        if (rootDir == null) { call.reject("No folder selected."); return; }

        DocumentFile file = resolveFile(rootDir, relativePath);
        if (file == null || !file.exists()) {
            call.resolve(new JSObject());
            return;
        }

        file.delete();
        call.resolve(new JSObject());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private void saveRootUri(String uri) {
        prefs().edit().putString(KEY_ROOT_URI, uri).apply();
    }

    private String getSavedRootUri() {
        return prefs().getString(KEY_ROOT_URI, null);
    }

    private DocumentFile getRootDocumentFile() {
        String uriStr = getSavedRootUri();
        if (uriStr == null) return null;
        Uri uri = Uri.parse(uriStr);
        return DocumentFile.fromTreeUri(getContext(), uri);
    }

    /** Resolves path segments into a directory, creating intermediate dirs if needed. */
    private DocumentFile resolveDir(DocumentFile parent, String relativePath, boolean create) {
        String[] parts = relativePath.split("/");
        DocumentFile current = parent;
        for (String part : parts) {
            if (part.isEmpty()) continue;
            DocumentFile child = current.findFile(part);
            if (child == null || !child.isDirectory()) {
                if (!create) return null;
                child = current.createDirectory(part);
                if (child == null) return null;
            }
            current = child;
        }
        return current;
    }

    /** Resolves a file path without creating it. */
    private DocumentFile resolveFile(DocumentFile root, String relativePath) {
        int lastSlash = relativePath.lastIndexOf('/');
        if (lastSlash < 0) {
            return root.findFile(relativePath);
        }
        String dirPart  = relativePath.substring(0, lastSlash);
        String fileName = relativePath.substring(lastSlash + 1);
        DocumentFile dir = resolveDir(root, dirPart, false);
        if (dir == null) return null;
        return dir.findFile(fileName);
    }

    /** Resolves or creates a file (including parent dirs). Overwrites if exists. */
    private DocumentFile resolveOrCreateFile(DocumentFile root, String relativePath, String mimeType) {
        int lastSlash = relativePath.lastIndexOf('/');
        DocumentFile dir;
        String fileName;

        if (lastSlash < 0) {
            dir      = root;
            fileName = relativePath;
        } else {
            dir      = resolveDir(root, relativePath.substring(0, lastSlash), true);
            fileName = relativePath.substring(lastSlash + 1);
        }

        if (dir == null) return null;

        DocumentFile existing = dir.findFile(fileName);
        if (existing != null && existing.exists()) existing.delete();

        return dir.createFile(mimeType, fileName);
    }

    private void writeBytes(Uri uri, byte[] data) throws IOException {
        try (OutputStream os = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (os == null) throw new IOException("Could not open output stream");
            os.write(data);
            os.flush();
        }
    }

    private byte[] readBytes(Uri uri) throws IOException {
        try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
            if (is == null) throw new IOException("Could not open input stream");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[4096];
            int nRead;
            while ((nRead = is.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }
            return buffer.toByteArray();
        }
    }
}
