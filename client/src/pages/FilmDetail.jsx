import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const s = {
  back: { color: "#888", textDecoration: "none", fontSize: 13, display: "inline-block", marginBottom: 24 },
  header: { marginBottom: 32 },
  genre: { fontSize: 11, textTransform: "uppercase", color: "#e50914", fontWeight: 600, letterSpacing: 1, marginBottom: 8 },
  title: { fontSize: 36, fontWeight: 800, marginBottom: 6 },
  meta: { color: "#888", fontSize: 14, marginBottom: 12 },
  synopsis: { color: "#bbb", lineHeight: 1.7, fontSize: 15, maxWidth: 700 },
  divider: { border: "none", borderTop: "1px solid #2a2a2a", margin: "32px 0" },
  reviewsHeading: { fontSize: 20, fontWeight: 700, marginBottom: 20 },
  reviewCard: { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 16, marginBottom: 14 },
  author: { fontWeight: 600, marginBottom: 4 },
  stars: { color: "#f5c518", marginBottom: 8, fontSize: 15 },
  body: { color: "#ccc", lineHeight: 1.6, fontSize: 14 },
  date: { color: "#555", fontSize: 12, marginTop: 8 },
  formBox: { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: 24, marginTop: 32 },
  formTitle: { fontSize: 17, fontWeight: 700, marginBottom: 16 },
  input: { width: "100%", padding: "10px 12px", background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 6, color: "#f0f0f0", fontSize: 14, marginBottom: 12, outline: "none" },
  textarea: { width: "100%", padding: "10px 12px", background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 6, color: "#f0f0f0", fontSize: 14, marginBottom: 12, outline: "none", resize: "vertical", minHeight: 100 },
  btn: { background: "#e50914", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  error: { color: "#f55", fontSize: 13, marginBottom: 10 },
  empty: { color: "#555", fontStyle: "italic" },
};

function Stars({ n }) {
  return <span style={s.stars}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}

export default function FilmDetail() {
  const { id } = useParams();
  const [film, setFilm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ author: "", rating: "5", body: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    fetch(`/api/films/${id}`).then(r => r.json()).then(data => { setFilm(data); setLoading(false); });
  };

  useEffect(() => { load(); }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.author.trim() || !form.body.trim()) { setError("Name and review are required."); return; }
    setSubmitting(true);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ film_id: Number(id), author: form.author, rating: Number(form.rating), body: form.body }),
    });
    setSubmitting(false);
    if (res.ok) { setForm({ author: "", rating: "5", body: "" }); load(); }
    else { setError("Failed to submit review. Try again."); }
  };

  if (loading) return <p style={{ color: "#555" }}>Loading…</p>;
  if (!film || film.error) return <p style={{ color: "#f55" }}>Film not found.</p>;

  const avgRating = film.reviews.length
    ? (film.reviews.reduce((s, r) => s + r.rating, 0) / film.reviews.length).toFixed(1)
    : null;

  return (
    <div>
      <Link to="/" style={s.back}>← Back to films</Link>
      <div style={s.header}>
        <div style={s.genre}>{film.genre || "Film"}</div>
        <h1 style={s.title}>{film.title}</h1>
        <p style={s.meta}>{film.year} · Directed by {film.director} · {avgRating ? `⭐ ${avgRating} avg` : "No ratings yet"} · {film.reviews.length} review{film.reviews.length !== 1 ? "s" : ""}</p>
        <p style={s.synopsis}>{film.synopsis}</p>
      </div>

      <hr style={s.divider} />
      <h2 style={s.reviewsHeading}>Reviews</h2>
      {film.reviews.length === 0 ? (
        <p style={s.empty}>No reviews yet — be the first!</p>
      ) : (
        film.reviews.map(r => (
          <div key={r.id} style={s.reviewCard}>
            <div style={s.author}>{r.author}</div>
            <Stars n={r.rating} />
            <div style={s.body}>{r.body}</div>
            <div style={s.date}>{new Date(r.created_at).toLocaleDateString()}</div>
          </div>
        ))
      )}

      <div style={s.formBox}>
        <div style={s.formTitle}>Write a Review</div>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={submit}>
          <input style={s.input} placeholder="Your name" value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} />
          <select style={s.input} value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))}>
            {[5,4,3,2,1].map(n => <option key={n} value={n}>{"★".repeat(n)} {n} star{n !== 1 ? "s" : ""}</option>)}
          </select>
          <textarea style={s.textarea} placeholder="What did you think?" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          <button type="submit" style={s.btn} disabled={submitting}>{submitting ? "Submitting…" : "Submit Review"}</button>
        </form>
      </div>
    </div>
  );
}
