import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";

function timeAgo(iso) {
  if (!iso) return "";
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function EntityForumThreads({ entityType, entityId, entityTitle }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get("/threads", { params: { entity_type: entityType, entity_id: entityId } })
      .then((response) => { if (active) setThreads(response.data); })
      .catch(() => { if (active) setThreads([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityType, entityId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!user) return;
    if (title.trim().length < 3) {
      toast.error("Title must be at least 3 characters");
      return;
    }
    if (!body.trim()) return;

    setPosting(true);
    try {
      const response = await api.post("/threads", {
        title: title.trim(),
        body: body.trim(),
        category: "general",
        entity_type: entityType,
        entity_id: entityId,
        entity_title: entityTitle,
      });
      setThreads((current) => [response.data, ...current]);
      setTitle("");
      setBody("");
      setCreateOpen(false);
      toast.success("Discussion created");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create discussion");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div data-testid="entity-forum-threads">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {threads.length} forum thread{threads.length !== 1 ? "s" : ""}
        </p>
        {user ? (
          <Button type="button" onClick={() => setCreateOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="start-entity-discussion-btn">
            <Plus className="mr-2 h-4 w-4" /> Start a discussion
          </Button>
        ) : (
          <Link to="/login" className="text-sm font-medium text-amber-400 hover:text-amber-300">Sign in to start a discussion</Link>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Loading forum threads…</div>
      ) : threads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-sm text-slate-500">
          No forum threads yet. Start the conversation.
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/5 bg-[#0d1220]/40" data-testid="entity-forum-thread-list">
          {threads.map((thread) => (
            <li key={thread.id} data-testid={`entity-forum-thread-${thread.id}`}>
              <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1e2430] text-xs text-slate-400">
                  {thread.user_avatar ? (
                    <img src={fileUrl(thread.user_avatar)} alt="" className="h-full w-full object-cover" />
                  ) : (thread.user_name?.[0] || "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/threads/${thread.id}`} className="font-semibold text-white hover:text-amber-300" data-testid={`entity-forum-thread-link-${thread.id}`}>
                    {thread.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="text-slate-400">{thread.user_name || "Anonymous"}</span>
                    <span className="mx-1.5">·</span>{timeAgo(thread.last_activity_at || thread.created_at)}
                  </p>
                  {thread.body && <p className="mt-2 line-clamp-2 break-words text-sm text-slate-400">{thread.body}</p>}
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className={thread.status === "closed" ? "font-semibold uppercase text-slate-500" : "font-semibold uppercase text-emerald-400"}>
                      {thread.status === "closed" ? "Closed" : "Open"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <MessageSquare className="h-3.5 w-3.5" /> {thread.message_count || 0} replies
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-white/10 bg-[#14181f] text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Start a discussion about {entityTitle}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm text-slate-300">
              Title
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required className="mt-1.5 border-white/10 bg-[#0d0f12] text-white" data-testid="entity-thread-title-input" />
            </label>
            <label className="block text-sm text-slate-300">
              Post
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={5} required className="mt-1.5 border-white/10 bg-[#0d0f12] text-white" data-testid="entity-thread-body-input" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={posting} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button type="submit" disabled={posting || !title.trim() || !body.trim()} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="entity-thread-create-btn">
                {posting ? "Posting…" : "Create thread"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}