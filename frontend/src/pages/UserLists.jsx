import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clipboard, Film, ListPlus, LockKeyhole, Plus, Search, Share2, Tv, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UserLists() {
  const { listId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      const response = await api.get("/user-lists");
      setLists(response.data || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load your lists");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/user-lists/${listId}`);
      setList(response.data);
      setName(response.data.name);
      setDescription(response.data.description || "");
      setIsPublic(response.data.is_public);
    } catch (error) {
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    if (!user && !listId) {
      navigate("/login");
      return;
    }
    if (listId) loadList();
    else if (user) loadLists();
  }, [listId, user, navigate, loadList, loadLists]);

  useEffect(() => {
    if (!listId || !query.trim()) {
      setResults([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      api.get("/search/suggest", { params: { q: query.trim(), limit: 5 } })
        .then((response) => {
          if (active) setResults([...(response.data.movies || []), ...(response.data.series || [])]);
        })
        .catch(() => { if (active) setResults([]); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [listId, query]);

  const createList = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.post("/user-lists", { name, description, is_public: isPublic });
      toast.success("List created");
      navigate(`/list/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create list");
    } finally {
      setSaving(false);
    }
  };

  const saveList = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.patch(`/user-lists/${listId}`, { name, description, is_public: isPublic });
      setList((current) => ({ ...current, ...response.data }));
      toast.success("List updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update list");
    } finally {
      setSaving(false);
    }
  };

  const addTitle = async (item) => {
    try {
      await api.post(`/user-lists/${listId}/items`, { kind: item.kind, title_id: item.id });
      setQuery("");
      setResults([]);
      await loadList();
      toast.success(`Added ${item.title}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not add title");
    }
  };

  const removeTitle = async (item) => {
    try {
      await api.delete(`/user-lists/${listId}/items/${item.type}/${item.id}`);
      setList((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id || entry.type !== item.type) }));
      toast.success("Title removed");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not remove title");
    }
  };

  const deleteList = async () => {
    if (!window.confirm(`Delete “${list.name}”? This cannot be undone.`)) return;
    try {
      await api.delete(`/user-lists/${listId}`);
      toast.success("List deleted");
      navigate("/lists");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not delete list");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("List link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  if (!user && !listId) return null;
  if (loading) return <main className="min-h-screen bg-[#0d0f12] px-4 py-20 text-center text-slate-400">Loading lists…</main>;

  if (!listId) return (
    <main className="min-h-screen bg-[#0d0f12] text-white" data-testid="my-lists-page">
      <header className="border-b border-white/10 bg-[#10151d]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Your CineVerse</div>
          <h1 className="mt-2 font-display text-4xl text-white sm:text-5xl">MY LISTS</h1>
          <p className="mt-2 text-sm text-slate-400">Build and share your own movie and TV collections.</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          {lists.length ? (
            <div className="divide-y divide-white/10">
              {lists.map((item) => (
                <Link key={item.id} to={`/list/${item.id}`} className="flex items-center justify-between gap-4 py-5 hover:text-amber-200" data-testid={`user-list-${item.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-white"><span className="truncate">{item.name}</span>{item.is_public ? <Share2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-300" /> : <LockKeyhole className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{item.description || "No description"}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-slate-500">{item.item_count} titles</span>
                </Link>
              ))}
            </div>
          ) : <div className="border-y border-dashed border-white/10 py-12 text-center text-sm text-slate-500">Your lists will appear here.</div>}
        </section>
        <form onSubmit={createList} className="h-fit border-t border-amber-400/50 pt-5" data-testid="create-user-list-form">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><ListPlus className="h-5 w-5 text-amber-300" /> Create a list</h2>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="e.g. Essential sci-fi" className="mt-4 border-white/10 bg-white/5 text-white" aria-label="List name" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="What belongs on this list?" className="mt-3 min-h-24 w-full rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-500" aria-label="List description" />
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="accent-amber-400" /> Make this list public and shareable</label>
          <Button type="submit" disabled={saving || !name.trim()} className="mt-4 w-full bg-amber-500 text-black hover:bg-amber-400"><Plus className="mr-2 h-4 w-4" />{saving ? "Creating…" : "Create list"}</Button>
        </form>
      </div>
    </main>
  );

  if (!list) return <main className="min-h-screen bg-[#0d0f12] px-4 py-20 text-center text-slate-300"><p>List not found or not shared publicly.</p><Link className="mt-4 inline-block text-amber-300" to="/lists">Back to your lists</Link></main>;

  return (
    <main className="min-h-screen bg-[#0d0f12] text-white" data-testid="user-list-detail">
      <header className="border-b border-white/10 bg-[#10151d]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Link to={list.can_edit ? "/lists" : `/user/${list.owner_id}`} className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> {list.can_edit ? "My lists" : `${list.owner_name}'s profile`}</Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-300">{list.is_public ? <Share2 className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}{list.is_public ? "Shared list" : "Private list"} · by <Link to={`/user/${list.owner_id}`} className="hover:text-white">{list.owner_name}</Link></div>
              <h1 className="mt-2 font-display text-4xl sm:text-5xl">{list.name}</h1>
              {list.description && <p className="mt-2 max-w-2xl text-sm text-slate-300">{list.description}</p>}
              <p className="mt-3 text-xs text-slate-500">{list.items.length} title{list.items.length !== 1 ? "s" : ""}</p>
            </div>
            {list.is_public && <Button type="button" variant="outline" onClick={copyLink} className="border-white/15 bg-transparent text-white hover:bg-white/10"><Clipboard className="mr-2 h-4 w-4" /> Copy link</Button>}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {list.can_edit && <div className="grid gap-8 border-b border-white/10 pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={saveList} className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">List details</h2>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required className="border-white/10 bg-white/5 text-white" aria-label="List name" />
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} className="min-h-20 w-full rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white" aria-label="List description" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="accent-amber-400" /> Public and shareable</label>
              <div className="flex gap-2"><Button type="button" variant="outline" onClick={deleteList} className="border-rose-500/30 text-rose-200 hover:bg-rose-500/10"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button><Button type="submit" disabled={saving || !name.trim()} className="bg-amber-500 text-black hover:bg-amber-400">{saving ? "Saving…" : "Save details"}</Button></div>
            </div>
          </form>
          <section>
            <h2 className="font-heading text-lg font-semibold">Add a title</h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies and TV" className="border-white/10 bg-white/5 pl-9 text-white" aria-label="Search titles to add" />
            </div>
            {results.length > 0 && <div className="mt-2 divide-y divide-white/10 border-y border-white/10">
              {results.map((item) => <button key={`${item.kind}-${item.id}`} type="button" onClick={() => addTitle(item)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-white/5">
                <span className="grid h-12 w-9 flex-shrink-0 place-items-center overflow-hidden bg-white/5">{item.poster_url ? <img src={fileUrl(item.poster_url)} alt="" className="h-full w-full object-cover" /> : item.kind === "series" ? <Tv className="h-4 w-4 text-slate-500" /> : <Film className="h-4 w-4 text-slate-500" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{item.title}</span><span className="text-xs text-slate-500">{item.kind === "series" ? "TV series" : "Movie"}{item.year ? ` · ${item.year}` : ""}</span></span><Plus className="h-4 w-4 text-amber-300" />
              </button>)}
            </div>}
          </section>
        </div>}
        {list.items.length ? <div className="divide-y divide-white/10">
          {list.items.map((item) => <div key={`${item.type}-${item.id}`} className="flex items-center gap-4 py-4">
            <Link to={item.type === "series" ? `/series/${item.id}` : `/movie/${item.id}`} className="flex min-w-0 flex-1 items-center gap-4">
              <div className="h-20 w-14 flex-shrink-0 overflow-hidden bg-white/5">{item.poster_url && <img src={fileUrl(item.poster_url)} alt="" className="h-full w-full object-cover" />}</div>
              <span className="min-w-0"><span className="block truncate font-semibold text-white hover:text-amber-200">{item.title}</span><span className="mt-1 flex items-center gap-1.5 text-xs uppercase text-slate-500">{item.type === "series" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}{item.type}{item.release_date || item.first_air_date ? ` · ${(item.release_date || item.first_air_date).slice(0, 4)}` : ""}</span></span>
            </Link>
            {list.can_edit && <Button type="button" variant="ghost" size="icon" onClick={() => removeTitle(item)} title="Remove title" aria-label={`Remove ${item.title}`} className="text-slate-400 hover:text-rose-300"><Trash2 className="h-4 w-4" /></Button>}
          </div>)}
        </div> : <div className="py-16 text-center text-sm text-slate-500">No titles in this list yet.</div>}
      </div>
    </main>
  );
}