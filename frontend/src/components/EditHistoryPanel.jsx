import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { History, Plus, Edit as EditIcon, Trash2 } from "lucide-react";

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
};

export default function EditHistoryPanel({ entityType, entityId, limit = 25 }) {
  const [edits, setEdits] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div data-testid="edit-history-panel">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <History className="w-4 h-4" /> Change Log
      </div>
      <h2 className="mt-2 font-heading text-3xl font-bold text-white">Edit History</h2>
      <div className="mt-6">
        {loading ? (
          <div className="text-slate-500 text-sm">Loading history...</div>
        ) : edits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-slate-500 text-sm">
            No edits recorded yet.
          </div>
        ) : (
          <ol className="relative border-l border-white/10 ml-2 space-y-4">
            {edits.map((e) => (
              <li key={e.id} className="pl-6 relative" data-testid={`edit-log-${e.id}`}>
                <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[#0d0f12] border border-white/20 flex items-center justify-center ${actionColor[e.action] || "text-slate-400"}`}>
                  {actionIcon[e.action] || <EditIcon className="w-3 h-3" />}
                </span>
                <div className="flex items-start gap-3">
                  <Link to={`/user/${e.user_id}`} className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">
                      {e.user_avatar ? <img src={fileUrl(e.user_avatar)} alt="" className="w-full h-full object-cover" /> : (e.user_name?.[0] || "?")}
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <Link to={`/user/${e.user_id}`} className="font-semibold text-white hover:text-amber-400">
                        {e.user_name || "Someone"}
                      </Link>
                      <span className={`ml-2 text-xs uppercase tracking-widest ${actionColor[e.action] || "text-slate-400"}`}>{e.action}</span>
                      <span className="ml-2 text-xs text-slate-500">{timeAgo(e.created_at)}</span>
                    </div>
                    {e.summary && <div className="text-sm text-slate-400 mt-0.5">{e.summary}</div>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
