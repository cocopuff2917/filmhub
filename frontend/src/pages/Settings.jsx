import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Ban, LockKeyhole, Settings2, Undo2, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections = ["security", "blocked"];

export default function Settings() {
  const { user, initializing, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedSection = params.get("section");
  const section = sections.includes(requestedSection) ? requestedSection : "security";
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [unblockingId, setUnblockingId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [email, setEmail] = useState(user?.email || "");
  const [savingEmail, setSavingEmail] = useState(false);
  const userId = user?.id;

  useEffect(() => { setEmail(user?.email || ""); }, [user?.email]);

  useEffect(() => {
    if (!userId) {
      setLoadingBlocks(false);
      return undefined;
    }
    let active = true;
    api.get("/users/blocked")
      .then((response) => { if (active) setBlockedUsers(response.data); })
      .catch((error) => { if (active) toast.error(error.response?.data?.detail || "Could not load blocked users"); })
      .finally(() => { if (active) setLoadingBlocks(false); });
    return () => { active = false; };
  }, [userId]);

  const changeSection = (value) => {
    const next = new URLSearchParams(params);
    if (value === "security") next.delete("section");
    else next.set("section", value);
    setParams(next, { replace: true });
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/auth/me/password", { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update password");
    } finally {
      setSavingPassword(false);
    }
  };

  const changeEmail = async (event) => {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (nextEmail === (user?.email || "").toLowerCase()) return;
    setSavingEmail(true);
    try {
      await api.patch("/auth/me", { email: nextEmail });
      await refresh();
      toast.success("Email address updated");
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(Array.isArray(detail) ? detail[0]?.msg : detail || "Could not update email address");
    } finally {
      setSavingEmail(false);
    }
  };

  const unblockUser = async (blockedUser) => {
    setUnblockingId(blockedUser.id);
    try {
      await api.delete(`/users/blocked/${blockedUser.id}`);
      setBlockedUsers((current) => current.filter((item) => item.id !== blockedUser.id));
      toast.success(`${blockedUser.name} unblocked`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not unblock user");
    } finally {
      setUnblockingId("");
    }
  };

  if (initializing) return <main className="min-h-[calc(100vh-64px)] bg-[#0d0f12]" />;
  if (!user) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-[#0d0f12] px-4 py-20 text-center text-slate-300">
        <Settings2 className="mx-auto h-8 w-8 text-amber-400" />
        <h1 className="mt-4 font-heading text-2xl font-bold text-white">Account settings</h1>
        <p className="mt-2 text-sm">Sign in to manage your account.</p>
        <Link to="/login" className="mt-5 inline-block text-sm font-medium text-amber-400 hover:text-amber-300">Sign in</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0f12] text-white" data-testid="account-settings-page">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <Settings2 className="h-6 w-6 text-amber-400" aria-hidden="true" />
            <h1 className="font-heading text-2xl font-bold">Account settings</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">Security and blocked accounts.</p>
        </header>

        <Tabs value={section} onValueChange={changeSection} className="mt-6">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-white/10 bg-transparent p-0">
            <TabsTrigger value="security" className="rounded-none border-b-2 border-transparent px-4 py-3 text-slate-400 data-[state=active]:border-amber-400 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none">
              <LockKeyhole className="mr-2 h-4 w-4" /> Security
            </TabsTrigger>
            <TabsTrigger value="blocked" className="rounded-none border-b-2 border-transparent px-4 py-3 text-slate-400 data-[state=active]:border-amber-400 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none">
              <Ban className="mr-2 h-4 w-4" /> Blocked users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="mt-0 max-w-2xl py-7">
            <div className="border-b border-white/10 pb-6">
              <h2 className="text-lg font-semibold">Email address</h2>
              <p className="mt-1 text-sm text-slate-400">Update the email address used to sign in and recover your account.</p>
              <form onSubmit={changeEmail} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="settings-email" className="text-slate-300">Email</Label>
                  <Input id="settings-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-1.5 border-white/10 bg-white/5 text-white" data-testid="settings-email-input" />
                </div>
                <Button type="submit" disabled={savingEmail || !email.trim() || email.trim().toLowerCase() === (user.email || "").toLowerCase()} className="bg-amber-500 text-black hover:bg-amber-400" data-testid="settings-save-email">
                  {savingEmail ? "Saving…" : "Update email"}
                </Button>
              </form>
            </div>
            <div className="pt-6">
              <h2 className="text-lg font-semibold">Change password</h2>
              <p className="mt-1 text-sm text-slate-400">Choose a new password for your account.</p>
              <form onSubmit={changePassword} className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="current-password" className="text-slate-300">Current password</Label>
                  <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className="mt-1.5 border-white/10 bg-white/5 text-white" data-testid="settings-current-password" />
                </div>
                <div>
                  <Label htmlFor="settings-new-password" className="text-slate-300">New password</Label>
                  <Input id="settings-new-password" type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required className="mt-1.5 border-white/10 bg-white/5 text-white" data-testid="settings-new-password" />
                </div>
                <div>
                  <Label htmlFor="confirm-password" className="text-slate-300">Confirm new password</Label>
                  <Input id="confirm-password" type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className="mt-1.5 border-white/10 bg-white/5 text-white" data-testid="settings-confirm-password" />
                </div>
                <Button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword} className="bg-amber-500 text-black hover:bg-amber-400" data-testid="settings-change-password">
                  {savingPassword ? "Updating…" : "Update password"}
                </Button>
              </form>
              <p className="mt-4 text-sm text-slate-500">Forgot your current password? <Link to="/forgot-password" className="text-amber-400 hover:text-amber-300">Reset it by email</Link>.</p>
            </div>
          </TabsContent>

          <TabsContent value="blocked" className="mt-0 py-7">
            <div className="flex items-center gap-3 border-b border-white/10 pb-5">
              <UserRoundX className="h-5 w-5 text-amber-400" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-semibold">Blocked users</h2>
                <p className="mt-1 text-sm text-slate-400">Their public discussions, replies, and comments are hidden from you.</p>
              </div>
            </div>
            {loadingBlocks ? <p className="py-6 text-sm text-slate-400">Loading blocked users…</p> : blockedUsers.length ? (
              <ul className="divide-y divide-white/10">
                {blockedUsers.map((blockedUser) => (
                  <li key={blockedUser.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1e2430] text-xs text-slate-300">
                        {blockedUser.avatar_url ? <img src={fileUrl(blockedUser.avatar_url)} alt="" className="h-full w-full object-cover" /> : blockedUser.name?.[0] || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{blockedUser.name}</p>
                        <p className="text-xs text-slate-500">Blocked {blockedUser.blocked_at ? new Date(blockedUser.blocked_at).toLocaleDateString() : ""}</p>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={unblockingId === blockedUser.id} onClick={() => unblockUser(blockedUser)} className="flex-shrink-0 border-white/20 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white" data-testid={`unblock-user-${blockedUser.id}`}>
                      <Undo2 className="mr-2 h-4 w-4" /> Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
                <Ban className="h-5 w-5" /> No blocked users.
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </main>
  );
}
