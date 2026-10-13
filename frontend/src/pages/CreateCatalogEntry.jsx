import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Clapperboard, Tv } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import MovieForm from "@/components/forms/MovieForm";
import SeriesForm from "@/components/forms/SeriesForm";

export default function CreateCatalogEntry({ kind }) {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();
  const isMovie = kind === "movie";
  const label = isMovie ? "Movie" : "TV series";
  const backHref = isMovie ? "/browse" : "/browse?tab=series";

  if (initializing) return <main className="min-h-[calc(100vh-64px)] bg-[#0d0f12]" />;
  if (!user) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-[#0d0f12] px-4 py-20 text-center text-slate-300">
        <h1 className="font-heading text-2xl font-bold text-white">Sign in to create a {label.toLowerCase()}</h1>
        <Link to="/login" className="mt-4 inline-block text-sm font-medium text-amber-400 hover:text-amber-300">Sign in</Link>
      </main>
    );
  }

  const onSaved = (result) => {
    if (result?.id) navigate(isMovie ? `/movie/${result.id}` : `/series/${result.id}`);
  };
  const Form = isMovie ? MovieForm : SeriesForm;
  const Icon = isMovie ? Clapperboard : Tv;

  return (
    <main className="min-h-screen bg-[#0d0f12] text-white" data-testid={`create-${kind}-page`}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to={backHref} className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to {isMovie ? "movies" : "TV series"}
        </Link>
        <header className="mt-6 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <Icon className="h-6 w-6 text-amber-400" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase text-amber-300">Catalog contribution</p>
              <h1 className="mt-1 font-heading text-2xl font-bold">Add a {label}</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">Add accurate details to the CineVerse catalog. Required fields are marked in the form.</p>
        </header>
        <section className="py-7">
          <Form onSaved={onSaved} onCancel={() => navigate(backHref)} />
        </section>
      </div>
    </main>
  );
}
