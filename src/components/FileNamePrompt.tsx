import React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";

interface FileNamePromptProps {
  open: boolean;
  defaultName: string;
  onConfirm: (fileName: string) => void;
  onCancel: () => void;
}

export function FileNamePrompt({ open, defaultName, onConfirm, onCancel }: FileNamePromptProps) {
  // Split into name and extension
  const dotIdx = defaultName.lastIndexOf(".");
  const baseName = dotIdx > 0 ? defaultName.slice(0, dotIdx) : defaultName;
  const ext = dotIdx > 0 ? defaultName.slice(dotIdx) : "";

  const [name, setName] = React.useState(baseName);

  // Reset when dialog opens with a new default
  React.useEffect(() => {
    if (open) {
      const idx = defaultName.lastIndexOf(".");
      setName(idx > 0 ? defaultName.slice(0, idx) : defaultName);
    }
  }, [open, defaultName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed + ext);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save File</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="file-name">File Name</Label>
          <div className="flex items-center gap-1">
            <Input
              id="file-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              autoFocus
              className="flex-1"
            />
            {ext && <span className="text-sm text-muted-foreground font-mono shrink-0">{ext}</span>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            <Download className="h-4 w-4 mr-1" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
