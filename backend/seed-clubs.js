require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const clubsToInsert = [
  { name: "Cloud And DevOps Club", file: "Cloud And DevOps Club.jpg", category: "Technical" },
  { name: "KLE Tech Dance Club", file: "KLE Tech Dance Club.jpg", category: "Cultural" },
  { name: "KLE Tech Drama Club", file: "KLE Tech Drama Club.jpg", category: "Cultural" },
  { name: "KLETech IUCEE Chapter", file: "KLETech IUCEE Chapter.jpg", category: "Technical" },
  { name: "Words Worth Club", file: "Word's Worth Club.jpg", category: "Literary" },
  { name: "AeroKLE", file: "aeroKLE.jpg", category: "Technical" },
  { name: "KLE Tech CodeClub", file: "kletech codeclub.jpg", category: "Technical" },
  { name: "KLE Tech Media", file: "kletech media.jpg", category: "Media" },
  { name: "KLE Tech Music", file: "kletech music.jpg", category: "Cultural" },
  { name: "KLE Tech Nityotsava", file: "kletech nityotsava.jpg", category: "Cultural" },
  { name: "Make in BVB", file: "make in bvb.jpg", category: "Technical" },
  { name: "Pleiades KLETU", file: "pleiades kletu.jpg", category: "Cultural" },
  { name: "Team Concept Green", file: "team concept green.jpg", category: "Technical" },
  { name: "Team Euros Racing", file: "team euros racing.jpg", category: "Technical" },
  { name: "Vegdooth Racing", file: "vegdooth racing.jpg", category: "Technical" }
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Clearing old data...");
    await client.query("DELETE FROM announcement_likes");
    await client.query("DELETE FROM announcement_comments");
    await client.query("DELETE FROM event_registrations");
    await client.query("DELETE FROM club_subscriptions");
    await client.query("DELETE FROM announcements");
    await client.query("UPDATE users SET club_id = NULL");
    await client.query("UPDATE users SET role = 'student' WHERE role = 'club_admin'");
    await client.query("DELETE FROM clubs");

    console.log("Inserting new clubs...");
    for (const club of clubsToInsert) {
      const code = club.name.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 10);
      const logoUrl = `/logos/${club.file}`;
      await client.query(
        "INSERT INTO clubs (club_name, club_code, category, logo_url) VALUES ($1, $2, $3, $4)",
        [club.name, code, club.category, logoUrl]
      );
    }
    
    await client.query("COMMIT");
    console.log("Successfully seeded clubs!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error seeding clubs:", err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
