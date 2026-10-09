import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import ImageUpload from "@/components/ImageUpload";

export default function EditProfileDialog({ open, onOpenChange, profile, onSaved }) {
  const { user: me, refresh } = useAuth();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const availableOn = me?.name_change_available_at ? new Date(me.name_change_available_at) : null;
  const canChangeUsername = !availableOn || availableOn.getTime() <= Date.now();
  const cooldownAmount = me?.username_cooldown_amount ?? 30;
  const cooldownUnit = me?.username_cooldown_unit || "days";
  const cooldownLabel = `${cooldownAmount} ${cooldownAmount === 1 ? cooldownUnit.slice(0, -1) : cooldownUnit}`;

  useEffect(() => {
    if (open && profile) {
      setName(profile.name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [open, profile]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const changes = {};
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#14181f] text-white border-white/10 max-w-lg" data-testid="edit-profile-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Edit Profile</DialogTitle>
        </DialogHeader>

        <form onSubmit={saveProfile} className="mt-4 space-y-4">
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
                  <div className="text-[11px] text-slate-500 mt-1">
                    {cooldownAmount === 0 ? "Usernames can be changed at any time." : `Usernames can be changed once every ${cooldownLabel}.`}
                  </div>
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
      </DialogContent>
    </Dialog>
  );
}
