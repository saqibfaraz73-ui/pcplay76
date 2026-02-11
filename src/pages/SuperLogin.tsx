import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getLicense, updateLicense } from "@/features/licensing/licensing-db";
import { generateLicenseFile, shareLicenseFile, generateLicenseBase64 } from "@/features/licensing/license-file";

/** Master PIN — only the developer knows this */
const MASTER_PIN = "3563";

export default function SuperLogin() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [authed, setAuthed] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [customerDeviceId, setCustomerDeviceId] = React.useState("");
  const [isPremium, setIsPremium] = React.useState(false);
  const [licensedDeviceId, setLicensedDeviceId] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // Load current license state after auth
  React.useEffect(() => {
    if (authed) {
      getLicense().then((lic) => {
        setIsPremium(lic.isPremium);
        setLicensedDeviceId(lic.licensedDeviceId ?? "");
        // Don't pre-fill customerDeviceId — always let the admin type the target device ID
      });
    }
  }, [authed]);

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === MASTER_PIN) {
      setAuthed(true);
    } else {
      toast({ title: "Invalid PIN", variant: "destructive" });
    }
  };

  const handleActivate = async () => {
    if (!customerDeviceId.trim()) {
      toast({ title: "Enter a Device ID first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await updateLicense({ isPremium: true, licensedDeviceId: customerDeviceId.trim() });
      setIsPremium(true);
      setLicensedDeviceId(customerDeviceId.trim());
      toast({ title: `Premium activated for ${customerDeviceId.trim()}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      await updateLicense({ isPremium: false, licensedDeviceId: "" });
      setIsPremium(false);
      setLicensedDeviceId("");
      setCustomerDeviceId("");
      toast({ title: "Premium deactivated" });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFile = async () => {
    if (!customerDeviceId.trim()) {
      toast({ title: "Enter a Device ID first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Try native file generation + share first
      const { uri } = await generateLicenseFile(customerDeviceId.trim());
      toast({ title: "License file created!" });
      try {
        await shareLicenseFile(uri);
      } catch {
        toast({ title: "File saved to Sangi Pos/Backup folder", description: "Share manually if needed" });
      }
    } catch {
      // Fallback: copy encrypted data to clipboard so user can share via messaging
      try {
        const base64 = generateLicenseBase64(customerDeviceId.trim());
        await navigator.clipboard.writeText(base64);
        toast({ title: "License data copied to clipboard!", description: "Send this text to the customer. They save it as 'license.sangi' in Sangi Pos/Backup folder." });
      } catch (err2: any) {
        toast({ title: "Could not generate license", description: err2?.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-sm flex-col items-center justify-center px-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Super Admin</CardTitle>
            <CardDescription>Developer access only</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Super PIN</Label>
                <Input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} autoComplete="off" placeholder="4-digit PIN" />
              </div>
              <Button type="submit" className="w-full">Login</Button>
            </form>
          </CardContent>
        </Card>
        <Button variant="link" className="mt-4 text-xs" onClick={() => navigate("/login")}>
          Back to Login
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Super Admin Panel</h1>
        <Button variant="outline" size="sm" onClick={() => navigate("/login")}>Exit</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Device Premium Activation</CardTitle>
          <CardDescription>Enter the customer's Device ID to activate premium. The built APK will only work as premium on that specific device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Customer Device ID</Label>
            <Input
              value={customerDeviceId}
              onChange={(e) => setCustomerDeviceId(e.target.value.trim())}
              placeholder="e.g. SNG-XXXXXXXX-XXXX"
              className="font-mono text-xs"
            />
          </div>

          {licensedDeviceId && (
            <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm">
              <p className="text-muted-foreground">Currently licensed to:</p>
              <p className="font-mono font-medium">{licensedDeviceId}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isPremium ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm font-medium">{isPremium ? "Premium Active" : "Free Version"}</span>
          </div>

          {isPremium ? (
            <Button variant="destructive" className="w-full" onClick={handleDeactivate} disabled={loading}>
              {loading ? "Processing..." : "Deactivate Premium"}
            </Button>
          ) : (
            <Button className="w-full" onClick={handleActivate} disabled={loading || !customerDeviceId.trim()}>
              {loading ? "Processing..." : "Activate Premium for this Device"}
            </Button>
          )}

          <div className="border-t pt-4 mt-4">
            <p className="text-sm text-muted-foreground mb-3">Or generate an encrypted license file to send to the customer:</p>
            <Button variant="outline" className="w-full" onClick={handleGenerateFile} disabled={loading || !customerDeviceId.trim()}>
              {loading ? "Processing..." : "📄 Generate & Share License File"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Customer places <code className="bg-muted px-1 rounded">license.sangi</code> in their Sangi Pos/Backup folder, then reopens the app.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
