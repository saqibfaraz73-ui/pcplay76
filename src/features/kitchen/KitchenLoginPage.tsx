/**
 * Kitchen Login — Kitchen staff scan Main device IP barcode, enter PIN, then connect.
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { Camera, Wifi, Loader2, ChefHat, ArrowLeft } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { setMainAppUrl, pingMainApp } from "@/features/sync/sync-client";
import { DEFAULT_SYNC_PORT } from "@/features/sync/sync-types";

interface KitchenLoginPageProps {
  onConnected: (mode: "kitchen" | "display") => void;
}

export function KitchenLoginPage({ onConnected }: KitchenLoginPageProps) {
  const { toast } = useToast();
  const [ipInput, setIpInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const qrInstanceRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = useCallback(() => {
    const qr = qrInstanceRef.current;
    qrInstanceRef.current = null;
    if (qr) {
      (async () => {
        try { const st = await qr.getState(); if (st === 2 || st === 3) await qr.stop(); } catch {}
        try { qr.clear(); } catch {}
      })();
    }
    if (scannerRef.current) scannerRef.current.innerHTML = "";
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!scanning || !scannerRef.current || qrInstanceRef.current) return;
    let cancelled = false;
    const el = scannerRef.current;
    const id = "kitchen-ip-scanner-" + Date.now();
    const div = document.createElement("div");
    div.id = id;
    el.innerHTML = "";
    el.appendChild(div);

    (async () => {
      try {
        const qr = new Html5Qrcode(id);
        if (cancelled) return;
        qrInstanceRef.current = qr;
        await qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 120 } },
          (decoded) => {
            const ipMatch = decoded.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (ipMatch) {
              setIpInput(ipMatch[1]);
              toast({ title: "IP Scanned", description: ipMatch[1] });
              stopScanner();
            }
          },
          () => {}
        );
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [scanning, toast, stopScanner]);

  const handleConnect = async (mode: "kitchen" | "display") => {
    const ip = ipInput.trim();
    if (!ip) {
      toast({ title: "Enter Main device IP", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      setMainAppUrl(ip, DEFAULT_SYNC_PORT);
      const ok = await pingMainApp();
      if (!ok) {
        toast({
          title: "Cannot reach Main device",
          description: "Make sure both devices are on the same WiFi/hotspot and the Main app server is running.",
          variant: "destructive",
        });
        return;
      }
      // Store connection info
      localStorage.setItem("kitchen_connection", JSON.stringify({ ip, pin: pinInput, mode }));
      toast({ title: "Connected!", description: `Connected to Main at ${ip}` });
      onConnected(mode);
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ChefHat className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Kitchen Display Login</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to the Main POS device to receive kitchen orders.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* IP Input */}
          <div className="space-y-2">
            <Label>Main Device IP</Label>
            <div className="flex gap-2">
              <Input
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="e.g. 192.168.43.1"
                inputMode="decimal"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => scanning ? stopScanner() : setScanning(true)}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Scanner area */}
          {scanning && (
            <div ref={scannerRef} className="rounded-md border overflow-hidden" style={{ minHeight: 200 }} />
          )}

          {/* PIN Input */}
          <div className="space-y-2">
            <Label>Connection PIN (if required)</Label>
            <Input
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter PIN"
              inputMode="numeric"
              maxLength={6}
            />
          </div>

          {/* Connect Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              className="w-full gap-2"
              onClick={() => void handleConnect("kitchen")}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4" />}
              Connect as Kitchen Staff
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => void handleConnect("display")}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              Connect as Customer Display
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Scan the IP barcode shown on Main device Device Sync page, or enter IP manually. Set/update PIN on Main: Admin → Device Sync.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
