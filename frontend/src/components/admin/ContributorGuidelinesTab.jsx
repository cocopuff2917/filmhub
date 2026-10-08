import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BookOpen, Save } from "lucide-react";

export default function ContributorGuidelinesTab() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/contributor-guidelines")
      .then((response) => setContent(response.data.content || ""))
      .catch(() => toast.error("Could not load contributor guidelines"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const response = await api.put("/contributor-guidelines", { content });
      setContent(response.data.content);
      toast.success("Contributor guidelines saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save contributor guidelines");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-8 text-slate-400">Loading contributor guidelines…</div>;

  return (
    <section className="max-w-4xl space-y-4" data-testid="contributor-guidelines-editor">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-white">
          <BookOpen className="h-5 w-5 text-amber-300" /> Contributor Guidelines
        </h2>
        <Button onClick={save} disabled={saving || !content.trim()} className="bg-amber-500 font-semibold text-black hover:bg-amber-600" data-testid="save-guidelines-btn">
          <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={20}
        maxLength={30000}
        className="min-h-[28rem] bg-[#0d0f12] text-white"
        data-testid="guidelines-content-input"
      />
      <div className="flex justify-between text-xs text-slate-500">
        <span>Line breaks and blank lines are preserved on the public page.</span>
        <span>{content.length}/30000</span>
      </div>
    </section>
  );
}