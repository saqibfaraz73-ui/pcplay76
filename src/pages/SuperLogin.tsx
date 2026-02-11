import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getLicense, updateLicense } from "@/features/licensing/licensing-db";

/**
 * Generate a deterministic 4-digit super PIN from a device ID.
 * Same device ID always produces the same PIN.
 */
export function generateSuperPin(deviceId: string): string {
  const seed = `SUPER_SANGI_2024::${deviceId}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  // Get a 4-digit PIN (1000-9999)
  const pin = 1000 + (Math.abs(hash) % 9000);
  return String(pin);
}

export default function SuperLogin() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [authed, setAuthed] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [deviceId, setDeviceId] = React.useState("");
  const [expectedPin, setExpectedPin] = React.useState("");
  const [isPremium, setIsPremium] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Load device ID on mount
  React.useEffect(() => {
    getLicense().then((lic) => {
      setDeviceId(lic.deviceId);
      setExpectedPin(generateSuperPin(lic.deviceId));
    });
  }, []);

  React.useEffect(() => {
    if (authed) {
      getLicense().then((lic) => setIsPremium(lic.isPremium));
    }
  }, [authed]);

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === expectedPin) {
      setAuthed(true);
    } else {
      toast({ title: "Invalid PIN", variant: "destructive" });
    }
  };

  const handleActivate = async () => {
    setLoading(true);
    try {
      await updateLicense({ isPremium: true });
      setIsPremium(true);
      toast({ title: "Premium activated on this device!" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      await updateLicense({ isPremium: false, activationKey: undefined });
      setIsPremium(false);
      toast({ title: "Premium deactivated" });
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
            <CardDescription>Restricted access</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Device ID</Label>
                <Input value={deviceId} readOnly className="font-mono text-xs bg-muted" />
              </div>
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
          <CardTitle>Premium Activation</CardTitle>
          <CardDescription>Instantly activate or deactivate premium on this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isPremium ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm font-medium">{isPremium ? "Premium Active" : "Free Version"}</span>
          </div>
          {isPremium ? (
            <Button variant="destructive" className="w-full" onClick={handleDeactivate} disabled={loading}>
              {loading ? "Processing..." : "Deactivate Premium"}
            </Button>
          ) : (
            <Button className="w-full" onClick={handleActivate} disabled={loading}>
              {loading ? "Processing..." : "Activate Premium"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
