import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const REPORT_CATEGORIES = [
  { value: "incorrect_info", label: "Incorrect information" },
  { value: "wrong_image", label: "Wrong or broken image" },
  { value: "duplicate", label: "Duplicate entry" },
  { value: "spam_or_abuse", label: "Spam or abusive content" },
  { value: "copyright", label: "Copyright concern" },
  { value: "other", label: "Something else" },
];

export default function ReportDialog({ open, onOpenChange, entityType, entityId, entityTitle }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState("incorrect_info");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to report content"); return; }
    if (!details.trim()) { toast.error("Please describe the issue"); return; }
    setBusy(true);
    const catLabel = REPORT_CATEGORIES.find((c) => c.value === category)?.label || category;
    try {
      const r = await api.post("/threads", {
        title: `[${catLabel}] ${entityTitle}`,
        body: details,
        category: "report",
        entity_type: entityType,
        entity_id: entityId,
        entity_title: entityTitle,
      });
      toast.success("Report submitted");
      onOpenChange(false);
      setDetails("");
      navigate(`/threads/${r.data.id}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to submit"); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-300"><AlertTriangle className="w-5 h-5" /> Report a Problem</DialogTitle>
          <DialogDescription className="text-slate-400">
            Reporting: <span className="text-white">{entityTitle}</span>. Your report becomes a thread that moderators can act on.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-slate-300">Issue type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="report-category-select"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#14181f] text-white border-white/10">
                {REPORT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-300">Details</Label>
            <Textarea rows={5} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe what's wrong so a moderator can fix it..." className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="report-details-input" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={busy} className="bg-rose-500 hover:bg-rose-600 text-white font-semibold" data-testid="report-submit-btn">
              <Flag className="w-4 h-4 mr-2" /> Submit report
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
