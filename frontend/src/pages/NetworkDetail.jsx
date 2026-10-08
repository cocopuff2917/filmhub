import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import SeriesCard from "@/components/SeriesCard";
import ImageUpload from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil, Tv } from "lucide-react";
import { toast } from "sonner";

export default function NetworkDetail() {
  const { network } = useParams();
  const { user } = useAuth();
  const [series, setSeries] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftImage, setDraftImage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setSeries(null);
    setMetadata(null);
    api.get("/series", { params: { network } })
      .then((response) => { if (active) setSeries(response.data || []); })
      .catch(() => { if (active) setSeries([]); });
    api.get(`/series/networks/${encodeURIComponent(network)}`)
      .then((response) => { if (active) setMetadata(response.data); })
      .catch(() => { if (active) setMetadata({ network, description: "", image_url: "" }); });
    return () => { active = false; };
  }, [network]);

  const title = metadata?.network || series?.find((item) => item.network)?.network || network;
  const logo = metadata?.image_url || series?.find((item) => item.network_logo_url)?.network_logo_url;

  const openEditor = () => {
    setDraftDescription(metadata?.description || "");
    setDraftImage(logo || "");
    setEditOpen(true);
  };

  const saveMetadata = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.patch(`/series/networks/${encodeURIComponent(network)}`, {
        description: draftDescription,
        image_url: draftImage,
      });
      setMetadata(response.data);
      setEditOpen(false);
      toast.success("Network updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update network");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#0a0d14]" data-testid="network-detail-page">
      <section className="border-b border-white/10 bg-[#10151d]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link to="/browse?tab=series" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white" data-testid="network-back-to-browse">
            <ArrowLeft className="h-4 w-4" /> Browse TV Series
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-36 flex-shrink-0 items-center justify-center rounded-md border border-white/10 bg-white p-3">
              {logo ? (
                <img src={fileUrl(logo)} alt={`${title} logo`} className="max-h-full max-w-full object-contain" />
              ) : (
                <Tv className="h-8 w-8 text-slate-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">TV Network</div>
              <h1 className="mt-1 font-heading text-3xl font-bold text-white" data-testid="network-title">{title}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {series === null ? "Loading series…" : `${series.length} series`}
              </p>
              <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-300" data-testid="network-description">
                {metadata?.description || "No network description yet."}
              </p>
            </div>
            {user && (
              <Button type="button" variant="outline" onClick={openEditor} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="edit-network-btn">
                <Pencil className="mr-2 h-4 w-4" /> Edit network
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-label={`${title} TV series`}>
        {series === null ? (
          <div className="text-sm text-slate-500">Loading series…</div>
        ) : series.length === 0 ? (
          <div className="border-t border-white/10 py-12 text-center text-sm text-slate-500" data-testid="network-series-empty">
            No TV series are listed for this network yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-6" data-testid="network-series-grid">
            {series.map((item) => <SeriesCard key={item.id} series={item} />)}
          </div>
        )}
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-white/10 bg-[#14181f] text-white sm:max-w-xl">
          <DialogHeader><DialogTitle>Edit {title}</DialogTitle></DialogHeader>
          <form onSubmit={saveMetadata} className="space-y-5">
            <label className="block text-sm font-medium text-slate-300">
              Description
              <Textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                maxLength={2000}
                rows={5}
                className="mt-2 resize-y border-white/10 bg-[#0d0f12] text-white"
                data-testid="network-description-input"
              />
            </label>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-300">Network image</div>
              <ImageUpload value={draftImage} onChange={setDraftImage} testid="network-image-upload" allowUrl />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-amber-500 font-semibold text-black hover:bg-amber-600" data-testid="save-network-btn">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}