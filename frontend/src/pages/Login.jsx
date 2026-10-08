import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Film } from "lucide-react";

export default function Login() {
  const { login, restoreDeletedAccount } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoreAvailable, setRestoreAvailable] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(identifier, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Welcome back!");
      navigate("/");
    } else if (res.restoreRequired) {
      setRestoreAvailable(true);
    } else {
      toast.error(res.error);
    }
  };

  const restoreAccount = async () => {
    setLoading(true);
    const res = await restoreDeletedAccount(identifier, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Account restored. Welcome back!");
      navigate("/");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="auth-shell min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="auth-orb inline-flex w-12 h-12 rounded-xl items-center justify-center mb-4 shadow-[0_0_25px_rgba(245,158,11,0.4)]">
            <Film className="w-6 h-6 text-black" strokeWidth={2.5} />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200">
            member access
          </div>
          <h1 className="mt-4 font-display text-4xl tracking-[0.18em] text-white">SIGN IN</h1>
          <p className="mt-2 text-sm text-slate-400">Continue your cinematic journey</p>
        </div>
        <Card className="auth-panel border border-white/10">
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="identifier" className="text-slate-300">Email or Username</Label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setRestoreAvailable(false); }}
                  required
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  data-testid="login-email-input"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-300">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                    data-testid="login-forgot-password-link"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setRestoreAvailable(false); }}
                  required
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  data-testid="login-password-input"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                data-testid="login-submit-btn"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            {restoreAvailable && (
              <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-500/10 p-4" role="status" data-testid="deleted-account-restore-prompt">
                <p className="text-sm text-amber-100">This account was deleted. You can restore it within 30 days.</p>
                <Button
                  type="button"
                  onClick={restoreAccount}
                  disabled={loading}
                  className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  data-testid="restore-deleted-account-btn"
                >
                  {loading ? "Restoring..." : "Restore Account"}
                </Button>
              </div>
            )}
            <p className="mt-6 text-center text-sm text-slate-400">
              Don't have an account?{" "}
              <Link to="/register" className="text-amber-400 hover:text-amber-300 font-medium" data-testid="login-goto-register">
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
