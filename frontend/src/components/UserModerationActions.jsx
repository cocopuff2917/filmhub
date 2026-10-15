import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MessageUserDialog from "@/components/MessageUserDialog";
import { Ban, CheckCircle, LoaderCircle, MessageSquare, Network } from "lucide-react";
import { toast } from "sonner";

export default function UserModerationActions({ currentUser, targetUser, onUpdated }) {
  const [messageOpen, setMessageOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [ipsOpen, setIpsOpen] = useState(false);
  const [ips, setIps] = useState(null);
  const [ipsLoading, setIpsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState("7");
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState("days");
  const [reason, setReason] = useState("");

  const permissions = currentUser?.permissions || [];
  const isAdmin = currentUser?.role === "admin" || currentUser?.effective_role === "admin";
  const canMessage = isAdmin || permissions.includes("user.message") || permissions.includes("moderation.messages.read_reply");
  const canSuspend = isAdmin || permissions.includes("user.suspend");
  const canUnsuspend = isAdmin || permissions.includes("user.unsuspend");
  const canViewIps = isAdmin || permissions.includes("user.view_ips");
  const isSelf = currentUser?.id === targetUser.id;
  const isAdminTarget = targetUser.role === "admin";
  const isModeratorTarget = targetUser.role === "moderator";
  const canManageTarget = !isSelf && !isAdminTarget && (isAdmin || !isModeratorTarget);
  const isSuspended = !!targetUser.is_suspended;
  const showMessage = canMessage && !isSelf && !isAdminTarget;
  const showSuspension = canManageTarget && (canSuspend && !isSuspended || canUnsuspend && isSuspended);
  const showActions = showMessage || showSuspension || canViewIps;

  const openIps = async () => {
    setIpsOpen(true);
    if (ips || ipsLoading) return;
    setIpsLoading(true);
    try {
      const response = await api.get(`/moderation/users/${targetUser.id}/ips`);
      setIps(response.data.ips || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load this user's IP addresses");
      setIps([]);
    } finally {
      setIpsLoading(false);
    }
  };

  const updateSuspension = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { reason };
      if (duration === "permanent") {
        body.duration_unit = "permanent";
      } else if (duration === "custom") {
        const amount = Number(customAmount);
        if (!amount || amount <= 0) {
          toast.error(`Enter a valid number of ${customUnit}`);
          setBusy(false);
          return;
        }
        body.duration = amount;
        body.duration_unit = customUnit;
      } else {
        const [amount, unit] = duration.split(":");
        body.duration = Number(amount);
        body.duration_unit = unit || "days";
      }
      await api.post(`/moderation/users/${targetUser.id}/suspend`, body);
      toast.success(isSuspended ? "Suspension updated" : "User suspended");
      setSuspendOpen(false);
      setReason("");
      await onUpdated?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update suspension");
    } finally {
      setBusy(false);
    }
  };

  const unsuspend = async () => {
    if (!window.confirm(`Lift ${targetUser.name}'s suspension?`)) return;
    setBusy(true);
    try {
      await api.post(`/moderation/users/${targetUser.id}/unsuspend`);
      toast.success("Suspension lifted");
      await onUpdated?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not lift suspension");
    } finally {
      setBusy(false);
    }
  };

  if (!showActions) return null;

  return (
    <>
      <div className="ml-auto flex flex-wrap items-center gap-2" data-testid="user-moderation-actions">
        {showMessage && (
          <Button size="sm" variant="outline" onClick={() => setMessageOpen(true)} className="border-amber-500/40 bg-amber-500/5 text-amber-200 hover:bg-amber-500/10" data-testid="profile-message-user">
            <MessageSquare className="mr-1.5 h-4 w-4" /> Message
          </Button>
        )}
        {showSuspension && (isSuspended ? (
          <>
            {canSuspend && <Button size="sm" variant="outline" onClick={() => { setDuration("7"); setReason(""); setSuspendOpen(true); }} disabled={busy} className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10" data-testid="profile-modify-suspension"><Ban className="mr-1.5 h-4 w-4" /> Modify suspension</Button>}
            {canUnsuspend && <Button size="sm" variant="outline" onClick={unsuspend} disabled={busy} className="border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10" data-testid="profile-unsuspend-user"><CheckCircle className="mr-1.5 h-4 w-4" /> Unsuspend</Button>}
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setDuration("7"); setReason(""); setSuspendOpen(true); }} className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10" data-testid="profile-suspend-user"><Ban className="mr-1.5 h-4 w-4" /> Suspend</Button>
        ))}
        {canViewIps && <Button size="sm" variant="outline" onClick={openIps} className="border-white/20 text-slate-200 hover:bg-white/10" data-testid="profile-view-user-ips"><Network className="mr-1.5 h-4 w-4" /> IPs</Button>}
      </div>

      <MessageUserDialog open={messageOpen} onOpenChange={setMessageOpen} targetUser={targetUser} onSent={() => setMessageOpen(false)} />

      <Dialog open={suspendOpen} onOpenChange={(open) => { if (!busy) setSuspendOpen(open); }}>
        <DialogContent className="border-white/10 bg-[#14181f] text-white" data-testid="profile-suspend-dialog">
          <DialogHeader>
            <DialogTitle>{isSuspended ? `Modify suspension for ${targetUser.name}` : `Suspend ${targetUser.name}?`}</DialogTitle>
            <DialogDescription className="text-slate-400">The reason is private and visible only to moderators.</DialogDescription>
          </DialogHeader>
          <form onSubmit={updateSuspension} className="space-y-4">
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="bg-[#0d0f12] text-white" aria-label="Suspension duration"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#14181f] text-white">
                <SelectItem value="1:hours">1 hour</SelectItem>
                <SelectItem value="24:hours">24 hours</SelectItem>
                <SelectItem value="1:days">1 day</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30:days">30 days</SelectItem>
                <SelectItem value="custom">Custom…</SelectItem>
                <SelectItem value="permanent">Permanent</SelectItem>
              </SelectContent>
            </Select>
            {duration === "custom" && (
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <Input type="number" min="1" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder="Amount" aria-label="Custom duration amount" className="bg-[#0d0f12] text-white" />
                <Select value={customUnit} onValueChange={setCustomUnit}>
                  <SelectTrigger className="bg-[#0d0f12] text-white" aria-label="Custom duration unit"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#14181f] text-white">
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Private reason (optional)" className="bg-[#0d0f12] text-white" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSuspendOpen(false)} disabled={busy} className="border-white/20 text-white">Cancel</Button>
              <Button type="submit" disabled={busy} className="bg-rose-600 text-white hover:bg-rose-700">
                {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{isSuspended ? "Save suspension" : "Confirm suspension"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={ipsOpen} onOpenChange={setIpsOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto border-white/10 bg-[#14181f] text-white" data-testid="profile-user-ips-dialog">
          <DialogHeader>
            <DialogTitle>IP addresses for {targetUser.name}</DialogTitle>
            <DialogDescription className="text-slate-400">Recorded sign-in addresses and accounts that share them.</DialogDescription>
          </DialogHeader>
          {ipsLoading ? <div className="py-6 text-sm text-slate-400">Loading IPs…</div> : ips?.length ? (
            <div className="space-y-3">
              {ips.map((entry) => (
                <div key={entry.ip} className="rounded-md border border-white/10 bg-[#0d0f12] p-3">
                  <div className="font-mono text-sm text-amber-300">{entry.ip}</div>
                  <div className="mt-1 text-xs text-slate-400">{entry.count} sign-ins · last {entry.last_seen?.slice(0, 19).replace("T", " ") || "unknown"}</div>
                  {entry.shared_with?.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-2">
                      <p className="mb-2 text-xs text-rose-200">Shared accounts</p>
                      <div className="flex flex-wrap gap-2">
                        {entry.shared_with.map((shared) => <Link key={shared.id} to={`/user/${shared.id}`} onClick={() => setIpsOpen(false)} className="text-xs text-amber-200 hover:underline">{shared.name} ({shared.role})</Link>)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="py-6 text-sm text-slate-400">No IP addresses recorded.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}