import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Inbox as InboxIcon, MessageSquare, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Inbox() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/inbox/threads");
      setThreads(r.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const isMod = user && ["moderator", "admin"].includes(user.role);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10" data-testid="inbox-page">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <InboxIcon className="w-4 h-4" /> Inbox
      </div>
      <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-4xl font-bold text-white">Direct Messages</h1>
        <div className="text-sm text-slate-400">
          {isMod
            ? "Private threads you started or that are addressed to you and other moderators."
            : "Private messages from moderators. Reply here — moderators are notified."}
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-16 text-center" data-testid="inbox-empty">
            <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="mt-3 text-slate-400 text-sm">Your inbox is empty. When a moderator messages you, it appears here.</div>
          </div>
        ) : (
          threads.map((t) => {
            const isFromMod = ["moderator", "admin"].includes((t.user_role || "").toLowerCase());
            const otherName = isMod && t.target_user_name ? t.target_user_name : t.user_name;
            return (
              <Link
                to={`/threads/${t.id}`}
                key={t.id}
                className="block rounded-xl bg-[#14181f] border border-white/10 p-4 hover:border-amber-500/40 hover:bg-amber-500/5 transition"
                data-testid={`inbox-thread-${t.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-sm text-slate-400 flex-shrink-0">
                    {t.user_avatar ? (
                      <img src={fileUrl(t.user_avatar)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (t.user_name?.[0] || "?")
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40">
                        <MessageSquare className="w-3 h-3 mr-1" /> Direct
                      </Badge>
                      {isFromMod && (
                        <Badge className="bg-sky-500/15 text-sky-300 border-sky-500/40 uppercase">
                          {t.user_role}
                        </Badge>
                      )}
                      {t.status === "closed" && (
                        <Badge className="bg-white/5 text-slate-400 border-white/10">
                          <Lock className="w-3 h-3 mr-1" /> closed
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 font-heading text-white font-semibold line-clamp-1">{t.title}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      <span>{isMod ? `to ${otherName}` : `from ${t.user_name}`}</span>
                      <span>•</span>
                      <span>{timeAgo(t.last_activity_at || t.created_at)}</span>
                      <span>•</span>
                      <span>{t.message_count} repl{t.message_count !== 1 ? "ies" : "y"}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div className="mt-8 text-sm text-slate-500">
        <Button variant="outline" asChild className="border-white/10 text-white hover:bg-white/5 hover:text-white">
          <Link to="/threads" data-testid="inbox-goto-forum">Back to Forum</Link>
        </Button>
      </div>
    </div>
  );
}
