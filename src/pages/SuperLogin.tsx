import React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, Clock, Copy } from "lucide-react";
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

type ActivationMode = "date" | "duration";

/** Live countdown display */
function RemainingTimeDisplay({ validUntil }: { validUntil: number }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = validUntil - now;
  if (remaining <= 0) {
    return <p className="text-sm font-medium text-destructive">⏰ License expired</p>;
  }

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  const isUrgent = remaining < 3600000;
  return (
    <div className={`rounded-md border p-3 text-center ${isUrgent ? "border-destructive/40 bg-destructive/10" : "border-primary/40 bg-primary/5"}`}>
      <p className="text-xs text-muted-foreground mb-1">
        <Clock className="inline h-3 w-3 mr-1" />
        Remaining Time
      </p>
      <p className={`text-lg font-bold font-mono ${isUrgent ? "text-destructive" : "text-primary"}`}>
        {parts.join(" ")}
      </p>
    </div>
  );
}

export default function SuperLogin() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [authed, setAuthed] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [customerDeviceId, setCustomerDeviceId] = React.useState("");
  const [isPremium, setIsPremium] = React.useState(false);
  const [licensedDeviceId, setLicensedDeviceId] = React.useState("");
  const [validUntilDate, setValidUntilDate] = React.useState<Date | undefined>(undefined);
  const [activationMode, setActivationMode] = React.useState<ActivationMode>("date");
  const [durationHours, setDurationHours] = React.useState(0);
  const [durationMinutes, setDurationMinutes] = React.useState(30);
  const [loading, setLoading] = React.useState(false);
  const [currentValidUntil, setCurrentValidUntil] = React.useState<number | undefined>(undefined);
  const [currentDeviceId, setCurrentDeviceId] = React.useState("");

  React.useEffect(() => {
    if (authed) {
      getLicense().then((lic) => {
        setIsPremium(lic.isPremium);
        setLicensedDeviceId(lic.licensedDeviceId ?? "");
        setCurrentValidUntil(lic.validUntil);
        setCurrentDeviceId(lic.deviceId);
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

  const getValidUntilTimestamp = (): number | undefined => {
    if (activationMode === "duration") {
      const totalMs = ((durationHours * 60) + durationMinutes) * 60 * 1000;
      if (totalMs <= 0) return undefined;
      return Date.now() + totalMs;
    }
    if (validUntilDate) {
      const d = new Date(validUntilDate);
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    }
    return undefined;
  };

  const getValidUntilISO = (): string | undefined => {
    if (activationMode === "date" && validUntilDate) {
      const d = new Date(validUntilDate);
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    }
    return undefined;
  };

  const handleActivate = async () => {
    const targetId = customerDeviceId.trim();
    if (!targetId) {
      toast({ title: "Enter a Device ID first", variant: "destructive" });
      return;
    }
    if (activationMode === "duration" && durationHours === 0 && durationMinutes === 0) {
      toast({ title: "Set a duration first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const validUntilTs = getValidUntilTimestamp();
      await updateLicense({ isPremium: true, licensedDeviceId: targetId, validUntil: validUntilTs });
      setIsPremium(true);
      setLicensedDeviceId(targetId);
      setCurrentValidUntil(validUntilTs);
      let expiryMsg = "";
      if (activationMode === "duration" && validUntilTs) {
        const msgParts: string[] = [];
        if (durationHours > 0) msgParts.push(`${durationHours}h`);
        if (durationMinutes > 0) msgParts.push(`${durationMinutes}m`);
        expiryMsg = ` (valid for ${msgParts.join(" ")})`;
      } else if (validUntilDate) {
        expiryMsg = ` (valid until ${format(validUntilDate, "PPP")})`;
      }
      toast({ title: `Premium activated for ${targetId}${expiryMsg}` });
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
      setCurrentValidUntil(undefined);
      toast({ title: "Premium deactivated" });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFile = async () => {
    const targetId = customerDeviceId.trim();
    if (!targetId) {
      toast({ title: "Enter a Device ID first", variant: "destructive" });
      return;
    }
    if (activationMode === "duration" && durationHours === 0 && durationMinutes === 0) {
      toast({ title: "Set a duration first", variant: "destructive" });
      return;
    }

    const validUntilISO = getValidUntilISO();
    const validUntilTs = activationMode === "duration" ? getValidUntilTimestamp() : undefined;

    setLoading(true);
    try {
      const { uri } = await generateLicenseFile(targetId, validUntilISO, validUntilTs);

      let desc = "License file created";
      if (activationMode === "duration" && validUntilTs) {
        const msgParts: string[] = [];
        if (durationHours > 0) msgParts.push(`${durationHours}h`);
        if (durationMinutes > 0) msgParts.push(`${durationMinutes}m`);
        desc += ` (valid for ${msgParts.join(" ")})`;
      } else if (validUntilDate) {
        desc += ` (valid until ${format(validUntilDate, "PPP")})`;
      } else {
        desc += " (lifetime)";
      }

      toast({ title: desc });
      try {
        await shareLicenseFile(uri);
      } catch {
        toast({ title: "File saved to Sangi Pos/Backup folder", description: "Share manually if needed" });
      }
    } catch {
      try {
        const base64 = generateLicenseBase64(targetId, validUntilISO, validUntilTs);
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
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  autoComplete="off"
                  placeholder="4-digit PIN"
                />
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

      {/* Current device info */}
      {currentDeviceId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">This Device</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="font-mono text-xs bg-muted p-2 rounded cursor-pointer select-all break-all"
              onClick={() => {
                navigator.clipboard?.writeText(currentDeviceId);
                toast({ title: "Device ID copied" });
              }}
            >
              {currentDeviceId}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Tap to copy</p>
          </CardContent>
        </Card>
      )}

      {/* Activation panel */}
      <Card>
        <CardHeader>
          <CardTitle>Device Premium Activation</CardTitle>
          <CardDescription>Enter the customer's Device ID to generate a license file. You can activate any device — not just this one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Customer Device ID</Label>
            <div className="flex gap-2">
              <Input
                value={customerDeviceId}
                onChange={(e) => setCustomerDeviceId(e.target.value)}
                placeholder="e.g. SNG-XXXXXXXX-XXXX"
                className="font-mono text-xs flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      setCustomerDeviceId(text.trim());
                      toast({ title: "Pasted from clipboard" });
                    }
                  } catch {
                    toast({ title: "Could not paste", variant: "destructive" });
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Activation type toggle */}
          <div className="space-y-2">
            <Label>Activation Type</Label>
            <div className="flex gap-2">
              <Button
                variant={activationMode === "date" ? "default" : "outline"}
                size="sm"
                onClick={() => setActivationMode("date")}
                className="flex-1 gap-1.5"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                By Date
              </Button>
              <Button
                variant={activationMode === "duration" ? "default" : "outline"}
                size="sm"
                onClick={() => setActivationMode("duration")}
                className="flex-1 gap-1.5"
              >
                <Clock className="h-3.5 w-3.5" />
                By Duration
              </Button>
            </div>
          </div>

          {activationMode === "date" && (
            <div className="space-y-2">
              <Label>Valid Until (optional — leave empty for lifetime)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !validUntilDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {validUntilDate ? format(validUntilDate, "PPP") : "No expiry (lifetime)"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={validUntilDate} onSelect={setValidUntilDate} disabled={(date) => date < new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {validUntilDate && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setValidUntilDate(undefined)}>
                  Clear expiry (make lifetime)
                </Button>
              )}
            </div>
          )}

          {activationMode === "duration" && (
            <div className="space-y-2">
              <Label>Duration (for testing)</Label>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Hours</Label>
                  <Input type="number" min={0} value={durationHours} onChange={(e) => setDurationHours(Math.max(0, parseInt(e.target.value) || 0))} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Minutes</Label>
                  <Input type="number" min={0} max={59} value={durationMinutes} onChange={(e) => setDurationMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Premium will expire {durationHours}h {durationMinutes}m from activation.</p>
            </div>
          )}

          {/* Current license info */}
          {licensedDeviceId && (
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Currently licensed to:</p>
              <p className="font-mono text-xs mt-1 select-all break-all">{licensedDeviceId}</p>
            </div>
          )}

          {/* Remaining time display */}
          {isPremium && currentValidUntil && currentValidUntil > 0 && (
            <RemainingTimeDisplay validUntil={currentValidUntil} />
          )}

          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isPremium ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm font-medium">{isPremium ? "Premium Active" : "Free Version"}</span>
          </div>

          {isPremium ? (
            <Button variant="destructive" className="w-full" onClick={() => void handleDeactivate()} disabled={loading}>
              {loading ? "Processing..." : "Deactivate Premium"}
            </Button>
          ) : (
            <Button className="w-full" onClick={() => void handleActivate()} disabled={loading}>
              {loading ? "Processing..." : "Activate Premium for this Device"}
            </Button>
          )}

          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium">Generate license file for customer:</p>
            <p className="text-[10px] text-muted-foreground">
              Enter ANY device ID above, set expiry if needed, then generate. The file will only work on that specific device.
            </p>
            <Button variant="outline" className="w-full" onClick={() => void handleGenerateFile()} disabled={loading}>
              {loading ? "Processing..." : "📄 Generate & Share License File"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
