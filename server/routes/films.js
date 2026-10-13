const express = require("express");
const router = express.Router();
const pool = require("../db/client");

// GET /api/films — list all films with avg rating
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        f.*,
        ROUND(AVG(r.rating), 1) AS avg_rating,
        COUNT(r.id) AS review_count
      FROM films f
      LEFT JOIN reviews r ON r.film_id = f.id
      GROUP BY f.id
      ORDER BY f.title ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch films" });
  }
});

// GET /api/films/:id — single film with its reviews
router.get("/:id", async (req, res) => {
  try {
    const { rows: films } = await pool.query("SELECT * FROM films WHERE id = $1", [req.params.id]);
    if (!films.length) return res.status(404).json({ error: "Film not found" });

    const { rows: reviews } = await pool.query(
      "SELECT * FROM reviews WHERE film_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json({ ...films[0], reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch film" });
  }
});

// POST /api/films — add a film
router.post("/", async (req, res) => {
  const { title, year, genre, director, synopsis, poster_url } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO films (title, year, genre, director, synopsis, poster_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, year, genre, director, synopsis, poster_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create film" });
  }
});

module.exports = router;
