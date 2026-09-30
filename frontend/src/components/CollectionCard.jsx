import { Link } from "react-router-dom";
import { fileUrl } from "@/lib/api";
import { Layers } from "lucide-react";

/**
 * Compact "Part of the X Collection" card shown on movie/series detail pages.
 * Renders one card per collection the title belongs to.
 */
export default function CollectionCard({ collection }) {
  if (!collection || !collection.id) return null;
  const bg = collection.backdrop_url ? fileUrl(collection.backdrop_url) : "";
  return (
    <Link
      to={`/collection/${collection.id}`}
      className="group relative block rounded-2xl overflow-hidden border border-white/10 hover:border-amber-500/40 transition"
      data-testid={`collection-card-${collection.id}`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundColor: bg ? undefined : "#14181f" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
      <div className="relative z-10 flex items-center gap-4 p-5">
        {collection.poster_url ? (
          <img
            src={fileUrl(collection.poster_url)}
            alt=""
            className="w-16 h-24 rounded-lg object-cover border border-white/10 flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-24 rounded-lg bg-[#1e2430] border border-white/10 flex items-center justify-center flex-shrink-0">
            <Layers className="w-6 h-6 text-slate-500" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">Part of the Collection</div>
          <div className="mt-1 font-heading text-lg text-white font-semibold group-hover:text-amber-400 transition-colors line-clamp-1">
            {collection.name}
          </div>
          {collection.description && (
            <div className="mt-1 text-xs text-slate-300 line-clamp-2">{collection.description}</div>
          )}
          <div className="mt-2 text-xs text-amber-300 group-hover:text-amber-200">View the collection →</div>
        </div>
      </div>
    </Link>
  );
}
