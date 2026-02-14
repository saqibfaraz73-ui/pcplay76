import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { isAdminRegistered, registerAdmin, getSecurityQuestion, verifySecurityAnswer, masterReset } from "@/auth/auth";
import appLogo from "@/assets/app-logo.jpg";

const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your favorite food?",
  "What was your childhood nickname?",
];

type Screen = "checking" | "register" | "login" | "forgot" | "master-reset";

export default function Login() {
  const { toast } = useToast();
  const { login, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [screen, setScreen] = React.useState<Screen>("checking");
  const [loading, setLoading] = React.useState(false);

  // Login fields
  const [identifier, setIdentifier] = React.useState("");
  const [credential, setCredential] = React.useState("");

  // Registration fields
  const [regName, setRegName] = React.useState("");
  const [regPhone, setRegPhone] = React.useState("");
  const [regPassword, setRegPassword] = React.useState("");
  const [regConfirm, setRegConfirm] = React.useState("");
  const [regQuestion, setRegQuestion] = React.useState(SECURITY_QUESTIONS[0]);
  const [regAnswer, setRegAnswer] = React.useState("");

  // Forgot password fields
  const [securityQuestion, setSecurityQuestion] = React.useState("");
  const [forgotAnswer, setForgotAnswer] = React.useState("");
  const [recoveredPassword, setRecoveredPassword] = React.useState<string | null>(null);

  // Master reset
  const [masterPin, setMasterPin] = React.useState("");

  // 7-tap super login
  const logoTapCount = React.useRef(0);
  const logoTapTimer = React.useRef<ReturnType<typeof setTimeout>>();

  const handleLogoTap = () => {
    logoTapCount.current += 1;
    clearTimeout(logoTapTimer.current);
    if (logoTapCount.current >= 7) {
      logoTapCount.current = 0;
      navigate("/super-admin");
      return;
    }
    logoTapTimer.current = setTimeout(() => {
      logoTapCount.current = 0;
    }, 2000);
  };

  React.useEffect(() => {
    (async () => {
      const registered = await isAdminRegistered();
      setScreen(registered ? "login" : "register");
    })();
  }, []);

  React.useEffect(() => {
    if (!session) return;
    const dest = session.role === "admin" ? "/admin" : session.role === "waiter" ? "/pos/tables" : "/pos";
    navigate(dest, { replace: true });
  }, [navigate, session]);

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim() || !regPassword.trim()) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    if (regPassword !== regConfirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (regPassword.length < 4) {
      toast({ title: "Password must be at least 4 characters", variant: "destructive" });
      return;
    }
    if (!regAnswer.trim()) {
      toast({ title: "Security answer is required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await registerAdmin(regName, regPhone, regPassword, regQuestion, regAnswer);
      const result = await login({ identifier: regPhone.trim(), credential: regPassword.trim() });
      if (result.ok) {
        toast({ title: "Welcome!", description: "Admin account created successfully." });
      }
    } catch (err: any) {
      toast({ title: "Registration failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login({ identifier, credential });
      if (!result.ok) {
        toast({ title: "Login failed", description: "Wrong credentials." });
        return;
      }
      const from = (location.state as any)?.from as string | undefined;
      if (result.role === "admin") { navigate("/admin", { replace: true }); return; }
      if (result.role === "waiter") { navigate("/pos/tables", { replace: true }); return; }
      const safeFrom = from && from !== "/login" && from !== "/admin" ? from : undefined;
      navigate(safeFrom ?? "/pos", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const openForgot = async () => {
    const q = await getSecurityQuestion();
    if (!q) {
      toast({ title: "No security question set", variant: "destructive" });
      return;
    }
    setSecurityQuestion(q);
    setForgotAnswer("");
    setRecoveredPassword(null);
    setScreen("forgot");
  };

  const onVerifyAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await verifySecurityAnswer(forgotAnswer);
      if (!result.ok) {
        toast({ title: "Wrong answer", description: "Security answer does not match.", variant: "destructive" });
      } else {
        setRecoveredPassword(result.password);
      }
    } finally {
      setLoading(false);
    }
  };

  const onMasterReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const ok = await masterReset(masterPin);
      if (!ok) {
        toast({ title: "Wrong PIN", description: "Master reset PIN is incorrect.", variant: "destructive" });
      } else {
        toast({ title: "App reset", description: "Admin account cleared. Please register again." });
        setScreen("register");
      }
    } finally {
      setLoading(false);
      setMasterPin("");
    }
  };

  if (screen === "checking") return null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-lg flex-col items-center justify-center px-4">
      {/* Logo — tap 7 times to open super admin */}
      <div className="mb-6 flex flex-col items-center">
        <div
          className="h-20 w-20 overflow-hidden rounded-xl border-2 border-primary/20 shadow-lg cursor-pointer select-none"
          onClick={handleLogoTap}
        >
          <img src={appLogo} alt="SANGI POS logo" className="h-full w-full object-cover" loading="eager" draggable={false} />
        </div>
        <h1 className="mt-3 text-2xl font-bold">SANGI POS</h1>
        <p className="text-sm text-muted-foreground">Offline POS</p>
      </div>

      {/* REGISTER */}
      {screen === "register" && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Setup Admin Account</CardTitle>
            <CardDescription>Create your admin account to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="regName">Your Name</Label>
                <Input id="regName" value={regName} onChange={(e) => setRegName(e.target.value)} autoComplete="off" placeholder="e.g. Ahmad" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regPhone">Phone Number</Label>
                <Input id="regPhone" inputMode="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} autoComplete="off" placeholder="e.g. 03001234567" />
                <p className="text-xs text-muted-foreground">You'll use this phone number to log in.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="regPassword">Password</Label>
                <Input id="regPassword" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} autoComplete="off" placeholder="Min 4 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regConfirm">Confirm Password</Label>
                <Input id="regConfirm" type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} autoComplete="off" />
              </div>
              {regPassword && regConfirm && regPassword !== regConfirm && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="regQuestion">Security Question</Label>
                <select id="regQuestion" value={regQuestion} onChange={(e) => setRegQuestion(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Used to recover your password if you forget it.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="regAnswer">Your Answer</Label>
                <Input id="regAnswer" value={regAnswer} onChange={(e) => setRegAnswer(e.target.value)} autoComplete="off" placeholder="Your answer" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Setting up..." : "Create Admin Account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* LOGIN */}
      {screen === "login" && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>Admin: phone + password · Staff: name or phone + PIN</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Phone / Name</Label>
                <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="off" placeholder="Admin phone or staff name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="credential">Password / PIN</Label>
                <Input id="credential" type="password" value={credential} onChange={(e) => setCredential(e.target.value)} autoComplete="off" placeholder="Password or 4-digit PIN" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logging in..." : "Enter"}
              </Button>
              <div className="flex justify-center">
                <Button type="button" variant="link" className="text-xs" onClick={openForgot}>
                  Forgot password?
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* FORGOT PASSWORD */}
      {screen === "forgot" && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Recover Password</CardTitle>
            <CardDescription>Answer your security question to see your password.</CardDescription>
          </CardHeader>
          <CardContent>
            {!recoveredPassword ? (
              <form onSubmit={onVerifyAnswer} className="space-y-4">
                <div className="rounded-md border bg-muted/50 p-3">
                  <p className="text-sm font-medium">{securityQuestion}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgotAnswer">Your Answer</Label>
                  <Input id="forgotAnswer" value={forgotAnswer} onChange={(e) => setForgotAnswer(e.target.value)} autoComplete="off" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Checking..." : "Verify"}
                </Button>
                <div className="flex justify-between">
                  <Button type="button" variant="link" className="text-xs" onClick={() => setScreen("login")}>
                    Back to login
                  </Button>
                  <Button type="button" variant="link" className="text-xs text-destructive" onClick={() => setScreen("master-reset")}>
                    Master Reset
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Your admin password is:</p>
                  <p className="text-2xl font-bold font-mono tracking-wider">{recoveredPassword}</p>
                </div>
                <Button className="w-full" onClick={() => { setRecoveredPassword(null); setScreen("login"); }}>
                  Back to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MASTER RESET */}
      {screen === "master-reset" && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Master Reset</CardTitle>
            <CardDescription>Enter the 6-digit master PIN to reset admin account. This will delete all login accounts. Your data (orders, products, etc.) will NOT be affected.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onMasterReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="masterPin">Master PIN</Label>
                <Input id="masterPin" inputMode="numeric" maxLength={6} value={masterPin} onChange={(e) => setMasterPin(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="off" placeholder="6-digit PIN" />
                <p className="text-xs text-muted-foreground">Default master PIN: 999999</p>
              </div>
              <Button type="submit" className="w-full" variant="destructive" disabled={loading}>
                {loading ? "Resetting..." : "Reset Admin Account"}
              </Button>
              <Button type="button" variant="link" className="w-full text-xs" onClick={() => setScreen("forgot")}>
                Back
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
