require('dotenv').config();
const { pool } = require('./db.js');

async function migrateLikesAndComments() {
    try {
        console.log('Connecting to database...');

        // Create announcement_likes
        await pool.query(`
      CREATE TABLE IF NOT EXISTS announcement_likes (
          id SERIAL PRIMARY KEY,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
          user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(announcement_id, user_email)
      );
    `);
        console.log('✅ Created announcement_likes table');

        // Create announcement_comments
        await pool.query(`
      CREATE TABLE IF NOT EXISTS announcement_comments (
          id SERIAL PRIMARY KEY,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
          user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Created announcement_comments table');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating tables:', err.message);
        process.exit(1);
    }
}

migrateLikesAndComments();
