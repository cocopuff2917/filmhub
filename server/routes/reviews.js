const express = require("express");
const router = express.Router();
const pool = require("../db/client");

// GET /api/reviews?film_id=X — reviews for a film
router.get("/", async (req, res) => {
  const { film_id } = req.query;
  if (!film_id) return res.status(400).json({ error: "film_id is required" });
  try {
    const { rows } = await pool.query(
      "SELECT * FROM reviews WHERE film_id = $1 ORDER BY created_at DESC",
      [film_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// POST /api/reviews — submit a review
router.post("/", async (req, res) => {
  const { film_id, author, rating, body } = req.body;
  if (!film_id || !author || !rating || !body)
    return res.status(400).json({ error: "film_id, author, rating, and body are required" });
  if (rating < 1 || rating > 5)
    return res.status(400).json({ error: "rating must be between 1 and 5" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO reviews (film_id, author, rating, body)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [film_id, author, rating, body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// DELETE /api/reviews/:id
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM reviews WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;
