import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_ROOT = `${API}/v1`;

function formatDate(value) {
  if (!value) return "Never used";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never used" : `Last used ${date.toLocaleString()}`;
}

export default function APIKeys({ embedded = false }) {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState("");

  const loadKeys = async () => {
    try {
      const response = await api.get("/api-keys");
      setKeys(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const createKey = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const response = await api.post("/api-keys", { name: name.trim() });
      setNewSecret(response.data.api_key);
      setName("");
      await loadKeys();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create API key");
    } finally {
      setSaving(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(newSecret);
      toast.success("API key copied");
    } catch {
      toast.error("Could not copy API key");
    }
  };

  const revokeKey = async (id) => {
    setRevoking(id);
    try {
      await api.delete(`/api-keys/${id}`);
      setKeys((current) => current.filter((key) => key.id !== id));
      toast.success("API key revoked");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not revoke API key");
    } finally {
      setRevoking("");
    }
  };

  return (
    <div className={embedded ? "text-white" : "min-h-screen bg-[#0d0f12] text-white"}>
      <div className={embedded ? "py-7" : "max-w-4xl mx-auto px-4 sm:px-6 py-10"}>
        <header className="border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <KeyRound className="w-6 h-6 text-amber-400" aria-hidden="true" />
            <h1 className="font-heading text-2xl font-bold">API Keys</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">Create credentials for read-only movie and television data.</p>
        </header>

        <section className="py-6 border-b border-white/10">
          <h2 className="text-base font-semibold">Create a key</h2>
          <form onSubmit={createKey} className="mt-3 flex flex-col sm:flex-row gap-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name, for example: Home dashboard"
              maxLength={60}
              className="sm:max-w-md bg-white/5 border-white/15 text-white"
              aria-label="API key name"
              required
            />
            <Button type="submit" disabled={saving || !name.trim()} className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="w-4 h-4 mr-2" />{saving ? "Creating..." : "Create key"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">You can have up to 10 active keys. Keep each key private.</p>
          {newSecret && (
            <div className="mt-4 border border-amber-400/40 bg-amber-400/10 p-4" role="status">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-200">Copy this key now. It will not be shown again.</p>
                  <code className="mt-2 block max-w-full break-all text-sm text-white">{newSecret}</code>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={copySecret} className="border-white/20 bg-transparent text-white hover:bg-white/10">
                  <Copy className="w-4 h-4 mr-2" />Copy
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNewSecret("")} className="mt-2 px-0 text-slate-300 hover:bg-transparent hover:text-white">
                Dismiss
              </Button>
            </div>
          )}
        </section>

        <section className="py-6 border-b border-white/10">
          <h2 className="text-base font-semibold">Your active keys</h2>
          {loading ? <p className="mt-3 text-sm text-slate-400">Loading keys...</p> : keys.length ? (
            <ul className="mt-3 divide-y divide-white/10">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{key.name}</p>
                    <p className="mt-1 text-xs text-slate-400">cv_live_...{key.last_four} · {formatDate(key.last_used_at)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={`Revoke ${key.name}`}
                    aria-label={`Revoke ${key.name}`}
                    disabled={revoking === key.id}
                    onClick={() => revokeKey(key.id)}
                    className="text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-400">No active API keys.</p>}
        </section>

        <section className="py-6">
          <h2 className="text-base font-semibold">Read-only API</h2>
          <p className="mt-2 text-sm text-slate-400">Send your key in the <code className="text-slate-200">X-API-Key</code> header. List endpoints accept <code className="text-slate-200">q</code>, <code className="text-slate-200">genre</code>, <code className="text-slate-200">year</code>, <code className="text-slate-200">min_rating</code>, <code className="text-slate-200">sort</code>, and <code className="text-slate-200">limit</code> where applicable.</p>
          <div className="mt-4 space-y-2 text-sm">
            <code className="block overflow-x-auto border border-white/10 bg-black/20 p-3">GET {API_ROOT}/movies</code>
            <code className="block overflow-x-auto border border-white/10 bg-black/20 p-3">GET {API_ROOT}/movies/{"{movie_id}"}</code>
            <code className="block overflow-x-auto border border-white/10 bg-black/20 p-3">GET {API_ROOT}/series</code>
            <code className="block overflow-x-auto border border-white/10 bg-black/20 p-3">GET {API_ROOT}/series/{"{series_id}"}</code>
          </div>
          <pre className="mt-3 overflow-x-auto border border-white/10 bg-black/20 p-3 text-xs text-slate-300"><code>{`curl -H "X-API-Key: YOUR_API_KEY" "${API_ROOT}/movies?limit=10"`}</code></pre>
        </section>
      </div>
    </div>
  );
}