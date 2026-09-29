import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { Trophy, Medal } from "lucide-react";

function fmtCountdown(ms) {
  if (ms <= 0) return "resetting soon";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const podium = ["text-amber-300", "text-slate-300", "text-orange-400"];
const podiumIcon = [<Trophy className="w-5 h-5" />, <Medal className="w-5 h-5" />, <Medal className="w-5 h-5" />];

export default function Leaderboard() {
  const [data, setData] = useState({ top: [], next_reset_at: null });
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    api.get("/leaderboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!data.next_reset_at) return;
    const tick = () => {
      const remain = new Date(data.next_reset_at).getTime() - Date.now();
      setCountdown(fmtCountdown(remain));
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [data.next_reset_at]);

  if (!data.top.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="leaderboard-section">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400/90">
            <Trophy className="w-5 h-5" /> Weekly Contributor Leaderboard
          </div>
          <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Top Editors This Week</h2>
        </div>
        {countdown && (
          <div className="text-xs uppercase tracking-widest text-slate-500">
            Resets in <span className="text-amber-400 font-mono">{countdown}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.top.map((t, i) => (
          <Link
            to={`/user/${t.user_id}`}
            key={t.user_id}
            className={`rounded-xl bg-[#14181f] border border-white/10 p-4 hover:border-amber-500/40 hover:bg-amber-500/5 transition flex items-center gap-4 ${i === 0 ? "ring-1 ring-amber-500/50" : ""}`}
            data-testid={`leaderboard-row-${i}`}
          >
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display text-xl ${i < 3 ? podium[i] : "text-slate-500"}`}>
              {i < 3 ? podiumIcon[i] : `#${i + 1}`}
            </div>
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-sm text-slate-400 flex-shrink-0">
              {t.user_avatar ? <img src={fileUrl(t.user_avatar)} alt="" className="w-full h-full object-cover" /> : (t.user_name?.[0] || "?")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate flex items-center gap-2">
                {t.user_name}
                {t.custom_role && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest" style={{ color: t.custom_role.color, borderColor: t.custom_role.color + "66", background: t.custom_role.color + "22" }}>
                    {t.custom_role.name}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t.count} edit{t.count !== 1 && "s"} this week</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
