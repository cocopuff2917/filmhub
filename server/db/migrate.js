require("dotenv").config();
const pool = require("./client");

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS films (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        year INTEGER,
        genre TEXT,
        director TEXT,
        synopsis TEXT,
        poster_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    -- Seed a few starter films
    await client.query(`
      INSERT INTO films (title, year, genre, director, synopsis)
      VALUES
        ('Inception', 2010, 'Sci-Fi', 'Christopher Nolan', 'A thief who steals corporate secrets through dream-sharing technology is tasked with planting an idea into the mind of a CEO.'),
        ('The Godfather', 1972, 'Crime', 'Francis Ford Coppola', 'The patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.'),
        ('Parasite', 2019, 'Drama', 'Bong Joon-ho', 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.')
      ON CONFLICT DO NOTHING;
    `);

    console.log("Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
