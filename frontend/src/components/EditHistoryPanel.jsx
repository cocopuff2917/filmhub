import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { History, Plus, Edit as EditIcon, Trash2, ChevronDown, ChevronUp, Ban, CheckCircle, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fullTs(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

const actionColor = {
  create: "text-emerald-400",
  update: "text-amber-400",
  delete: "text-rose-400",
  suspend: "text-rose-400",
  unsuspend: "text-emerald-400",
  role: "text-sky-400",
};
const actionIcon = {
  create: <Plus className="w-3.5 h-3.5" />,
  update: <EditIcon className="w-3.5 h-3.5" />,
  delete: <Trash2 className="w-3.5 h-3.5" />,
  suspend: <Ban className="w-3.5 h-3.5" />,
  unsuspend: <CheckCircle className="w-3.5 h-3.5" />,
  role: <UserCog className="w-3.5 h-3.5" />,
};
const roleTint = {
  admin: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  moderator: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  user: "bg-white/5 text-slate-300 border-white/10",
};

function EditRow({ e }) {
  const [expanded, setExpanded] = useState(false);
  const hasChanges = e.changes && e.changes.length > 0;
  return (
    <li className="pl-6 relative" data-testid={`edit-log-${e.id}`}>
      <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[#0d0f12] border border-white/20 flex items-center justify-center ${actionColor[e.action] || "text-slate-400"}`}>
        {actionIcon[e.action] || <EditIcon className="w-3 h-3" />}
      </span>
      <div className="flex items-start gap-3">
        <Link to={`/user/${e.user_id}`} className="flex-shrink-0">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">
            {e.user_avatar ? <img src={fileUrl(e.user_avatar)} alt="" className="w-full h-full object-cover" /> : (e.user_name?.[0] || "?")}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link to={`/user/${e.user_id}`} className="font-semibold text-white hover:text-amber-400">{e.user_name || "Someone"}</Link>
            {e.user_role && e.user_role !== "user" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${roleTint[e.user_role] || roleTint.user}`}>{e.user_role}</span>
            )}
            <span className={`text-xs uppercase tracking-widest ${actionColor[e.action] || "text-slate-400"}`}>{e.action}</span>
            <span className="text-xs text-slate-500" title={fullTs(e.created_at)}>{timeAgo(e.created_at)}</span>
          </div>
          {e.summary && <div className="text-sm text-slate-400 mt-1">{e.summary}</div>}

          {hasChanges && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded((x) => !x)}
                className="text-xs uppercase tracking-widest text-amber-400 hover:text-amber-300 flex items-center gap-1"
                data-testid={`edit-log-toggle-${e.id}`}
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Hide" : "Show"} {e.changes.length} change{e.changes.length !== 1 && "s"}
              </button>
              {expanded && (
                <div className="mt-2 rounded-lg border border-white/10 bg-[#0d0f12] divide-y divide-white/5">
                  {e.changes.map((c, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-x-3 gap-y-1 p-3 text-xs">
                      <div className="uppercase tracking-widest text-slate-500 font-semibold">{c.field}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
                        <div className="rounded bg-rose-500/10 border border-rose-500/20 px-2 py-1 text-rose-200 break-words">
                          <span className="uppercase text-[9px] tracking-widest text-rose-400 mr-1">was</span>
                          {c.before}
                        </div>
                        <span className="hidden sm:block text-slate-600">→</span>
                        <div className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-emerald-200 break-words">
                          <span className="uppercase text-[9px] tracking-widest text-emerald-400 mr-1">now</span>
                          {c.after}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function EditHistoryPanel({ entityType, entityId, limit = 25 }) {
  const [edits, setEdits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await api.get("/edits", { params: { entity_type: entityType, entity_id: entityId, limit } });
        setEdits(r.data);
      } catch {}
      setLoading(false);
    })();
  }, [entityType, entityId, limit]);

  const visible = showAll ? edits : edits.slice(0, 5);

  return (
    <div data-testid="edit-history-panel">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <History className="w-4 h-4" /> Change Log
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-3xl font-bold text-white">Edit History</h2>
        {edits.length > 5 && (
          <Button variant="ghost" onClick={() => setShowAll((x) => !x)} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
            {showAll ? "Show less" : `Show all ${edits.length}`}
          </Button>
        )}
      </div>
      <div className="mt-6">
        {loading ? (
          <div className="text-slate-500 text-sm">Loading history...</div>
        ) : edits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-slate-500 text-sm">
            No edits recorded yet.
          </div>
        ) : (
          <ol className="relative border-l border-white/10 ml-2 space-y-6">
            {visible.map((e) => <EditRow key={e.id} e={e} />)}
          </ol>
        )}
      </div>
    </div>
  );
}
