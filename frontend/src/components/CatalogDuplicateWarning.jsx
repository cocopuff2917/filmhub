import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

export default function CatalogDuplicateWarning({ kind, title, date }) {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const cleanedTitle = title.trim();
    if (cleanedTitle.length < 3) {
      setMatches([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post("/catalog/duplicates", { kind, title: cleanedTitle, date: date || "" });
        if (active) setMatches(response.data || []);
      } catch {
        if (active) setMatches([]);
      }
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [kind, title, date]);

  if (!matches.length) return null;
  return (
    <aside className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3" role="status" data-testid="catalog-duplicate-warning">
      <div className="text-xs font-semibold uppercase tracking-widest text-amber-300">Possible existing titles</div>
      <ul className="mt-2 space-y-1.5">
        {matches.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to={item.url} target="_blank" className="text-white hover:text-amber-200 underline decoration-white/20 underline-offset-2">{item.title}{item.date ? ` (${item.date.slice(0, 4)})` : ""}</Link>
            <span className="text-xs text-slate-400">{item.similarity}% match</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">Check these records before creating a new entry.</p>
    </aside>
  );
}
