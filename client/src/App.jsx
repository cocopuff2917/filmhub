import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import FilmList from "./pages/FilmList";
import FilmDetail from "./pages/FilmDetail";

const styles = {
  nav: { background: "#1a1a1a", padding: "16px 32px", display: "flex", alignItems: "center", gap: 24, borderBottom: "1px solid #2a2a2a" },
  logo: { fontSize: 22, fontWeight: 700, color: "#e50914", textDecoration: "none", letterSpacing: -0.5 },
  navLink: { color: "#ccc", textDecoration: "none", fontSize: 14 },
  main: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
};

export default function App() {
  return (
    <>
      <nav style={styles.nav}>
        <Link to="/" style={styles.logo}>🎬 Filmhub</Link>
        <Link to="/" style={styles.navLink}>Films</Link>
      </nav>
      <main style={styles.main}>
        <Routes>
          <Route path="/" element={<FilmList />} />
          <Route path="/films/:id" element={<FilmDetail />} />
        </Routes>
      </main>
    </>
  );
}
