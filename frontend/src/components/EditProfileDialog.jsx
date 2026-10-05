import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eye, EyeOff, Upload, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import ImageUpload from "@/components/ImageUpload";

export default function EditProfileDialog({ open, onOpenChange, profile, onSaved }) {
  const { user: me, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const availableOn = me?.name_change_available_at ? new Date(me.name_change_available_at) : null;
  const canChangeUsername = !availableOn || availableOn.getTime() <= Date.now();

  useEffect(() => {
    if (open && profile) {
      setEmail(me?.email || profile.email || "");
      setName(profile.name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    }
  }, [open, profile, me?.email]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const changes = {};
      const newEmail = email.trim().toLowerCase();
      if (newEmail !== (me?.email || profile.email || "").toLowerCase()) changes.email = newEmail;
      if (name.trim() !== (profile.name || "")) changes.name = name.trim();
      if (bio !== (profile.bio || "")) changes.bio = bio;
      if (Object.keys(changes).length > 0) {
        await api.patch("/auth/me", changes);
      }
      if (avatarUrl !== (profile.avatar_url || "")) {
        await api.patch("/auth/me/avatar", { avatar_url: avatarUrl });
      }
      toast.success("Profile updated");
      await refresh();
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(Array.isArray(detail) ? detail[0]?.msg : detail || "Failed to save");
    }
    setSavingProfile(false);
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (newPw.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (newPw !== confirmPw) { toast.error("Passwords don't match"); return; }
    setSavingPw(true);
    try {
      await api.post("/auth/me/password", { current_password: currentPw, new_password: newPw });
      toast.success("Password changed");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to change password");
    }
    setSavingPw(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#14181f] text-white border-white/10 max-w-lg" data-testid="edit-profile-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Edit Profile</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="mt-2">
          <TabsList className="bg-[#0d0f12] border border-white/10 w-full grid grid-cols-2">
            <TabsTrigger value="profile" data-testid="edit-tab-profile">Profile</TabsTrigger>
            <TabsTrigger value="password" data-testid="edit-tab-password">Password</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-[#0d0f12] border border-white/10 flex items-center justify-center text-slate-500 text-2xl flex-shrink-0">
                  {avatarUrl ? <img src={fileUrl(avatarUrl)} alt="" className="w-full h-full object-cover" /> : (name?.[0] || <UserIcon className="w-8 h-8" />)}
                </div>
                <div className="flex-1">
                  <Label className="text-slate-300 text-xs uppercase tracking-widest">Avatar</Label>
                  <div className="mt-1"><ImageUpload value={avatarUrl} onChange={setAvatarUrl} shape="circle" testid="profile-avatar-upload" /></div>
                </div>
              </div>

              <div>
                <Label className="text-slate-300 text-xs uppercase tracking-widest">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  placeholder="you@example.com"
                  maxLength={254}
                  autoComplete="email"
                  required
                  data-testid="profile-email-input"
                />
              </div>

              <div>
                <Label className="text-slate-300 text-xs uppercase tracking-widest">Username</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="your_username"
                  minLength={2}
                  maxLength={40}
                  pattern="[A-Za-z0-9._-]{2,40}"
                  title="2–40 characters: letters, numbers, dots, underscores, or hyphens"
                  required
                  disabled={!canChangeUsername}
                  data-testid="profile-username-input"
                />
                {!canChangeUsername && availableOn ? (
                  <div className="text-[11px] text-amber-400/80 mt-1" data-testid="username-cooldown-msg">
                    You can change your username again on <span className="font-semibold">{availableOn.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</span>.
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 mt-1">Usernames can be changed once every 30 days.</div>
                )}
              </div>

              <div>
                <Label className="text-slate-300 text-xs uppercase tracking-widest">Bio</Label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Tell others a bit about your taste in films…"
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  data-testid="profile-bio-input"
                />
                <div className="text-xs text-slate-500 text-right mt-1">{bio.length}/500</div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
                <Button type="submit" disabled={savingProfile} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="save-profile-btn">
                  {savingProfile ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <Label className="text-slate-300 text-xs uppercase tracking-widest">Current password</Label>
                <div className="mt-1.5 relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    required
                    className="bg-[#0d0f12] border-white/10 text-white pr-10"
                    data-testid="current-password-input"
                  />
                </div>
              </div>
              <div>
                <Label className="text-slate-300 text-xs uppercase tracking-widest">New password</Label>
                <div className="mt-1.5 relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    minLength={6}
                    className="bg-[#0d0f12] border-white/10 text-white pr-10"
                    data-testid="new-password-input"
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" data-testid="toggle-password-visibility">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-slate-300 text-xs uppercase tracking-widest">Confirm new password</Label>
                <Input
                  type={showPw ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
                  data-testid="confirm-password-input"
                />
                {confirmPw && confirmPw !== newPw && (
                  <div className="text-xs text-rose-400 mt-1">Passwords don't match</div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
                <Button type="submit" disabled={savingPw} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="save-password-btn">
                  {savingPw ? "Saving…" : "Change Password"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
