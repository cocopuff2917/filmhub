import { useState, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, AlertTriangle } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      toast.success("Password reset. Please sign in.");
      navigate("/login");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to reset password");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10 hero-radial">
      <div className="w-full max-w-md" data-testid="reset-password-page">
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 items-center justify-center mb-4 shadow-[0_0_25px_rgba(245,158,11,0.4)]">
            <KeyRound className="w-6 h-6 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl tracking-widest text-white">RESET PASSWORD</h1>
          <p className="mt-2 text-sm text-slate-400">Choose a new password for your account</p>
        </div>
        <Card className="glass border-white/10">
          <CardContent className="pt-6">
            {!token ? (
              <div className="space-y-4 text-center" data-testid="reset-password-missing-token">
                <div className="inline-flex w-14 h-14 rounded-full bg-rose-500/15 border border-rose-500/40 items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-rose-400" />
                </div>
                <p className="text-slate-300 text-sm">This reset link is missing its token. Please request a new one.</p>
                <Link
                  to="/forgot-password"
                  className="inline-block text-sm text-amber-400 hover:text-amber-300 font-medium"
                >
                  Request a new link
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="new-password" className="text-slate-300">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoFocus
                    className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                    data-testid="reset-password-new-input"
                  />
                  <p className="mt-1 text-xs text-slate-500">At least 6 characters.</p>
                </div>
                <div>
                  <Label htmlFor="confirm-password" className="text-slate-300">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                    data-testid="reset-password-confirm-input"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  data-testid="reset-password-submit-btn"
                >
                  {loading ? "Resetting..." : "Reset password"}
                </Button>
                <p className="text-center text-sm text-slate-400 pt-2">
                  <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
