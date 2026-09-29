import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send } from "lucide-react";

export default function MessageUserDialog({ open, onOpenChange, targetUser, onSent }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!targetUser) return;
    if (title.trim().length < 3) { toast.error("Subject must be at least 3 characters"); return; }
    setBusy(true);
    try {
      const r = await api.post("/moderation/threads", {
        target_user_id: targetUser.id,
        title: title.trim(),
        body: body.trim(),
      });
      toast.success("Message sent");
      setTitle(""); setBody("");
      onOpenChange(false);
      if (onSent) onSent(r.data);
      else navigate(`/threads/${r.data.id}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to send message");
    }
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    setTitle(""); setBody("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-lg" data-testid="message-user-dialog">
        <DialogHeader>
          <DialogTitle>Message {targetUser?.name || "user"}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Starts a private conversation. Only the recipient and other moderators can see it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-slate-300">Subject</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
              placeholder="e.g. Please review your recent edits"
              required
              data-testid="message-user-subject-input"
            />
          </div>
          <div>
            <Label className="text-slate-300">Message</Label>
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"
              placeholder="Write your message…"
              required
              data-testid="message-user-body-input"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={busy}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              data-testid="message-user-send-btn"
            >
              <Send className="w-4 h-4 mr-2" /> Send message
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              className="border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
