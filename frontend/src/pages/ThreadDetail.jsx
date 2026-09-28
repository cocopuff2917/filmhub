import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Trash2, Send, ArrowLeft, MessageSquare, Flag, LifeBuoy, Users } from "lucide-react";
import { toast } from "sonner";

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

const catIcon = {
  support: <LifeBuoy className="w-4 h-4" />,
  report: <Flag className="w-4 h-4" />,
  general: <Users className="w-4 h-4" />,
};
const catColor = {
  support: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  report: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  general: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};
const roleTint = {
  admin: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  moderator: "bg-sky-500/15 text-sky-300 border-sky-500/40",
};

export default function ThreadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try { const r = await api.get(`/threads/${id}`); setThread(r.data); }
    catch { toast.error("Thread not found"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setPosting(true);
    try { await api.post(`/threads/${id}/messages`, { text: reply }); setReply(""); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setPosting(false);
  };

  const setStatus = async (status) => {
    try { await api.patch(`/threads/${id}/status`, { status }); toast.success(`Thread ${status}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const del = async () => {
    if (!window.confirm("Delete this thread and all replies?")) return;
    try { await api.delete(`/threads/${id}`); toast.success("Deleted"); navigate("/threads"); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!thread) return <div className="max-w-4xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;

  const isMod = user && ["moderator", "admin"].includes(user.role);
  const canReply = user && (thread.status !== "closed" || isMod);
  const entityHref = thread.entity_type === "movie" ? `/movie/${thread.entity_id}`
    : thread.entity_type === "series" ? `/series/${thread.entity_id}`
    : thread.entity_type === "actor" ? `/actor/${thread.entity_id}`
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/threads" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-amber-400"><ArrowLeft className="w-4 h-4" /> All threads</Link>

      <div className="mt-6 rounded-xl bg-[#14181f] border border-white/10 p-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={catColor[thread.category]}>
            <span className="inline-flex items-center gap-1">{catIcon[thread.category]} {thread.category}</span>
          </Badge>
          <Badge className={thread.status === "open" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-white/5 text-slate-400 border-white/10"} data-testid="thread-status">
            {thread.status === "open" ? <Unlock className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
            {thread.status}
          </Badge>
          {entityHref && thread.entity_title && (
            <Link to={entityHref} className="text-xs text-slate-400 hover:text-amber-400">on <span className="text-amber-400">{thread.entity_title}</span></Link>
          )}
        </div>
        <h1 className="mt-3 font-heading text-3xl sm:text-4xl font-bold text-white" data-testid="thread-title">{thread.title}</h1>
        <div className="mt-4 flex items-start gap-3">
          <Link to={`/user/${thread.user_id}`}>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-sm text-slate-400 flex-shrink-0">
              {thread.user_avatar ? <img src={fileUrl(thread.user_avatar)} alt="" className="w-full h-full object-cover" /> : (thread.user_name?.[0] || "?")}
            </div>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/user/${thread.user_id}`} className="font-semibold text-white hover:text-amber-400">{thread.user_name}</Link>
              {thread.user_role && thread.user_role !== "user" && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${roleTint[thread.user_role]}`}>{thread.user_role}</span>
              )}
              <span className="text-xs text-slate-500">{timeAgo(thread.created_at)}</span>
            </div>
            <p className="mt-2 text-slate-200 whitespace-pre-wrap break-words">{thread.body}</p>
          </div>
        </div>

        {isMod && (
          <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap gap-2">
            {thread.status === "open" ? (
              <Button variant="outline" onClick={() => setStatus("closed")} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="close-thread-btn">
                <Lock className="w-4 h-4 mr-2" /> Close thread
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setStatus("open")} className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200" data-testid="open-thread-btn">
                <Unlock className="w-4 h-4 mr-2" /> Reopen thread
              </Button>
            )}
            <Button variant="outline" onClick={del} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="delete-thread-btn">
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        )}
      </div>

      <section className="mt-8">
        <h2 className="font-heading text-2xl font-bold text-white flex items-center gap-2"><MessageSquare className="w-5 h-5 text-amber-400" /> Replies ({thread.messages.length})</h2>
        <div className="mt-4 space-y-3">
          {thread.messages.map((m) => (
            m.system ? (
              <div key={m.id} className="text-xs text-slate-500 text-center py-2" data-testid={`thread-msg-${m.id}`}>
                <Lock className="w-3 h-3 inline mr-1" /> {m.text} • {timeAgo(m.created_at)}
              </div>
            ) : (
              <div key={m.id} className="rounded-xl bg-[#14181f] border border-white/10 p-4" data-testid={`thread-msg-${m.id}`}>
                <div className="flex items-start gap-3">
                  <Link to={`/user/${m.user_id}`} className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">
                      {m.user_avatar ? <img src={fileUrl(m.user_avatar)} alt="" className="w-full h-full object-cover" /> : (m.user_name?.[0] || "?")}
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/user/${m.user_id}`} className="font-semibold text-white hover:text-amber-400">{m.user_name}</Link>
                      {m.user_role && m.user_role !== "user" && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${roleTint[m.user_role]}`}>{m.user_role}</span>
                      )}
                      <span className="text-xs text-slate-500">{timeAgo(m.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-slate-200 whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>

        {canReply ? (
          <form onSubmit={submit} className="mt-6 rounded-xl bg-[#14181f] border border-white/10 p-4">
            <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply..." className="bg-[#0d0f12] border-white/10 text-white" data-testid="thread-reply-input" />
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={posting || !reply.trim()} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="thread-reply-btn">
                <Send className="w-4 h-4 mr-2" /> Post reply
              </Button>
            </div>
          </form>
        ) : !user ? (
          <div className="mt-6 rounded-xl bg-[#14181f] border border-white/10 p-6 text-slate-400 text-sm">
            <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">Sign in</Link> to reply.
          </div>
        ) : (
          <div className="mt-6 rounded-xl bg-[#14181f] border border-white/10 p-6 text-slate-400 text-sm">
            This thread is closed. Only moderators can reply.
          </div>
        )}
      </section>
    </div>
  );
}
