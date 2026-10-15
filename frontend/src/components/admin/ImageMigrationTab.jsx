import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, CheckCircle2, CloudUpload, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const COUNTER_KEYS = ["copied", "skipped_in_s3", "missing_in_emergent", "errors"];

export default function ImageMigrationTab() {
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const [fallbackSaving, setFallbackSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await api.get("/admin/images/migrate-to-s3/status");
        if (active) {
          setStatus(response.data);
          setLoadError("");
        }
      } catch (error) {
        if (active) setLoadError(error.response?.data?.detail || "Could not load migration status");
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const processed = status ? COUNTER_KEYS.reduce((total, key) => total + (status[key] || 0), 0) : 0;
  const total = status?.total || 0;
  const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const canRun = status?.storage_provider === "aws" && status?.legacy_source_available;

  const runMigration = async () => {
    if (!window.confirm("Copy all missing referenced images from legacy storage to S3? Existing S3 objects will be skipped.")) return;
    setStarting(true);
    try {
      const response = await api.post("/admin/images/migrate-to-s3", { confirm: "MIGRATE", limit: 0, overwrite: false });
      toast.success(response.data.already_running ? "Image migration is already running" : "Image migration started");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not start image migration");
    } finally {
      setStarting(false);
    }
  };

  const updateFallback = async (enabled) => {
    setFallbackSaving(true);
    try {
      await api.put("/admin/images/migrate-to-s3/fallback", { enabled });
      setStatus((previous) => ({ ...previous, fallback_enabled: enabled }));
      toast.success(`Legacy image fallback ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update image fallback");
    } finally {
      setFallbackSaving(false);
    }
  };

  return (
    <section className="max-w-3xl" data-testid="admin-image-migration">
      <header className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <CloudUpload className="h-5 w-5 text-amber-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-white">Image migration to S3</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400">Copy referenced images from legacy storage into the configured S3 bucket. Re-running skips objects already in S3.</p>
      </header>

      <div className="mt-5 rounded-md border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Destination</p>
            <p className="mt-1 text-base font-semibold text-white">{status?.s3_bucket || "S3 bucket not configured"}</p>
            <p className="mt-1 text-sm text-slate-400">Provider: {status?.storage_provider || "Loading…"}</p>
          </div>
          <Button type="button" onClick={runMigration} disabled={!canRun || status?.running || starting} className="bg-amber-500 text-black hover:bg-amber-400" data-testid="image-migration-run">
            {status?.running || starting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {status?.running ? "Migration running" : "Run / retry migration"}
          </Button>
        </div>

        {!canRun && <p className="mt-4 text-sm text-amber-200">Migration requires AWS storage and a configured legacy storage key.</p>}
        {loadError && <p className="mt-4 text-sm text-rose-300" role="alert">{loadError}</p>}

        <div className="mt-5 border-t border-white/10 pt-5" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-200">{status?.running ? "Copying images" : status?.finished_at ? "Last run complete" : "Not started"}</span>
            {status?.running && <span className="tabular-nums text-slate-400">{percent}%</span>}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-sm bg-white/10" role="progressbar" aria-label="Image migration progress" aria-valuemin={0} aria-valuemax={total || 100} aria-valuenow={total ? processed : 0}>
            <div className="h-full bg-amber-400 transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Processed {processed.toLocaleString()} of {total.toLocaleString()} referenced images</p>

          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Copied", status?.copied],
              ["Already in S3", status?.skipped_in_s3],
              ["Missing at source", status?.missing_in_emergent],
              ["Errors", status?.errors],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{(value || 0).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          {status?.last_path && <p className="mt-4 truncate text-xs text-slate-500" title={status.last_path}>Last checked: {status.last_path}</p>}
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between gap-5 border-b border-white/10 py-5">
        <div className="flex gap-3">
          {status?.fallback_enabled ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />}
          <div>
            <h3 className="text-sm font-semibold text-white">Legacy image fallback</h3>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400">When enabled, images missing from S3 may still load from legacy storage. Disabling it can make any not-yet-migrated images unavailable; the migration job can still copy them.</p>
          </div>
        </div>
        <Switch checked={!!status?.fallback_enabled} onCheckedChange={updateFallback} disabled={!status || fallbackSaving} aria-label="Enable legacy image fallback" data-testid="image-migration-fallback-switch" />
      </div>

      {!!status?.error_samples?.length && (
        <div className="mt-5" role="status">
          <h3 className="text-sm font-semibold text-rose-200">Recent migration errors</h3>
          <ul className="mt-2 space-y-2 text-xs text-slate-400">
            {status.error_samples.slice(0, 5).map((item) => <li key={`${item.path}-${item.error}`} className="break-all">{item.path}: {item.error}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}