import { useState } from "react";
import { fileUrl, uploadImage } from "@/lib/api";
import { Loader2, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

/**
 * Mini-gallery of poster/backdrop URLs with "Make primary", "Delete" (mod-only),
 * and an "Upload another" button.
 * Props:
 *  - urls: string[]
 *  - primary: string          (which URL is the primary — matches the single poster_url/backdrop_url)
 *  - aspect: "2/3" | "16/9"
 *  - canMod: boolean          (gate delete + reorder)
 *  - disabled: boolean        (field-level disable, e.g. locked)
 *  - testIdPrefix: string
 *  - onChange: ({ urls, primary }) => void
 */
export default function PosterListField({ urls = [], primary = "", aspect = "2/3", canMod = false, disabled = false, testIdPrefix = "field-list", onChange }) {
  const [uploading, setUploading] = useState(false);

  // Keep "primary" always at index 0 for consistent rendering
  const ordered = (() => {
    if (!primary) return urls;
    const rest = urls.filter((u) => u !== primary);
    return [primary, ...rest];
  })();

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      const nextUrls = ordered.includes(url) ? ordered : [...ordered, url];
      // If nothing was primary, make the new upload primary
      const nextPrimary = primary || url;
      onChange({ urls: nextUrls, primary: nextPrimary });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const makePrimary = (url) => {
    if (!canMod) return;
    const nextUrls = [url, ...ordered.filter((u) => u !== url)];
    onChange({ urls: nextUrls, primary: url });
  };

  const removeOne = (url) => {
    if (!canMod) return;
    const nextUrls = ordered.filter((u) => u !== url);
    const nextPrimary = url === primary ? (nextUrls[0] || "") : primary;
    onChange({ urls: nextUrls, primary: nextPrimary });
  };

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-container`}>
      {ordered.length === 0 ? (
        <div className="text-xs text-slate-500">No images uploaded yet.</div>
      ) : (
        <div className={`grid gap-3 ${aspect === "2/3" ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"}`}>
          {ordered.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="group relative rounded-lg overflow-hidden border border-white/10 bg-black"
              data-testid={`${testIdPrefix}-tile-${idx}`}
            >
              <img
                src={fileUrl(url)}
                alt=""
                className="w-full object-cover"
                style={{ aspectRatio: aspect }}
                loading="lazy"
              />
              {url === primary && (
                <div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider" data-testid={`${testIdPrefix}-primary-${idx}`}>
                  <Star className="w-3 h-3" /> Primary
                </div>
              )}
              {canMod && !disabled && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {url !== primary && (
                    <button
                      type="button"
                      onClick={() => makePrimary(url)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold"
                      data-testid={`${testIdPrefix}-make-primary-${idx}`}
                    >
                      <Star className="w-3 h-3" /> Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeOne(url)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold"
                    data-testid={`${testIdPrefix}-remove-${idx}`}
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
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/15 text-white text-xs cursor-pointer hover:bg-white/10 ${(disabled || uploading) ? "opacity-50 cursor-not-allowed" : ""}`}
          data-testid={`${testIdPrefix}-upload-label`}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Uploading…" : `Upload another ${aspect === "2/3" ? "poster" : "backdrop"}`}
          <input type="file" accept="image/*" disabled={disabled || uploading} onChange={handleUpload} className="hidden" data-testid={`${testIdPrefix}-upload-input`} />
        </label>
        {!canMod && ordered.length > 0 && (
          <span className="ml-3 text-[11px] text-slate-500">Only moderators can delete or change the primary.</span>
        )}
      </div>
    </div>
  );
}
