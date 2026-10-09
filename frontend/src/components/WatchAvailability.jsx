import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ExternalLink, ShoppingBag } from "lucide-react";

const REGIONS = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["AU", "Australia"],
  ["IN", "India"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["JP", "Japan"],
];

function browserRegion() {
  if (typeof navigator === "undefined") return "US";
  const region = navigator.language?.split("-")[1]?.toUpperCase();
  return /^[A-Z]{2}$/.test(region || "") ? region : "US";
}

export default function WatchAvailability({ kind, id, manualOptions = [] }) {
  const [region, setRegion] = useState(browserRegion);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    api.get(`/${kind === "movie" ? "movies" : "series"}/${id}/watch-providers`, { params: { region } })
      .then((response) => { if (active) setAvailability(response.data); })
      .catch(() => { if (active) { setAvailability(null); setFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, id, region]);

  const categories = availability?.categories || [];
  const validManualOptions = (manualOptions || []).filter((option) => option.provider?.trim() && /^https?:\/\//i.test(option.url || ""));

  return (
    <section className="rounded-xl border border-white/10 bg-[#14181f] p-4" data-testid={`${kind}-watch-availability`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-300">
          <ShoppingBag className="h-4 w-4 text-amber-400" /> Where to watch
        </h2>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Region
          <select value={region} onChange={(event) => setRegion(event.target.value)} className="h-8 rounded-md border border-white/10 bg-[#0d0f12] px-2 text-xs text-white" aria-label="Availability region" data-testid={`${kind}-watch-region`}>
            {!REGIONS.some(([code]) => code === region) && <option value={region}>{region}</option>}
            {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Checking availability…</p>
      ) : categories.length ? (
        <div className="mt-4 space-y-4">
          {categories.map((category) => (
            <div key={category.id} data-testid={`${kind}-watch-category-${category.id}`}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{category.label}</h3>
              <div className="flex flex-wrap gap-2">
                {category.providers.map((provider) => (
                  provider.url ? (
                    <a key={`${category.id}-${provider.provider_id}`} href={provider.url} target="_blank" rel="noopener noreferrer" title={`Open ${provider.provider}`} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-[#0d0f12] px-2.5 py-2 text-sm text-slate-200 hover:border-amber-500/40 hover:text-white">
                      {provider.logo_url ? <img src={provider.logo_url} alt="" className="h-6 w-6 rounded object-cover" loading="lazy" /> : null}
                      <span>{provider.provider}</span>
                      {provider.price != null && provider.price !== "" && <span className="font-semibold text-emerald-300">{provider.price}</span>}
                      <ExternalLink className="h-3 w-3 text-slate-500" />
                    </a>
                  ) : (
                    <span key={`${category.id}-${provider.provider_id}`} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-[#0d0f12] px-2.5 py-2 text-sm text-slate-200">
                      {provider.logo_url ? <img src={provider.logo_url} alt="" className="h-6 w-6 rounded object-cover" loading="lazy" /> : null}
                      <span>{provider.provider}</span>
                      {provider.price != null && provider.price !== "" && <span className="font-semibold text-emerald-300">{provider.price}</span>}
                    </span>
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{failed ? "Automatic availability could not be loaded." : availability?.configured === false ? "Automatic availability is not configured yet. Manually added links are shown below." : `No streaming or purchase providers found in ${region}.`}</p>
      )}

      {validManualOptions.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Additional links</h3>
          <div className="space-y-2">
            {validManualOptions.map((option, index) => (
              <a key={`${option.provider}-${option.url}-${index}`} href={option.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-white/[0.03] px-3 py-2.5 text-sm text-white hover:border-amber-500/40 hover:bg-amber-500/5">
                <span>{option.provider}</span>
                <span className="ml-auto text-[10px] uppercase tracking-widest text-slate-400">{option.availability_type || "buy"}</span>
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] text-slate-600">
        {availability?.source === "Watchmode"
          ? "Availability, direct links, and prices by Watchmode. Prices may change at the provider."
          : "Availability data by JustWatch via TMDB. Direct provider links and prices require Watchmode data."}
      </p>
    </section>
  );
}
