import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Unlock, Trash2, Send, MessageSquare, ThumbsUp, Quote as QuoteIcon, Languages, Flag, EyeOff } from "lucide-react";
import { toast } from "sonner";
import ForumSidebar from "@/components/ForumSidebar";

function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

const roleTint = {
  admin: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  moderator: "bg-sky-500/15 text-sky-300 border-sky-500/40",
};

const catLabel = { support: "Support", general: "General", report: "Reports", direct: "Direct" };

export default function ThreadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      // Use inbox variant for direct threads so suspended users can still fetch.
      const r = await api.get(`/threads/${id}`).catch(async (err) => {
        if (err?.response?.status === 404) return api.get(`/threads/${id}/inbox`);
        throw err;
      });
      setThread(r.data);
    } catch { toast.error("Thread not found"); }
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

  const participants = useMemo(() => {
    if (!thread) return [];
    const map = new Map();
    map.set(thread.user_id, { id: thread.user_id, name: thread.user_name, avatar: thread.user_avatar });
    (thread.messages || []).forEach((m) => {
      if (m.system) return;
      if (!map.has(m.user_id)) map.set(m.user_id, { id: m.user_id, name: m.user_name, avatar: m.user_avatar });
    });
    return Array.from(map.values()).slice(0, 6);
  }, [thread]);

  if (!thread) return (
    <div className="flex bg-[#0a0d14] min-h-[calc(100vh-64px)]">
      <ForumSidebar activeCategory={"all"} onNewDiscussion={() => navigate("/threads?new=1")} />
      <main className="flex-1 px-8 py-20 text-slate-500">Loading…</main>
    </div>
  );

  const isMod = user && ["moderator", "admin"].includes(user.effective_role || user.role);
  const canReply = user && (thread.status !== "closed" || isMod);
  const entityHref = thread.entity_type === "movie" ? `/movie/${thread.entity_id}`
    : thread.entity_type === "series" ? `/series/${thread.entity_id}`
    : thread.entity_type === "actor" ? `/actor/${thread.entity_id}`
    : null;
  const replies = (thread.messages || []).filter((m) => !m.system);
  const systemLog = (thread.messages || []).filter((m) => m.system);

  const Post = ({ author, avatarUrl, role, when, children, showActions = true, testId }) => (
    <div className="rounded-lg overflow-hidden border border-white/5 bg-[#0d1220]/40" data-testid={testId}>
      <div className="flex items-start gap-4 p-5">
        <Link to={`/user/${author?.id}`} className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">
            {avatarUrl ? <img src={fileUrl(avatarUrl)} alt="" className="w-full h-full object-cover" /> : (author?.name?.[0] || "?")}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/user/${author?.id}`} className="font-semibold text-white hover:text-amber-400">{author?.name}</Link>
            {role && role !== "user" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${roleTint[role] || "bg-white/5 text-slate-300 border-white/10"}`}>
                {role === "moderator" ? "MOD" : role}
              </span>
            )}
            <span className="text-xs text-slate-500">· {when}</span>
          </div>
          <div className="mt-3 text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
            {children}
          </div>
        </div>
      </div>
      {showActions && (
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/5 bg-white/[0.02] text-xs text-slate-400">
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
      )}
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row bg-[#0a0d14] min-h-[calc(100vh-64px)]" data-testid="thread-detail-page">
      <ForumSidebar
        activeCategory={thread.category || "all"}
        onNewDiscussion={() => navigate("/threads?new=1")}
        extra={(
          <>
            <div className="mb-6">
              <div className="text-right text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">Actions</div>
              <nav className="text-right space-y-1">
                {isMod && (
                  <>
                    {thread.status === "open" ? (
                      <button type="button" onClick={() => setStatus("closed")} className="block w-full text-right text-sm py-1 pr-1 text-rose-300 hover:text-rose-200" data-testid="close-thread-btn">Close thread</button>
                    ) : (
                      <button type="button" onClick={() => setStatus("open")} className="block w-full text-right text-sm py-1 pr-1 text-emerald-300 hover:text-emerald-200" data-testid="open-thread-btn">Reopen thread</button>
                    )}
                    <button type="button" onClick={del} className="block w-full text-right text-sm py-1 pr-1 text-rose-300 hover:text-rose-200" data-testid="delete-thread-btn">Delete</button>
                  </>
                )}
                {!isMod && <div className="text-right text-xs text-slate-500 py-1 pr-1">Moderator only</div>}
              </nav>
            </div>
            {participants.length > 0 && (
              <div className="mb-6">
                <div className="text-right text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">Users In This Discussion</div>
                <div className="flex justify-end gap-1.5 flex-wrap">
                  {participants.map((p) => (
                    <Link key={p.id} to={`/user/${p.id}`} title={p.name} className="w-8 h-8 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-[10px] text-slate-300 hover:border-amber-500/50 transition">
                      {p.avatar ? <img src={fileUrl(p.avatar)} alt="" className="w-full h-full object-cover" /> : (p.name?.[0] || "?")}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      />

      <main className="flex-1 min-w-0 px-4 sm:px-8 py-8">
        <h1 className="font-heading text-3xl text-white font-bold mb-6">CineVerse Forum</h1>

        <section className="rounded-lg overflow-hidden border border-white/5 mb-6" data-testid="thread-detail-container">
          {/* Breadcrumb header */}
          <div className="px-5 py-3 bg-white/[0.04] border-b border-white/5 flex items-center flex-wrap gap-x-1">
            <span className="text-sm text-slate-400">Support</span>
            <span className="mx-1 text-slate-500">›</span>
            <span className="text-sm font-semibold text-white">{catLabel[thread.category] || "General"}</span>
            {entityHref && thread.entity_title && (
              <>
                <span className="mx-1 text-slate-500">·</span>
                <Link to={entityHref} className="text-sm text-amber-400 hover:text-amber-300">{thread.entity_title}</Link>
              </>
            )}
          </div>

          {/* Original post */}
          <div className="p-5 border-b border-white/5 bg-[#0d1220]/40">
            <h2 className="font-heading text-2xl text-white font-bold" data-testid="thread-title">{thread.title}</h2>
            <div className="mt-3 flex items-start gap-4">
              <Link to={`/user/${thread.user_id}`} className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">
                  {thread.user_avatar ? <img src={fileUrl(thread.user_avatar)} alt="" className="w-full h-full object-cover" /> : (thread.user_name?.[0] || "?")}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/user/${thread.user_id}`} className="font-semibold text-white hover:text-amber-400">{thread.user_name}</Link>
                  {thread.user_role && thread.user_role !== "user" && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${roleTint[thread.user_role] || "bg-white/5 text-slate-300 border-white/10"}`}>
                      {thread.user_role === "moderator" ? "MOD" : thread.user_role}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">· {timeAgo(thread.created_at)}</span>
                  <span className="mx-1 text-slate-600">·</span>
                  {thread.status === "closed" ? (
                    <span className="uppercase font-bold text-slate-500 line-through text-xs" data-testid="thread-status">Closed</span>
                  ) : (
                    <span className="uppercase font-bold text-emerald-400 text-xs" data-testid="thread-status">Open</span>
                  )}
                </div>
                <div className="mt-3 text-slate-200 whitespace-pre-wrap break-words leading-relaxed">{thread.body}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-2.5 bg-white/[0.02] text-xs text-slate-400">
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
        </section>

        {/* Replies count divider */}
        <div className="flex items-center gap-2 justify-center py-4 text-sm text-slate-400" data-testid="replies-divider">
          <MessageSquare className="w-4 h-4" /> {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </div>

        {/* System log lines */}
        {systemLog.length > 0 && (
          <div className="mb-4 space-y-1">
            {systemLog.map((m) => (
              <div key={m.id} className="text-xs text-slate-500 text-center" data-testid={`thread-msg-${m.id}`}>
                <Lock className="w-3 h-3 inline mr-1" /> {m.text} · {timeAgo(m.created_at)}
              </div>
            ))}
          </div>
        )}

        {/* Replies */}
        <div className="space-y-3">
          {replies.map((m) => (
            <Post
              key={m.id}
              testId={`thread-msg-${m.id}`}
              author={{ id: m.user_id, name: m.user_name }}
              avatarUrl={m.user_avatar}
              role={m.user_role}
              when={timeAgo(m.created_at)}
            >
              {m.text}
            </Post>
          ))}
          {replies.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 bg-[#0d1220]/40 py-8 text-center text-slate-500 text-sm">
              No replies yet. Be the first!
            </div>
          )}
        </div>

        {/* Reply form */}
        {canReply ? (
          <form onSubmit={submit} className="mt-6 rounded-lg border border-white/10 bg-[#0d1220]/40 p-4">
            <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className="bg-[#0a0d14] border-white/10 text-white" data-testid="thread-reply-input" />
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={posting || !reply.trim()} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="thread-reply-btn">
                <Send className="w-4 h-4 mr-2" /> Post reply
              </Button>
            </div>
          </form>
        ) : !user ? (
          <div className="mt-6 rounded-lg border border-white/10 bg-[#0d1220]/40 p-6 text-slate-400 text-sm">
            <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">Sign in</Link> to reply.
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-white/10 bg-[#0d1220]/40 p-6 text-slate-400 text-sm">
            This thread is closed. Only moderators can reply.
          </div>
        )}
      </main>
    </div>
  );
}
