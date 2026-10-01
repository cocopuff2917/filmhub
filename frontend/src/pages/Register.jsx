import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Film } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await register(email, password, name);
    setLoading(false);
    if (res.ok) {
      toast.success("Account created!");
      navigate("/");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10 hero-radial">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 items-center justify-center mb-4 shadow-[0_0_25px_rgba(245,158,11,0.4)]">
            <Film className="w-6 h-6 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl tracking-widest text-white">JOIN CINEVERSE</h1>
          <p className="mt-2 text-sm text-slate-400">Rate. Review. Remember every film.</p>
        </div>
        <Card className="glass border-white/10">
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-slate-300">Username</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={40}
                  pattern="[A-Za-z0-9._-]{2,40}"
                  title="2–40 characters: letters, numbers, dots, underscores, or hyphens"
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  data-testid="register-name-input"
                />
                <div className="text-[11px] text-slate-500 mt-1">2–40 characters. Letters, numbers, dots, underscores, or hyphens. You can change this once every 30 days.</div>
              </div>
              <div>
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  data-testid="register-email-input"
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  data-testid="register-password-input"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                data-testid="register-submit-btn"
              >
                {loading ? "Creating..." : "Create Account"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-400">
              Already have an account?{" "}
              <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium" data-testid="register-goto-login">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
