import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, Save, Timer } from "lucide-react";
import { toast } from "sonner";

const UNITS = ["minutes", "hours", "days", "months", "years"];

export default function UsernameCooldownTab() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [settings, setSettings] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingUsers(true);
    const timeout = setTimeout(() => {
      api.get("/admin/username-cooldown/users", { params: query.trim() ? { q: query.trim() } : {} })
        .then((response) => { if (active) setUsers(response.data || []); })
        .catch(() => { if (active) toast.error("Could not load users"); })
        .finally(() => { if (active) setLoadingUsers(false); });
    }, 200);
    return () => { active = false; clearTimeout(timeout); };
  }, [query]);

  useEffect(() => {
    if (!selectedUserId) {
      setSettings(null);
      return;
    }
    let active = true;
    setLoadingSettings(true);
    api.get("/admin/username-cooldown", { params: { user_id: selectedUserId } })
      .then((response) => { if (active) setSettings(response.data); })
      .catch((error) => { if (active) toast.error(error.response?.data?.detail || "Could not load this user's cooldown"); })
      .finally(() => { if (active) setLoadingSettings(false); });
    return () => { active = false; };
  }, [selectedUserId]);

  const save = async () => {
    if (!selectedUserId || !settings) return;
    setSaving(true);
    try {
      const response = await api.put("/admin/username-cooldown", {
        user_id: selectedUserId,
        amount: Number(settings.amount),
        unit: settings.unit,
      });
      setSettings((current) => ({ ...current, ...response.data, default_amount: 30, default_unit: "days" }));
      toast.success(`Cooldown override saved for ${response.data.user_name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save username cooldown");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const response = await api.delete(`/admin/username-cooldown/${selectedUserId}`);
      setSettings(response.data);
      toast.success(`Cooldown reset to default for ${response.data.user_name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not reset username cooldown");
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = users.find((user) => user.id === selectedUserId);

  return (
    <section className="max-w-2xl space-y-5" data-testid="username-cooldown-editor">
      <div className="flex items-center gap-2">
        <Timer className="h-5 w-5 text-amber-300" />
        <h2 className="font-heading text-lg font-bold text-white">Username Change Cooldown</h2>
      </div>

      <div className="space-y-3 rounded-md border border-white/10 bg-[#0d0f12] p-4">
        <div>
          <Label htmlFor="username-cooldown-user-search" className="text-slate-300">Find a user</Label>
          <Input
            id="username-cooldown-user-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by username or email"
            className="mt-1.5 bg-[#14181f] text-white"
            data-testid="username-cooldown-user-search"
          />
        </div>
        <div>
          <Label className="text-slate-300">User</Label>
          <Select value={selectedUserId || "__choose__"} onValueChange={(value) => setSelectedUserId(value === "__choose__" ? "" : value)}>
            <SelectTrigger className="mt-1.5 bg-[#14181f] text-white" data-testid="username-cooldown-user-select">
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__choose__">Select a user</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>{user.name || "Unnamed user"} · {user.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loadingUsers && <p className="mt-1 text-xs text-slate-500">Searching users…</p>}
          {!loadingUsers && query.trim() && users.length === 0 && <p className="mt-1 text-xs text-slate-500">No users found.</p>}
        </div>
      </div>

      {!selectedUserId ? (
        <p className="text-sm text-slate-400">Select a user to configure an individual override. Everyone else keeps the default 30-day cooldown.</p>
      ) : loadingSettings || !settings ? (
        <div className="py-4 text-sm text-slate-400">Loading selected user…</div>
      ) : (
        <div className="space-y-4 rounded-md border border-white/10 bg-[#0d0f12] p-4" data-testid="username-cooldown-user-settings">
          <div>
            <p className="font-semibold text-white">{selectedUser?.name || settings.user_name}</p>
            <p className="text-xs text-slate-500">{selectedUser?.email}</p>
          </div>
          <p className="text-sm text-slate-400">
            {settings.has_override ? "This user has an individual cooldown override." : "This user currently uses the default 30-day cooldown."}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28 space-y-1.5">
              <Label htmlFor="username-cooldown-amount" className="text-slate-300">Interval</Label>
              <Input
                id="username-cooldown-amount"
                type="number"
                min="0"
                max="1200"
                step="1"
                value={settings.amount}
                onChange={(event) => setSettings({ ...settings, amount: Number(event.target.value) })}
                className="bg-[#14181f] text-white"
                data-testid="username-cooldown-amount"
              />
            </div>
            <div className="w-40 space-y-1.5">
              <Label className="text-slate-300">Unit</Label>
              <Select value={settings.unit} onValueChange={(unit) => setSettings({ ...settings, unit })}>
                <SelectTrigger className="bg-[#14181f] text-white" data-testid="username-cooldown-unit"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit[0].toUpperCase() + unit.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={save} disabled={saving} className="bg-amber-500 font-semibold text-black hover:bg-amber-600" data-testid="save-username-cooldown-btn">
              <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save override"}
            </Button>
            {settings.has_override && (
              <Button type="button" variant="outline" onClick={reset} disabled={saving} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="reset-username-cooldown-btn">
                <RotateCcw className="mr-1 h-4 w-4" /> Reset to default
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">Use 0 to allow this user to change their username at any time. This does not affect other users.</p>
        </div>
      )}
    </section>
  );
}