import { useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Film, Plus, Trash2, Youtube } from "lucide-react";
import { toast } from "sonner";
import ImageUpload from "@/components/ImageUpload";
import { parseYouTubeId } from "@/components/VideosSection";

/**
 * Inline poster + video editor usable from Movie/Series detail pages.
 * Props:
 *  - kind: "movie" | "series"
 *  - entity: the current enriched doc (needs .id, .poster_url, .backdrop_url, .trailer_url, .video_urls, .locked_fields)
 *  - onUpdated(partial): called with the saved patch so parent can merge locally
 *  - trigger (optional): custom trigger button; otherwise a default pill button is rendered
 */
export default function InlineMediaEditor({ kind, entity, onUpdated, trigger }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("poster");

  const [posterUrl, setPosterUrl] = useState(entity.poster_url || "");
  const [backdropUrl, setBackdropUrl] = useState(entity.backdrop_url || "");
  const [trailerUrl, setTrailerUrl] = useState(entity.trailer_url || "");
  const [videoUrls, setVideoUrls] = useState(Array.isArray(entity.video_urls) ? entity.video_urls : []);
  const [newVideo, setNewVideo] = useState("");
  const [saving, setSaving] = useState(false);

  const locked = new Set(entity.locked_fields || []);
  const base = kind === "series" ? "/series" : `/movies`;

  const resetFromProps = () => {
    setPosterUrl(entity.poster_url || "");
    setBackdropUrl(entity.backdrop_url || "");
    setTrailerUrl(entity.trailer_url || "");
    setVideoUrls(Array.isArray(entity.video_urls) ? entity.video_urls : []);
    setNewVideo("");
  };

  const openDialog = () => { resetFromProps(); setOpen(true); };

  const savePatch = async (patch, successMsg) => {
    setSaving(true);
    try {
      await api.patch(`${base}/${entity.id}`, patch);
      toast.success(successMsg || "Saved");
      onUpdated?.(patch);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const savePoster = async () => { await savePatch({ poster_url: posterUrl }, "Poster updated"); };
  const saveBackdrop = async () => { await savePatch({ backdrop_url: backdropUrl }, "Backdrop updated"); };
  const saveTrailer = async () => { await savePatch({ trailer_url: trailerUrl }, "Trailer updated"); };

  const addVideo = async () => {
    const url = newVideo.trim();
    if (!url) return;
    if (!parseYouTubeId(url)) { toast.error("Please paste a valid YouTube URL"); return; }
    if (videoUrls.includes(url)) { toast("That video is already in the list"); return; }
    const next = [...videoUrls, url];
    try {
      await savePatch({ video_urls: next }, "Video added");
      setVideoUrls(next);
      setNewVideo("");
    } catch {}
  };

  const removeVideo = async (idx) => {
    const next = videoUrls.filter((_, i) => i !== idx);
    try {
      await savePatch({ video_urls: next }, "Video removed");
      setVideoUrls(next);
    } catch {}
  };

  const posterLocked = locked.has("poster_url");
  const backdropLocked = locked.has("backdrop_url");
  const trailerLocked = locked.has("trailer_url");
  const videosLocked = locked.has("video_urls");

  return (
    <>
      {trigger ? (
        <span onClick={openDialog}>{trigger}</span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10 hover:text-white"
          onClick={openDialog}
          data-testid="inline-media-edit-btn"
        >
          <Camera className="w-4 h-4 mr-2" /> Edit media
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-xl" data-testid="inline-media-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit media</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Quickly update the poster, backdrop, trailer, or additional videos — no need to open the full edit page.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-[#0d0f12] border border-white/10">
              <TabsTrigger value="poster" data-testid="media-tab-poster">Poster</TabsTrigger>
              <TabsTrigger value="backdrop" data-testid="media-tab-backdrop">Backdrop</TabsTrigger>
              <TabsTrigger value="trailer" data-testid="media-tab-trailer">Trailer</TabsTrigger>
              <TabsTrigger value="videos" data-testid="media-tab-videos">Videos</TabsTrigger>
            </TabsList>

            {/* POSTER */}
            <TabsContent value="poster" className="mt-4 space-y-3">
              {posterLocked && <LockedNotice label="Poster" />}
              <div className="rounded-lg border border-white/10 bg-[#0d0f12] p-4">
                <ImageUpload
                  value={posterUrl}
                  onChange={(v) => setPosterUrl(v)}
                  testid="inline-poster-upload"
                  canDelete={!posterLocked}
                />
                <div className="flex justify-end mt-4">
                  <Button
                    disabled={saving || posterLocked}
                    onClick={savePoster}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    data-testid="save-poster-btn"
                  >
                    Save poster
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* BACKDROP */}
            <TabsContent value="backdrop" className="mt-4 space-y-3">
              {backdropLocked && <LockedNotice label="Backdrop" />}
              <div className="rounded-lg border border-white/10 bg-[#0d0f12] p-4">
                <ImageUpload
                  value={backdropUrl}
                  onChange={(v) => setBackdropUrl(v)}
                  testid="inline-backdrop-upload"
                  canDelete={!backdropLocked}
                />
                <div className="flex justify-end mt-4">
                  <Button
                    disabled={saving || backdropLocked}
                    onClick={saveBackdrop}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    data-testid="save-backdrop-btn"
                  >
                    Save backdrop
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* TRAILER */}
            <TabsContent value="trailer" className="mt-4 space-y-3">
              {trailerLocked && <LockedNotice label="Trailer" />}
              <div className="rounded-lg border border-white/10 bg-[#0d0f12] p-4 space-y-3">
                <label className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2"><Youtube className="w-3.5 h-3.5 text-rose-400" /> Official Trailer URL</label>
                <Input
                  value={trailerUrl}
                  onChange={(e) => setTrailerUrl(e.target.value)}
                  disabled={trailerLocked}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="bg-[#14181f] border-white/10 text-white"
                  data-testid="inline-trailer-input"
                />
                <div className="flex justify-end">
                  <Button
                    disabled={saving || trailerLocked}
                    onClick={saveTrailer}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    data-testid="save-trailer-btn"
                  >
                    Save trailer
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* VIDEOS */}
            <TabsContent value="videos" className="mt-4 space-y-3">
              {videosLocked && <LockedNotice label="Videos" />}
              <div className="rounded-lg border border-white/10 bg-[#0d0f12] p-4 space-y-3">
                <label className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2"><Film className="w-3.5 h-3.5 text-amber-400" /> Additional YouTube videos</label>

                {videoUrls.length === 0 ? (
                  <div className="text-xs text-slate-500">No additional videos yet.</div>
                ) : (
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                    {videoUrls.map((v, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs rounded bg-[#14181f] border border-white/5 px-2.5 py-1.5" data-testid={`inline-video-${idx}`}>
                        <Youtube className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                        <span className="truncate flex-1">{v}</span>
                        <button
                          type="button"
                          onClick={() => removeVideo(idx)}
                          disabled={videosLocked || saving}
                          className="text-rose-400 hover:text-rose-300 disabled:opacity-30"
                          aria-label="Remove"
                          data-testid={`inline-video-remove-${idx}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    value={newVideo}
                    onChange={(e) => setNewVideo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addVideo())}
                    placeholder="Paste a YouTube URL and press +"
                    disabled={videosLocked || saving}
                    className="bg-[#14181f] border-white/10 text-white"
                    data-testid="inline-video-input"
                  />
                  <Button
                    type="button"
                    disabled={!newVideo.trim() || saving || videosLocked}
                    onClick={addVideo}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold flex-shrink-0"
                    data-testid="add-video-btn"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LockedNotice({ label }) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300" data-testid="locked-notice">
      <span className="font-semibold">{label} is locked.</span> A moderator has restricted this field — only moderators or admins can change it.
    </div>
  );
}
