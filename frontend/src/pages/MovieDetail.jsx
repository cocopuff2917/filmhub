import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Star, Bookmark, BookmarkCheck, PlayCircle, Calendar, Clock, Users, ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function MovieDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [movie, setMovie] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(8);
  const [reviewText, setReviewText] = useState("");
  const [inWatchlist, setInWatchlist] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [m, r] = await Promise.all([
      api.get(`/movies/${id}`),
      api.get(`/movies/${id}/reviews`),
    ]);
    setMovie(m.data);
    setReviews(r.data);
    setLoading(false);
    if (user) {
      try {
        const wl = await api.get("/watchlist");
        setInWatchlist(wl.data.some((mv) => mv.id === id));
      } catch {}
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, user]);

  const toggleWatchlist = async () => {
    if (!user) { toast.error("Sign in to save movies"); return; }
    try {
      if (inWatchlist) {
        await api.delete(`/watchlist/${id}`);
        setInWatchlist(false); toast.success("Removed from watchlist");
      } else {
        await api.post(`/watchlist/${id}`);
        setInWatchlist(true); toast.success("Added to watchlist");
      }
    } catch { toast.error("Something went wrong"); }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to rate"); return; }
    try {
      await api.post(`/movies/${id}/reviews`, { rating: Number(rating), text: reviewText });
      toast.success("Review submitted");
      setReviewText("");
      load();
    } catch { toast.error("Failed to submit review"); }
  };

  if (loading || !movie) {
    return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;
  }

  const year = movie.release_date ? movie.release_date.slice(0, 4) : "";
  const backdrop = movie.backdrop_url ? fileUrl(movie.backdrop_url) : (movie.poster_url ? fileUrl(movie.poster_url) : null);
  const poster = movie.poster_url ? fileUrl(movie.poster_url) : null;

  return (
    <div>
      {/* Header */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {backdrop && <img src={backdrop} alt="" className="w-full h-full object-cover blur-sm opacity-30" />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d0f12]/70 via-[#0d0f12]/85 to-[#0d0f12]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,240px)_1fr] lg:grid-cols-[minmax(0,300px)_1fr] gap-8 items-start">
            <div className="rounded-xl overflow-hidden bg-[#1e2430] border border-white/10 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)] aspect-[2/3]">
              {poster ? (
                <img src={poster} alt={movie.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-2xl">NO POSTER</div>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
                {movie.genres && movie.genres.map((g) => (
                  <Badge key={g} className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25" data-testid={`genre-badge-${g}`}>{g}</Badge>
                ))}
              </div>
              <h1 className="mt-4 font-display text-5xl sm:text-6xl lg:text-7xl leading-none tracking-tight text-white" data-testid="movie-title">
                {movie.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-5 text-sm text-slate-300">
                {year && <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-400" /> {movie.release_date}</span>}
                {movie.runtime ? <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400" /> {movie.runtime} min</span> : null}
                <span className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-white font-bold text-base">{movie.avg_rating != null ? movie.avg_rating : "—"}</span>
                  <span className="text-slate-500">/10 ({movie.rating_count || 0})</span>
                </span>
              </div>

              <p className="mt-6 text-slate-300 leading-relaxed max-w-3xl" data-testid="movie-synopsis">
                {movie.synopsis || "No synopsis available."}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  onClick={toggleWatchlist}
                  className={inWatchlist
                    ? "bg-white/10 hover:bg-white/15 text-white border border-white/20"
                    : "bg-amber-500 hover:bg-amber-600 text-black font-semibold"}
                  data-testid="watchlist-toggle-btn"
                >
                  {inWatchlist ? <BookmarkCheck className="w-4 h-4 mr-2" /> : <Bookmark className="w-4 h-4 mr-2" />}
                  {inWatchlist ? "In Watchlist" : "Add to Watchlist"}
                </Button>
                {movie.trailer_url && (
                  <a href={movie.trailer_url} target="_blank" rel="noreferrer">
                    <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="watch-trailer-btn">
                      <PlayCircle className="w-4 h-4 mr-2" /> Watch Trailer
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cast */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="cast-section">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
          <Users className="w-4 h-4" /> Top Billed
        </div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Cast & Crew</h2>
        {(!movie.cast || movie.cast.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">
            No cast added yet.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {movie.cast.map((c, idx) => (
              <Link to={`/actor/${c.actor.id}`} key={idx} className="group block rounded-xl overflow-hidden bg-[#14181f] border border-white/5 poster-hover" data-testid={`cast-card-${idx}`}>
                <div className="aspect-square bg-[#1e2430] overflow-hidden">
                  {c.actor.photo_url ? (
                    <img src={fileUrl(c.actor.photo_url)} alt={c.actor.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-xl">{c.actor.name?.[0] || "?"}</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-semibold text-white text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">{c.actor.name}</div>
                  <div className="text-xs text-slate-400 line-clamp-1">as {c.character_name}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Media Gallery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="gallery-section">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
          <ImageIcon className="w-4 h-4" /> Media
        </div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Gallery</h2>
        {movie.gallery && movie.gallery.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4">
            {movie.gallery.map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden aspect-video bg-[#1e2430] border border-white/5">
                <img src={fileUrl(img)} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-16 text-center text-slate-500">
            Promotional images and trailers will appear here.
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="reviews-section">
        <h2 className="font-heading text-3xl font-bold text-white">Ratings & Reviews</h2>
        {user ? (
          <form onSubmit={submitReview} className="mt-6 rounded-xl bg-[#14181f] border border-white/10 p-6">
            <label className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Your rating: <span className="text-amber-400 text-lg">{rating}/10</span></label>
            <input
              type="range" min="1" max="10" step="0.5" value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="w-full mt-3 accent-amber-500"
              data-testid="rating-slider"
            />
            <Textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your thoughts about this movie..."
              className="mt-4 bg-[#0d0f12] border-white/10 text-white"
              rows={3}
              data-testid="review-text-input"
            />
            <Button type="submit" className="mt-4 bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="submit-review-btn">
              Submit Review
            </Button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl bg-[#14181f] border border-white/10 p-6 text-slate-400 text-sm">
            <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">Sign in</Link> to rate this movie.
          </div>
        )}
        <div className="mt-8 space-y-4">
          {reviews.length === 0 ? (
            <div className="text-slate-500">No reviews yet. Be the first!</div>
          ) : reviews.map((r) => (
            <div key={r.id} className="rounded-xl bg-[#14181f] border border-white/10 p-5" data-testid={`review-${r.id}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white">{r.user_name || "Anonymous"}</div>
                <div className="flex items-center gap-1 text-amber-400 font-bold"><Star className="w-4 h-4 fill-amber-400" /> {r.rating}</div>
              </div>
              {r.text && <p className="mt-2 text-slate-300 text-sm">{r.text}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
