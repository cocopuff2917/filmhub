import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

function normalizeName(name) {
  return (name || "").trim().toLocaleLowerCase();
}

export default function ActorDuplicatesTab({ canDelete, contentEditsFrozen, canBypassCatalogFreeze }) {
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);

  const scan = async () => {
    setScanning(true);
    setError("");
    try {
      const response = await api.get("/actors", { params: { include_credit_status: true } });
      const grouped = new Map();
      for (const actor of response.data) {
        if (!actor.is_empty_duplicate) continue;
        const key = normalizeName(actor.name);
        if (!key) continue;
        const group = grouped.get(key) || { name: actor.name.trim(), actors: [] };
        group.actors.push(actor);
        grouped.set(key, group);
      }
      setGroups([...grouped.values()].sort((left, right) => left.name.localeCompare(right.name)));
      setHasScanned(true);
    } catch (scanError) {
      setError(scanError.response?.data?.detail || "Could not scan for duplicate actors");
    } finally {
      setScanning(false);
    }
  };

  const deleteDuplicates = async () => {
    const count = groups.reduce((total, group) => total + group.actors.length, 0);
    if (!count || !window.confirm(`Soft-delete safe duplicate actor pages? This keeps credited pages and leaves one page when duplicates have no credits.`)) return;
    setDeleting(true);
    try {
      const response = await api.post("/admin/actors/delete-empty-duplicates");
      toast.success(`Deleted ${response.data.deleted} duplicate actor page${response.data.deleted === 1 ? "" : "s"}`);
      await scan();
    } catch (deleteError) {
      toast.error(deleteError.response?.data?.detail || "Could not delete duplicate actor pages");
    } finally {
      setDeleting(false);
    }
  };

  const duplicateCount = groups.reduce((total, group) => total + group.actors.length, 0);
  const deleteDisabled = !canDelete || contentEditsFrozen && !canBypassCatalogFreeze;

  return (
    <section className="max-w-4xl" data-testid="admin-actor-duplicates">
      <header className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Search className="h-5 w-5 text-amber-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-white">Duplicate actors</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400">Find same-name actor pages with no catalog credits. Credited actor pages are protected; when none have credits, one page is kept.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 py-5">
        <Button type="button" onClick={scan} disabled={scanning || deleting} className="bg-amber-500 text-black hover:bg-amber-400" data-testid="scan-actor-duplicates">
          {scanning ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {scanning ? "Scanning actors…" : hasScanned ? "Scan again" : "Find duplicates"}
        </Button>
        {hasScanned && duplicateCount > 0 && (
          <Button type="button" variant="outline" onClick={deleteDuplicates} disabled={deleteDisabled || scanning || deleting} className="border-red-500/30 text-red-200 hover:bg-red-500/10 hover:text-red-100" data-testid="delete-actor-duplicates">
            {deleting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {deleting ? "Deleting duplicates…" : `Delete ${duplicateCount} safe duplicate${duplicateCount === 1 ? "" : "s"}`}
          </Button>
        )}
        {!canDelete && <span className="text-xs text-slate-500">You can scan duplicates, but do not have permission to delete actors.</span>}
        {contentEditsFrozen && canDelete && !canBypassCatalogFreeze && <span className="text-xs text-amber-200">Catalog deletions are paused.</span>}
      </div>

      {error && <p className="border-b border-white/10 py-4 text-sm text-rose-300" role="alert">{error}</p>}
      {hasScanned && !scanning && !error && (
        <div className="divide-y divide-white/10" role="status" data-testid="actor-duplicate-results">
          <p className="py-4 text-sm text-slate-300">{groups.length} duplicate group{groups.length === 1 ? "" : "s"}; {duplicateCount} safe-to-delete page{duplicateCount === 1 ? "" : "s"}.</p>
          {groups.map((group) => (
            <div key={normalizeName(group.name)} className="flex items-center justify-between gap-4 py-3">
              <span className="min-w-0 truncate font-medium text-white">{group.name}</span>
              <span className="shrink-0 text-xs text-slate-400">{group.actors.length} uncredited duplicate pages</span>
            </div>
          ))}
          {groups.length === 0 && <p className="pb-4 text-sm text-slate-500">No safe duplicate actors found.</p>}
        </div>
      )}
    </section>
  );
}