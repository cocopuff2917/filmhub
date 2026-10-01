import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlayCircle, Youtube } from "lucide-react";

/**
 * Extract a YouTube video id from a variety of URL shapes.
 * Accepts:
 *  - https://www.youtube.com/watch?v=VIDEO
 *  - https://youtu.be/VIDEO
 *  - https://www.youtube.com/embed/VIDEO
 *  - https://www.youtube.com/shorts/VIDEO
 *  - raw VIDEO id
 */
export function parseYouTubeId(input) {
  if (!input) return "";
  const s = String(input).trim();
  const idMatch = /^[a-zA-Z0-9_-]{11}$/;
  if (idMatch.test(s)) return s;
  try {
    const u = new URL(s);
    const v = u.searchParams.get("v");
    if (v && idMatch.test(v)) return v;
    const parts = u.pathname.split("/").filter(Boolean);
    // youtu.be/VIDEO
    if (u.hostname.includes("youtu.be") && parts[0] && idMatch.test(parts[0])) return parts[0];
    // /embed/VIDEO or /shorts/VIDEO or /v/VIDEO
    const known = ["embed", "shorts", "v"];
    const idx = parts.findIndex((p) => known.includes(p));
    if (idx >= 0 && parts[idx + 1] && idMatch.test(parts[idx + 1])) return parts[idx + 1];
  } catch { /* not a URL */ }
  // Fallback: look for a bare 11-char token
  const m = s.match(/[a-zA-Z0-9_-]{11}/);
  return m ? m[0] : "";
}

export default function VideosSection({ trailerUrl, videoUrls = [], titleFallback = "Trailer", testIdPrefix = "video" }) {
  const [open, setOpen] = useState(null); // { id, label } | null

  const items = useMemo(() => {
    const raw = [];
    if (trailerUrl) raw.push({ url: trailerUrl, label: "Official Trailer" });
    (videoUrls || []).forEach((u, idx) => raw.push({ url: u, label: `Video ${idx + 1}` }));
    const seen = new Set();
    return raw
      .map((r) => ({ ...r, id: parseYouTubeId(r.url) }))
      .filter((r) => r.id && !seen.has(r.id) && (seen.add(r.id), true));
  }, [trailerUrl, videoUrls]);

  if (items.length === 0) return null;

  return (
    <section className="mt-12" data-testid="videos-section">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Youtube className="w-6 h-6 text-rose-400" /> Videos <span className="text-slate-500 text-lg font-normal">{items.length}</span>
        </h2>
      </div>

      <div className="mt-4 flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x">
        {items.map((v, idx) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setOpen(v)}
            className="group relative flex-shrink-0 w-[280px] rounded-xl overflow-hidden bg-[#14181f] border border-white/5 snap-start hover:border-amber-500/30 transition text-left"
            data-testid={`${testIdPrefix}-thumb-${idx}`}
          >
            <div className="aspect-video bg-[#1e2430] relative overflow-hidden">
              <img
                src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                alt={v.label || titleFallback}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <PlayCircle className="w-14 h-14 text-white/95 drop-shadow-lg group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">{v.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">YouTube</div>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="bg-black border-white/10 text-white max-w-4xl p-0 overflow-hidden" data-testid={`${testIdPrefix}-player-dialog`}>
          <DialogTitle className="sr-only">{open?.label || titleFallback}</DialogTitle>
          <DialogDescription className="sr-only">YouTube video player</DialogDescription>
          {open && (
            <div className="aspect-video w-full bg-black">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${open.id}?autoplay=1&rel=0`}
                title={open.label || titleFallback}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
