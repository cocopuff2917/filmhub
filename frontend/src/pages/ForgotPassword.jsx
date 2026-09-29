import { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Something went wrong");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10 hero-radial">
      <div className="w-full max-w-md" data-testid="forgot-password-page">
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 items-center justify-center mb-4 shadow-[0_0_25px_rgba(245,158,11,0.4)]">
            <KeyRound className="w-6 h-6 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl tracking-widest text-white">FORGOT PASSWORD</h1>
          <p className="mt-2 text-sm text-slate-400">
            {sent
              ? "Check your inbox for reset instructions"
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>
        <Card className="glass border-white/10">
          <CardContent className="pt-6">
            {sent ? (
              <div className="space-y-5 text-center" data-testid="forgot-password-success">
                <div className="inline-flex w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 items-center justify-center">
                  <MailCheck className="w-7 h-7 text-emerald-400" />
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  If an account exists for <span className="text-white font-medium">{email}</span>,
                  a reset link has been sent. The link expires in 60 minutes.
                </p>
                <p className="text-xs text-slate-500">
                  Didn't get it? Check spam, or{" "}
                  <button
                    type="button"
                    onClick={() => setSent(false)}
                    className="text-amber-400 hover:text-amber-300 font-medium"
                    data-testid="forgot-password-resend-btn"
                  >
                    try another email
                  </button>
                  .
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 font-medium"
                  data-testid="forgot-password-back-to-login"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-slate-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                    data-testid="forgot-password-email-input"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  data-testid="forgot-password-submit-btn"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
                <p className="text-center text-sm text-slate-400 pt-2">
                  Remembered it?{" "}
                  <Link
                    to="/login"
                    className="text-amber-400 hover:text-amber-300 font-medium"
                    data-testid="forgot-password-signin-link"
                  >
                    Sign in
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
