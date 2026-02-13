import React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [validUntilDate, setValidUntilDate] = React.useState<Date | undefined>(undefined);
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

  const getValidUntilISO = (): string | undefined => {
    if (!validUntilDate) return undefined;
    // Set to end of day
    const d = new Date(validUntilDate);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  const handleActivate = async () => {
    if (!customerDeviceId.trim()) {
      toast({ title: "Enter a Device ID first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const validUntilTs = validUntilDate ? new Date(validUntilDate).setHours(23, 59, 59, 999) : undefined;
      await updateLicense({ isPremium: true, licensedDeviceId: customerDeviceId.trim(), validUntil: validUntilTs });
      setIsPremium(true);
      setLicensedDeviceId(customerDeviceId.trim());
      const expiryMsg = validUntilDate ? ` (valid until ${format(validUntilDate, "PPP")})` : "";
      toast({ title: `Premium activated for ${customerDeviceId.trim()}${expiryMsg}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      await updateLicense({ isPremium: false, licensedDeviceId: "", validUntil: undefined });
      setIsPremium(false);
      setLicensedDeviceId("");
      setCustomerDeviceId("");
      setValidUntilDate(undefined);
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
    const validUntilISO = getValidUntilISO();
    setLoading(true);
    try {
      // Try native file generation + share first
      const { uri } = await generateLicenseFile(customerDeviceId.trim(), validUntilISO);
      toast({ title: "License file created!" });
      try {
        await shareLicenseFile(uri);
      } catch {
        toast({ title: "File saved to Sangi Pos/Backup folder", description: "Share manually if needed" });
      }
    } catch {
      // Fallback: copy encrypted data to clipboard so user can share via messaging
      try {
        const base64 = generateLicenseBase64(customerDeviceId.trim(), validUntilISO);
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

          <div className="space-y-2">
            <Label>Valid Until (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !validUntilDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {validUntilDate ? format(validUntilDate, "PPP") : "No expiry (lifetime)"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={validUntilDate}
                  onSelect={setValidUntilDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {validUntilDate && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setValidUntilDate(undefined)}>
                Clear expiry (make lifetime)
              </Button>
            )}
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
