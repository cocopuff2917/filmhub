import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { api } from "@/lib/api";

export default function ContributorGuidelines() {
  const [guidelines, setGuidelines] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/contributor-guidelines")
      .then((response) => { if (active) setGuidelines(response.data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#0a0d14] text-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <header className="mt-8 border-b border-white/10 pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
            <BookOpen className="h-4 w-4" /> Community
          </div>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl" data-testid="contributor-guidelines-title">
            {guidelines?.title || "Contributor Guidelines"}
          </h1>
        </header>
        {failed ? (
          <p role="alert" className="py-8 text-sm text-rose-300">Guidelines could not be loaded.</p>
        ) : !guidelines ? (
          <p className="py-8 text-sm text-slate-400">Loading guidelines…</p>
        ) : (
          <div className="whitespace-pre-wrap py-8 text-base leading-7 text-slate-200" data-testid="contributor-guidelines-content">
            {guidelines.content}
          </div>
        )}
      </div>
    </main>
  );
}