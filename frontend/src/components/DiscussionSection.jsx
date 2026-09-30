import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2, Send, ThumbsUp, Quote as QuoteIcon, Languages, Flag, EyeOff } from "lucide-react";
import { toast } from "sonner";

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

const roleTint = {
  admin: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  moderator: "bg-sky-500/15 text-sky-300 border-sky-500/40",
};

export default function DiscussionSection({ entityType, entityId, embedded = false }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/comments", { params: { entity_type: entityType, entity_id: entityId } });
      setComments(r.data);
    } catch {}
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to post a comment"); return; }
    if (!text.trim()) return;
    setPosting(true);
    try {
      await api.post("/comments", { entity_type: entityType, entity_id: entityId, text });
      setText("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to post"); }
    setPosting(false);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this comment?")) return;
    try { await api.delete(`/comments/${id}`); load(); toast.success("Deleted"); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const canDelete = (c) => user && (c.user_id === user.id || ["moderator", "admin"].includes(user.role));

  const inner = (
    <>
      {!embedded && (
        <>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
            <MessageSquare className="w-4 h-4" /> Community
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white">Discussion</h2>
            <span className="text-sm text-slate-500">{comments.length} comment{comments.length !== 1 && "s"}</span>
          </div>
        </>
      )}

      {user ? (
        <form onSubmit={submit} className={`${embedded ? "" : "mt-6"} rounded-xl bg-[#14181f] border border-white/10 p-4`}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
              {user.avatar_url ? <img src={fileUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" /> : (user.name?.[0] || "?")}
            </div>
            <div className="flex-1">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Join the conversation..."
                rows={3}
                className="bg-[#0d0f12] border-white/10 text-white resize-none"
                data-testid="discussion-input"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">{text.length}/2000</span>
                <Button type="submit" disabled={posting || !text.trim()} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="discussion-submit-btn">
                  <Send className="w-4 h-4 mr-2" /> Post
                </Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className={`${embedded ? "" : "mt-6"} rounded-xl bg-[#14181f] border border-white/10 p-6 text-slate-400 text-sm`}>
          <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">Sign in</Link> to join the discussion.
        </div>
      )}

      <div className={`${embedded ? "mt-4" : "mt-8"} space-y-4`}>
        {comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-slate-500 text-sm">
            No comments yet. Be the first to start the conversation.
          </div>
        ) : comments.map((c) => (
          <div key={c.id} className="rounded-lg overflow-hidden border border-white/5 bg-[#0d1220]/40" data-testid={`comment-${c.id}`}>
            <div className="flex items-start gap-3 p-4">
              <Link to={`/user/${c.user_id}`} className="flex-shrink-0">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">
                  {c.user_avatar ? <img src={fileUrl(c.user_avatar)} alt="" className="w-full h-full object-cover" /> : (c.user_name?.[0] || "?")}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/user/${c.user_id}`} className="font-semibold text-white hover:text-amber-400">{c.user_name || "Anonymous"}</Link>
                  {c.user_role && c.user_role !== "user" && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${roleTint[c.user_role] || "bg-white/5 text-slate-300 border-white/10"}`}>
                      {c.user_role === "moderator" ? "MOD" : c.user_role}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">· {timeAgo(c.created_at)}</span>
                </div>
                <p className="mt-2 text-slate-200 text-sm whitespace-pre-wrap break-words leading-relaxed">{c.text}</p>
              </div>
              {canDelete(c) && (
                <button onClick={() => del(c.id)} className="text-slate-500 hover:text-rose-400 transition p-1" data-testid={`delete-comment-${c.id}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-white/[0.02] text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <button type="button" className="inline-flex items-center gap-1 hover:text-white transition"><ThumbsUp className="w-3.5 h-3.5" /> Like</button>
                <button type="button" className="inline-flex items-center gap-1 hover:text-white transition"><QuoteIcon className="w-3.5 h-3.5" /> Quote</button>
                <button type="button" className="inline-flex items-center gap-1 hover:text-white transition"><Languages className="w-3.5 h-3.5" /> Translate</button>
              </div>
              <div className="flex items-center gap-4">
                <button type="button" className="inline-flex items-center gap-1 hover:text-white transition"><Flag className="w-3.5 h-3.5" /> Report</button>
                <button type="button" className="inline-flex items-center gap-1 hover:text-white transition"><EyeOff className="w-3.5 h-3.5" /> Ignore</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  if (embedded) {
    return <div data-testid="discussion-section">{inner}</div>;
  }
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="discussion-section">
      {inner}
    </section>
  );
}
