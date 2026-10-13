import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const s = {
  heading: { fontSize: 28, fontWeight: 700, marginBottom: 8 },
  sub: { color: "#888", marginBottom: 32, fontSize: 14 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 },
  card: { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: 20, textDecoration: "none", color: "inherit", display: "block", transition: "border-color 0.15s" },
  genre: { fontSize: 11, textTransform: "uppercase", color: "#e50914", fontWeight: 600, letterSpacing: 1, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  year: { color: "#888", fontSize: 13, marginBottom: 8 },
  director: { color: "#aaa", fontSize: 13, marginBottom: 10 },
  synopsis: { color: "#999", fontSize: 13, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" },
  meta: { marginTop: 12, paddingTop: 12, borderTop: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", fontSize: 13, color: "#aaa" },
  stars: { color: "#f5c518" },
  empty: { textAlign: "center", padding: "80px 0", color: "#555" },
};

function Stars({ rating }) {
  if (!rating) return <span style={{ color: "#555" }}>No ratings yet</span>;
  return <span style={s.stars}>{"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))} {Number(rating).toFixed(1)}</span>;
}

export default function FilmList() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/films").then(r => r.json()).then(data => { setFilms(data); setLoading(false); });
  }, []);

  const filtered = films.filter(f =>
    f.title.toLowerCase().includes(search.toLowerCase()) ||
    (f.director || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <p style={{ color: "#555" }}>Loading films…</p>;

  return (
    <div>
      <h1 style={s.heading}>All Films</h1>
      <p style={s.sub}>{films.length} film{films.length !== 1 ? "s" : ""} · Rate, review, and discuss</p>
      <input
        placeholder="Search by title or director…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", padding: "10px 14px", marginBottom: 28, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#f0f0f0", fontSize: 14, outline: "none" }}
      />
      {filtered.length === 0 ? (
        <div style={s.empty}><p style={{ fontSize: 36, marginBottom: 12 }}>🎬</p><p>No films found.</p></div>
      ) : (
        <div style={s.grid}>
          {filtered.map(film => (
            <Link key={film.id} to={`/films/${film.id}`} style={s.card}>
              <div style={s.genre}>{film.genre || "Film"}</div>
              <div style={s.title}>{film.title}</div>
              <div style={s.year}>{film.year} · {film.director}</div>
              <div style={s.synopsis}>{film.synopsis}</div>
              <div style={s.meta}>
                <Stars rating={film.avg_rating} />
                <span>{film.review_count} review{film.review_count !== 1 ? "s" : ""}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
