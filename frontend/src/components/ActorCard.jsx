import { Link } from "react-router-dom";
import { fileUrl } from "@/lib/api";
import ImageWithFallback from "@/components/ImageWithFallback";

export default function ActorCard({ actor, testid }) {
  const photo = actor.photo_url ? fileUrl(actor.photo_url) : null;
  return (
    <Link
      to={`/actor/${actor.id}`}
      className="group block rounded-xl overflow-hidden bg-[#14181f] border border-white/5 poster-hover"
      data-testid={testid || `actor-card-${actor.id}`}
    >
      <div className="aspect-square bg-[#1e2430] overflow-hidden">
        <ImageWithFallback
          src={photo}
          fallbackSrc={fileUrl(actor.photo_url, "jpeg")}
          alt={actor.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          fallback={<div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-3xl">{actor.name?.[0]}</div>}
        />
      </div>
      <div className="p-3">
        <div className="font-semibold text-white text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">{actor.name}</div>
        {actor.birth_date && <div className="text-xs text-slate-500 mt-0.5">Born {actor.birth_date.slice(0, 4)}</div>}
      </div>
    </Link>
  );
}
