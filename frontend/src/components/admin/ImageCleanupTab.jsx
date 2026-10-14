import { useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, ImageOff, LoaderCircle, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

const MAX_APPLY_BATCH = 500;
const MAX_RESTORE_BATCH = 300;
const PROBE_TIMEOUT_MS = 8000;
const WORKER_COUNT = 12;

const kindLabels = {
  users: "Profile picture",
  actors: "Actor photo",
  movies: "Movie poster",
  series: "TV series poster",
};

const fieldLabels = {
  photo_url: "Headshot",
  gallery: "Gallery photo",
};

function imageSource(value) {
  if (/^(https?:|data:|blob:|\/\/)/i.test(value)) {
    return value.startsWith("//") ? `${window.location.protocol}${value}` : value;
  }
  return fileUrl(value);
}

function probeImage(value) {
  return new Promise((resolve) => {
    const image = new window.Image();
    const timeout = window.setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    const finish = (result) => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = imageSource(value);
  });
}

export default function ImageCleanupTab() {
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [scanResult, setScanResult] = useState(null);
  const [brokenItems, setBrokenItems] = useState([]);

  const exportImageArchive = () => {
    setExporting(true);
    try {
      const link = document.createElement("a");
      link.href = api.getUri({ url: "/admin/images/export" });
      link.download = "cineverse-images.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Image archive download started");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not export image archive");
    } finally {
      setExporting(false);
    }
  };

  const importImageArchive = async (event) => {
    const archive = event.target.files?.[0];
    if (!archive) return;
    if (!window.confirm("Import images from this archive? Matching image references will be updated to the imported copies.")) {
      event.target.value = "";
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append("archive_file", archive);
      const response = await api.post("/admin/images/import", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported ${response.data.imported_assets} image assets and updated ${response.data.updated_references} references`);
      if (response.data.skipped) toast.info(`${response.data.skipped} image references were skipped because their source no longer matched`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not import image archive");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const scanImages = async () => {
    setScanning(true);
    setScanResult(null);
    setBrokenItems([]);
    setProgress({ checked: 0, total: 0 });
    try {
      const response = await api.get("/admin/images/cleanup/references");
      const references = response.data.references || [];
      const broken = [];
      let unverified = 0;
      let nextIndex = 0;
      let checked = 0;
      setProgress({ checked: 0, total: references.length });

      const workers = Array.from({ length: WORKER_COUNT }, async () => {
        while (nextIndex < references.length) {
          const index = nextIndex++;
          const reference = references[index];
          const result = await probeImage(reference.url);
          if (result === false) broken.push(reference);
          if (result === null) unverified += 1;
          checked += 1;
          if (checked % 20 === 0 || checked === references.length) {
            setProgress({ checked, total: references.length });
          }
        }
      });
      await Promise.all(workers);

      setBrokenItems(broken);
      setScanResult({ checked: references.length, broken: broken.length, unverified });
      if (broken.length) {
        toast.warning(`Found ${broken.length} broken image reference${broken.length === 1 ? "" : "s"}`);
      } else {
        toast.success("No broken images found");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not scan images");
    } finally {
      setScanning(false);
    }
  };

  const removeBrokenImages = async () => {
    if (!brokenItems.length) return;
    const confirmed = window.confirm(
      `Remove ${brokenItems.length} confirmed broken image reference${brokenItems.length === 1 ? "" : "s"}? Healthy and timed-out images will be kept.`,
    );
    if (!confirmed) return;

    setApplying(true);
    let removed = 0;
    let conflicted = 0;
    try {
      for (let start = 0; start < brokenItems.length; start += MAX_APPLY_BATCH) {
        const items = brokenItems.slice(start, start + MAX_APPLY_BATCH);
        const response = await api.post("/admin/images/cleanup/apply", { items });
        removed += response.data.removed || 0;
        conflicted += response.data.conflicted || 0;
      }
      setBrokenItems([]);
      setScanResult((previous) => ({ ...previous, removed, conflicted }));
      toast.success(`Removed ${removed} broken image reference${removed === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not remove broken images");
      setScanResult((previous) => ({ ...previous, removed, conflicted }));
    } finally {
      setApplying(false);
    }
  };

  const restorableItems = brokenItems.filter((item) => item.field !== "gallery");

  const restoreBrokenImages = async () => {
    if (!restorableItems.length) return;
    if (!window.confirm("Clear broken actor photos and movie posters? Broken TV-series posters may be restored from TMDB, and broken user profile pictures will be cleared. Continue?")) return;

    setRestoring(true);
    const totals = { restored: 0, cleared: 0, unavailable: 0, conflicted: 0 };
    try {
      for (let start = 0; start < restorableItems.length; start += MAX_RESTORE_BATCH) {
        const items = restorableItems.slice(start, start + MAX_RESTORE_BATCH);
        const response = await api.post("/admin/images/cleanup/restore", { items });
        for (const key of Object.keys(totals)) totals[key] += response.data[key] || 0;
      }
      setBrokenItems((previous) => previous.filter((item) => item.field === "gallery"));
      setScanResult((previous) => ({ ...previous, ...totals }));
      const repairedCount = totals.restored + totals.cleared;
      toast.success(`Restored ${repairedCount} image reference${repairedCount === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not restore broken images");
      setScanResult((previous) => ({ ...previous, ...totals }));
    } finally {
      setRestoring(false);
    }
  };

  const counts = brokenItems.reduce((result, item) => {
    result[item.kind] = (result[item.kind] || 0) + 1;
    return result;
  }, {});
  const sample = brokenItems.slice(0, 20);

  return (
    <section className="max-w-4xl" data-testid="admin-image-cleanup">
      <header className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <ImageOff className="h-5 w-5 text-amber-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-white">Broken-image monitor</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Scan profile pictures, actor headshots and gallery photos, movie posters, and TV series posters. Broken TV-series posters may be restored from TMDB; broken actor photos, movie posters, and profile pictures are cleared.
        </p>
      </header>

      <section className="border-b border-white/10 py-5" data-testid="admin-image-transfer">
        <div>
          <h3 className="text-sm font-semibold text-white">Image archive</h3>
          <p className="mt-1 text-xs text-slate-400">TMDB artwork and uploaded images are embedded. Other remote image URLs remain external references.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" onClick={exportImageArchive} disabled={exporting || importing} className="bg-amber-500 text-black hover:bg-amber-400" data-testid="admin-image-export-button">
            {exporting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {exporting ? "Preparing archive…" : "Export all images"}
          </Button>
          <label className={`inline-flex h-10 cursor-pointer items-center rounded-md border border-white/15 px-4 text-sm font-medium text-slate-200 hover:bg-white/10 ${importing || exporting ? "pointer-events-none opacity-50" : ""}`} data-testid="admin-image-import-button">
            {importing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {importing ? "Importing…" : "Import image archive"}
            <input type="file" accept=".zip,application/zip" onChange={importImageArchive} disabled={importing || exporting} className="sr-only" aria-label="Select an image archive to import" />
          </label>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={scanImages}
          disabled={scanning || applying || restoring}
          className="bg-amber-500 text-black hover:bg-amber-400"
          data-testid="admin-image-scan-button"
        >
          {scanning ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {scanning ? `Checking ${progress.checked.toLocaleString()} of ${progress.total.toLocaleString()}` : "Scan images"}
        </Button>
        {restorableItems.length > 0 && (
          <Button
            type="button"
            onClick={restoreBrokenImages}
            disabled={scanning || applying || restoring}
            className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
            data-testid="admin-image-restore-button"
          >
            {restoring ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {restoring ? "Restoring…" : `Restore ${restorableItems.length} broken`}
          </Button>
        )}
        {brokenItems.length > 0 && (
          <Button
            type="button"
            onClick={removeBrokenImages}
            disabled={scanning || applying || restoring}
            variant="destructive"
            data-testid="admin-image-remove-button"
          >
            {applying ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {applying ? "Removing…" : `Remove all broken images (${brokenItems.length})`}
          </Button>
        )}
      </div>

      {scanResult && (
        <div className="mt-6 border-t border-white/10 pt-5" role="status" data-testid="admin-image-scan-result">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">Checked</dt><dd className="mt-1 text-lg font-semibold text-white">{scanResult.checked.toLocaleString()}</dd></div>
            <div><dt className="text-xs text-slate-500">Broken</dt><dd className="mt-1 text-lg font-semibold text-rose-300">{scanResult.broken.toLocaleString()}</dd></div>
            <div><dt className="text-xs text-slate-500">Timed out</dt><dd className="mt-1 text-lg font-semibold text-slate-200">{scanResult.unverified.toLocaleString()}</dd></div>
            {scanResult.removed != null && <div><dt className="text-xs text-slate-500">Removed</dt><dd className="mt-1 text-lg font-semibold text-emerald-300">{scanResult.removed.toLocaleString()}</dd></div>}
            {scanResult.restored != null && <div><dt className="text-xs text-slate-500">Posters restored</dt><dd className="mt-1 text-lg font-semibold text-emerald-300">{scanResult.restored.toLocaleString()}</dd></div>}
            {scanResult.cleared != null && <div><dt className="text-xs text-slate-500">Cleared to fallback</dt><dd className="mt-1 text-lg font-semibold text-emerald-300">{scanResult.cleared.toLocaleString()}</dd></div>}
            {scanResult.unavailable != null && <div><dt className="text-xs text-slate-500">No replacement found</dt><dd className="mt-1 text-lg font-semibold text-amber-300">{scanResult.unavailable.toLocaleString()}</dd></div>}
          </dl>

          {sample.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-white">Broken references</h3>
              <ul className="mt-2 divide-y divide-white/10 border-y border-white/10">
                {sample.map((item, index) => (
                  <li key={`${item.kind}-${item.id}-${item.field}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="text-slate-200">{item.label}</span>
                    <span className="text-xs text-slate-400">{fieldLabels[item.field] || kindLabels[item.kind] || item.kind}</span>
                  </li>
                ))}
              </ul>
              {brokenItems.length > sample.length && <p className="mt-2 text-xs text-slate-500">Showing {sample.length} of {brokenItems.length} broken references.</p>}
              {counts && <p className="mt-3 text-xs text-slate-400">{Object.entries(counts).map(([kind, count]) => `${kindLabels[kind] || kind}: ${count}`).join(" · ")}</p>}
            </div>
          )}
          {scanResult.conflicted > 0 && <p className="mt-3 text-sm text-amber-300">{scanResult.conflicted} reference(s) changed during cleanup and were left untouched.</p>}
        </div>
      )}
    </section>
  );
}
