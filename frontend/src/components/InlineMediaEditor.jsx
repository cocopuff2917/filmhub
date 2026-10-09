import { useEffect, useState } from "react";
import { api, fileUrl, uploadImage } from "@/lib/api";
import ImageUrlInput from "@/components/ImageUrlInput";
import ImageWithFallback from "@/components/ImageWithFallback";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ImageUpload from "@/components/ImageUpload";
import { Camera, Film, Plus, Trash2, Star, StarOff, Upload, Youtube, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { parseYouTubeId } from "@/components/VideosSection";

const isMod = (u) => !!u && (u.role === "admin" || u.role === "moderator" || u.effective_role === "admin" || u.effective_role === "moderator");

/**
 * Inline poster + video editor usable from Movie/Series detail pages.
 * - Everyone can ADD posters/backdrops/videos.
 * - Only moderators/admins can DELETE or REORDER (set primary) posters/backdrops/videos.
 */
export default function InlineMediaEditor({ kind, entity, onUpdated, trigger }) {
  const { user } = useAuth();
  const canMod = isMod(user);
  const isAdmin = !!user && (user.role === "admin" || user.effective_role === "admin");
  const permissions = user?.permissions || [];
  const hasPermission = (permission) => canMod || permissions.includes(permission);
  const canDeletePosters = hasPermission("content.media.poster.delete");
  const canReorderPosters = hasPermission("content.media.poster.reorder");
  const canSetPrimaryPoster = hasPermission("content.media.poster.primary");
  const canDeleteBackdrops = hasPermission("content.media.backdrop.delete");
  const canDeleteGallery = hasPermission("content.media.gallery.delete");
  const canBypassCatalogFreeze = isAdmin || (user?.permissions || []).includes("content.bypass_edit_freeze");
  const [open, setOpen] = useState(false);
  const isActor = kind === "actor";
  const allowImageUrls = kind === "movie" || kind === "series";
  const isCatalogEntity = isActor || allowImageUrls;
  const [contentEditsFrozen, setContentEditsFrozen] = useState(false);
  const [checkingFreeze, setCheckingFreeze] = useState(false);
  const editingPaused = isCatalogEntity && contentEditsFrozen && !canBypassCatalogFreeze;
  const [tab, setTab] = useState(isActor ? "photo" : "poster");

  const [photoUrl, setPhotoUrl] = useState(entity.photo_url || "");
  const [posterUrls, setPosterUrls] = useState(entity.poster_urls || (entity.poster_url ? [entity.poster_url] : []));
  const [backdropUrls, setBackdropUrls] = useState(entity.backdrop_urls || (entity.backdrop_url ? [entity.backdrop_url] : []));
  const [gallery, setGallery] = useState(Array.isArray(entity.gallery) ? entity.gallery : []);
  const [trailerUrl, setTrailerUrl] = useState(entity.trailer_url || "");
  const [videoUrls, setVideoUrls] = useState(Array.isArray(entity.video_urls) ? entity.video_urls : []);
  const [newVideo, setNewVideo] = useState("");
  const [saving, setSaving] = useState(false);

  const locked = new Set(entity.locked_fields || []);
  const base = kind === "series" ? "/series" : kind === "actor" ? "/actors" : "/movies";

  useEffect(() => {
    if (!isCatalogEntity) return undefined;
    let active = true;
    api.get("/moderation/content-edit-freeze")
      .then((response) => { if (active) setContentEditsFrozen(!!response.data.frozen); })
      .catch(() => {});
    return () => { active = false; };
  }, [isCatalogEntity]);

  const resetFromProps = () => {
    setPhotoUrl(entity.photo_url || "");
    setPosterUrls(entity.poster_urls || (entity.poster_url ? [entity.poster_url] : []));
    setBackdropUrls(entity.backdrop_urls || (entity.backdrop_url ? [entity.backdrop_url] : []));
    setGallery(Array.isArray(entity.gallery) ? entity.gallery : []);
    setTrailerUrl(entity.trailer_url || "");
    setVideoUrls(Array.isArray(entity.video_urls) ? entity.video_urls : []);
    setNewVideo("");
  };

  const openDialog = async () => {
    if (isCatalogEntity && !canBypassCatalogFreeze) {
      setCheckingFreeze(true);
      try {
        const response = await api.get("/moderation/content-edit-freeze");
        const frozen = !!response.data.frozen;
        setContentEditsFrozen(frozen);
        if (frozen) {
          toast.error("Catalog editing and creation are temporarily paused");
          return;
        }
      } catch {
        toast.error("Could not verify catalog edit status");
        return;
      } finally {
        setCheckingFreeze(false);
      }
    }
    resetFromProps();
    setOpen(true);
  };

  const savePatch = async (patch, successMsg) => {
    setSaving(true);
    try {
      const r = await api.patch(`${base}/${entity.id}`, patch);
      toast.success(successMsg || "Saved");
      // Reflect what server actually persisted (handles backend guards)
      onUpdated?.(r.data || patch);
      // Sync local state from server response
      if (r?.data) {
        if (typeof r.data.photo_url === "string") setPhotoUrl(r.data.photo_url);
        setPosterUrls(r.data.poster_urls || posterUrls);
        setBackdropUrls(r.data.backdrop_urls || backdropUrls);
        setGallery(r.data.gallery || gallery);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const updateActorPhoto = async (url) => {
    const previousPhoto = photoUrl;
    setPhotoUrl(url);
    try {
      await savePatch({ photo_url: url }, "Actor photo updated");
    } catch {
      setPhotoUrl(previousPhoto);
    }
  };

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
    if (!canMod) { toast.error("Only moderators can remove videos"); return; }
    const next = videoUrls.filter((_, i) => i !== idx);
    try {
      await savePatch({ video_urls: next }, "Video removed");
      setVideoUrls(next);
    } catch {}
  };

  const posterLocked = locked.has("poster_url") || locked.has("poster_urls");
  const photoLocked = locked.has("photo_url");
  const backdropLocked = locked.has("backdrop_url") || locked.has("backdrop_urls");
  const galleryLocked = locked.has("gallery");
  const trailerLocked = locked.has("trailer_url");
  const videosLocked = locked.has("video_urls");

  return (
    <>
      {trigger ? (
        <span
          onClick={editingPaused || checkingFreeze ? undefined : openDialog}
          aria-disabled={editingPaused || checkingFreeze}
          title={editingPaused ? "Catalog editing and creation are paused" : undefined}
        >{trigger}</span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10 hover:text-white"
          onClick={openDialog}
          disabled={editingPaused || checkingFreeze}
          title={editingPaused ? "Catalog editing and creation are paused" : undefined}
          data-testid="inline-media-edit-btn"
        >
          <Camera className="w-4 h-4 mr-2" /> {editingPaused ? "Edit media paused" : "Edit media"}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-3xl" data-testid="inline-media-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit media</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              {isActor
                ? "Update the actor headshot and gallery without leaving the page."
                : "Manage posters, backgrounds, gallery images, and videos. Available controls depend on your assigned permissions."}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-[#0d0f12] border border-white/10">
              {isActor ? (
                <TabsTrigger value="photo" data-testid="media-tab-photo">Headshot</TabsTrigger>
              ) : (
                <>
                  <TabsTrigger value="poster" data-testid="media-tab-poster">Posters</TabsTrigger>
                  <TabsTrigger value="backdrop" data-testid="media-tab-backdrop">Backdrops</TabsTrigger>
                </>
              )}
              <TabsTrigger value="gallery" data-testid="media-tab-gallery">Gallery</TabsTrigger>
              {!isActor && <TabsTrigger value="trailer" data-testid="media-tab-trailer">Trailer</TabsTrigger>}
              {!isActor && <TabsTrigger value="videos" data-testid="media-tab-videos">Videos</TabsTrigger>}
            </TabsList>

            {isActor && (
              <TabsContent value="photo" className="mt-4 space-y-3">
                {photoLocked ? <LockedNotice label="Headshot" /> : (
                  <ImageUpload
                    value={photoUrl}
                    onChange={updateActorPhoto}
                    testid="actor-media-photo-upload"
                    allowUrl
                  />
                )}
              </TabsContent>
            )}

            {/* POSTERS */}
            {!isActor && <TabsContent value="poster" className="mt-4 space-y-3">
              <ImageListEditor
                items={posterUrls}
                aspect="2/3"
                primaryUrl={entity.poster_url}
                saving={saving}
                locked={posterLocked}
                canDelete={canDeletePosters}
                canReorder={canReorderPosters}
                canSetPrimary={canSetPrimaryPoster}
                allowUrl={allowImageUrls}
                testId="poster"
                onAppend={async (url) => {
                  const next = [...posterUrls, url];
                  await savePatch({ poster_urls: next }, "Poster added");
                  setPosterUrls(next);
                }}
                onRemove={async (idx) => {
                  const next = posterUrls.filter((_, i) => i !== idx);
                  await savePatch({ poster_urls: next }, "Poster removed");
                  setPosterUrls(next);
                }}
                onSetPrimary={async (idx) => {
                  const picked = posterUrls[idx];
                  await savePatch({ poster_url: picked }, "Primary poster updated");
                }}
                onMove={async (idx, offset) => {
                  const target = idx + offset;
                  if (target < 0 || target >= posterUrls.length) return;
                  const next = [...posterUrls];
                  [next[idx], next[target]] = [next[target], next[idx]];
                  await savePatch({ poster_urls: next }, "Poster order updated");
                  setPosterUrls(next);
                }}
              />
            </TabsContent>}

            {/* BACKDROPS */}
            {!isActor && <TabsContent value="backdrop" className="mt-4 space-y-3">
              <ImageListEditor
                items={backdropUrls}
                aspect="16/9"
                primaryUrl={entity.backdrop_url}
                saving={saving}
                locked={backdropLocked}
                canDelete={canDeleteBackdrops}
                canReorder={false}
                canSetPrimary={canMod}
                allowUrl={allowImageUrls}
                testId="backdrop"
                onAppend={async (url) => {
                  const next = [...backdropUrls, url];
                  await savePatch({ backdrop_urls: next }, "Backdrop added");
                  setBackdropUrls(next);
                }}
                onRemove={async (idx) => {
                  const next = backdropUrls.filter((_, i) => i !== idx);
                  await savePatch({ backdrop_urls: next }, "Backdrop removed");
                  setBackdropUrls(next);
                }}
                onSetPrimary={async (idx) => {
                  const picked = backdropUrls[idx];
                  await savePatch({ backdrop_url: picked }, "Primary backdrop updated");
                }}
              />
            </TabsContent>}

            {/* TRAILER */}
            <TabsContent value="gallery" className="mt-4 space-y-3">
              <GalleryListEditor
                items={gallery}
                saving={saving}
                locked={galleryLocked}
                canDelete={canDeleteGallery}
                allowUrl={allowImageUrls || isActor}
                onAppend={async (url) => {
                  const next = [...gallery, url];
                  await savePatch({ gallery: next }, "Gallery image added");
                  setGallery(next);
                }}
                onRemove={async (idx) => {
                  const next = gallery.filter((_, i) => i !== idx);
                  await savePatch({ gallery: next }, "Gallery image removed");
                  setGallery(next);
                }}
              />
            </TabsContent>

            {!isActor && <TabsContent value="trailer" className="mt-4 space-y-3">
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
            </TabsContent>}

            {/* VIDEOS */}
            {!isActor && <TabsContent value="videos" className="mt-4 space-y-3">
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
                        {canMod && (
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
                        )}
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
            </TabsContent>}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------
// Shared image list editor (used for posters AND backdrops)
// ---------------------------------------------------------
function ImageListEditor({ items, aspect, primaryUrl, saving, locked, canDelete, canReorder, canSetPrimary, allowUrl = true, testId, onAppend, onRemove, onSetPrimary, onMove }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      await onAppend(url);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#0d0f12] p-4 space-y-4">
      {locked && <LockedNotice label={testId === "poster" ? "Posters" : "Backdrops"} />}

      {!canDelete && !canReorder && !canSetPrimary && items.length > 0 && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-300">
          You can upload additional images. Media controls depend on your assigned permissions.
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-slate-500 text-sm">No {testId === "poster" ? "posters" : "backdrops"} uploaded yet.</div>
      ) : (
        <div className={`grid gap-3 ${aspect === "2/3" ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
          {items.map((url, idx) => (
            <div key={`${url}-${idx}`} className="group relative rounded-lg overflow-hidden border border-white/10 bg-black" data-testid={`${testId}-tile-${idx}`}>
              <ImageWithFallback
                src={fileUrl(url)}
                fallbackSrc={fileUrl(url, "jpeg")}
                alt=""
                className="w-full object-cover"
                style={{ aspectRatio: aspect }}
                fallback={<div className="flex w-full items-center justify-center text-xs text-slate-500" style={{ aspectRatio: aspect }}>Preview unavailable</div>}
              />
              {(url === primaryUrl || (!primaryUrl && idx === 0)) && (
                <div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider" data-testid={`${testId}-primary-${idx}`}>
                  <Star className="w-3 h-3" /> Primary
                </div>
              )}
              {(canDelete || canReorder || canSetPrimary) && !locked && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {canSetPrimary && url !== primaryUrl && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onSetPrimary?.(idx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold disabled:opacity-50"
                      data-testid={`${testId}-make-primary-${idx}`}
                    >
                      <Star className="w-3 h-3" /> Make primary
                    </button>
                  )}
                  {canReorder && idx > 0 && <button type="button" disabled={saving} onClick={() => onMove?.(idx, -1)} title="Move earlier" aria-label="Move poster earlier" className="rounded-md bg-white/15 p-1.5 text-white disabled:opacity-50" data-testid={`${testId}-move-up-${idx}`}><ChevronLeft className="h-4 w-4" /></button>}
                  {canReorder && idx < items.length - 1 && <button type="button" disabled={saving} onClick={() => onMove?.(idx, 1)} title="Move later" aria-label="Move poster later" className="rounded-md bg-white/15 p-1.5 text-white disabled:opacity-50" data-testid={`${testId}-move-down-${idx}`}><ChevronRight className="h-4 w-4" /></button>}
                  {canDelete && <button
                    type="button"
                    disabled={saving}
                    onClick={() => onRemove?.(idx)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold disabled:opacity-50"
                    data-testid={`${testId}-remove-${idx}`}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <label
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border border-white/15 text-white text-sm cursor-pointer hover:bg-white/10 ${(locked || uploading || saving) ? "opacity-50 cursor-not-allowed" : ""}`}
          data-testid={`${testId}-upload-label`}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading…" : `Upload ${testId === "poster" ? "another poster" : "another backdrop"}`}
          <input type="file" accept="image/*" disabled={locked || uploading || saving} onChange={handleFile} className="hidden" data-testid={`${testId}-upload-input`} />
        </label>
        {allowUrl && (
          <div className="mt-3 max-w-lg">
            <ImageUrlInput
              onAdd={onAppend}
              disabled={locked || uploading || saving}
              testid={`${testId}-url`}
              placeholder={`https://example.com/${testId}.jpg`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LockedNotice({ label }) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300" data-testid="locked-notice">
      <span className="font-semibold">{label} is locked.</span> A moderator has restricted this field — only moderators or admins can change it.
    </div>
  );
}

// Gallery editor (no primary concept, 16:9 tiles)
function GalleryListEditor({ items, saving, locked, canDelete, allowUrl = true, onAppend, onRemove }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      await onAppend(url);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#0d0f12] p-4 space-y-4">
      {locked && <LockedNotice label="Gallery" />}
      {!canDelete && items.length > 0 && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-300">
          You can upload additional gallery images. Gallery removal depends on your assigned permissions.
        </div>
      )}
      {items.length === 0 ? (
        <div className="text-slate-500 text-sm">No gallery images uploaded yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="gallery-grid-editor">
          {items.map((url, idx) => (
            <div key={`${url}-${idx}`} className="group relative rounded-lg overflow-hidden border border-white/10 bg-black" data-testid={`gallery-tile-${idx}`}>
              <ImageWithFallback
                src={fileUrl(url)}
                fallbackSrc={fileUrl(url, "jpeg")}
                alt=""
                className="w-full object-cover"
                style={{ aspectRatio: "16/9" }}
                fallback={<div className="flex w-full items-center justify-center text-xs text-slate-500" style={{ aspectRatio: "16/9" }}>Preview unavailable</div>}
              />
              {canDelete && !locked && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onRemove(idx)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold disabled:opacity-50"
                    data-testid={`gallery-remove-${idx}`}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div>
        <label
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border border-white/15 text-white text-sm cursor-pointer hover:bg-white/10 ${(locked || uploading || saving) ? "opacity-50 cursor-not-allowed" : ""}`}
          data-testid="gallery-upload-label"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading…" : "Upload another gallery image"}
          <input type="file" accept="image/*" disabled={locked || uploading || saving} onChange={handleFile} className="hidden" data-testid="gallery-upload-input" />
        </label>
        {allowUrl && (
          <div className="mt-3 max-w-lg">
            <ImageUrlInput
              onAdd={onAppend}
              disabled={locked || uploading || saving}
              testid="gallery-upload-url"
              placeholder="https://example.com/gallery-image.jpg"
            />
          </div>
        )}
      </div>
    </div>
  );
}
