/**
 * PRE-LOADED LICENSE
 * 
 * WORKFLOW:
 * 1. Open Super Admin → enter customer's Device ID → click "Activate"
 * 2. Copy the Device ID shown and paste it below as PRELOADED_DEVICE_ID
 * 3. Run: npm run build && npx cap sync android
 * 4. Build APK in Android Studio and give it to the customer
 * 5. The APK will auto-activate premium ONLY on the matching device
 * 
 * Change this value for each customer before building their APK.
 */

export const PRELOADED_DEVICE_ID: string = "";
export const PRELOADED_ACTIVATION_KEY: string = "";
