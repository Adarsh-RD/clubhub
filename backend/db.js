// backend/db.js
const { Pool } = require('pg');

// Connection pool tuned for Supabase free tier (wakes up after inactivity)
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "postgres",
  ssl: { rejectUnauthorized: false },
  max: 10,                            // allow a few more concurrent connections
  idleTimeoutMillis: 10000,           // close idle connections quickly (10s)
  connectionTimeoutMillis: 5000,      // fail fast (5s) to trigger immediate retry
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected pool error:', err.message);
});

// Retry wrapper: handles Supabase connection drops robustly
const delay = ms => new Promise(r => setTimeout(r, ms));

const poolQuery = async (...args) => {
  let retries = 3;
  while (retries > 0) {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query(...args);
      client.release();
      return result;
    } catch (err) {
      // If we got a client but the query failed, passing the error to release() 
      // instructs the pg-pool to DESTROY the socket instead of reusing it.
      if (client) {
        client.release(err);
      }
      const msg = err.message || '';
      const isConnectionDrop =
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('Connection terminated') ||
        msg.includes('timeout') ||
        msg.includes('socket') ||
        msg.includes('Unexpected EOF');

      if (isConnectionDrop && retries > 1) {
        retries--;
        console.warn(`⚠️ DB Connection Error (${msg}) — retrying (${retries} retries left)...`);
        await delay(1000); // Backoff before grabbing a new connection
        continue;
      }
      throw err;
    }
  }
};

/* =========================
   USER FUNCTIONS
========================= */

const findUserByEmail = async (email) => {
  const { rows } = await poolQuery(
    `SELECT 
      u.id,
      u.email,
      u.password_hash,
      u.role,
      u.name,
      u.branch,
      u.roll_number,
      u.club_id,
      u.admin_requested,
      u.profile_picture,
      c.club_name,
      c.club_code,
      c.description AS club_description
     FROM users u
     LEFT JOIN clubs c ON u.club_id = c.id
     WHERE u.email = $1
     LIMIT 1`,
    [email.toLowerCase()]
  );
  return rows[0] || null;
};

const createUser = async (email, passwordHash, role = null) => {
  const { rows } = await poolQuery(
    `INSERT INTO users (email, password_hash, role, updated_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [email.toLowerCase(), passwordHash, role]
  );
  return { id: rows[0].id, email: email.toLowerCase(), role };
};

const getProfileByEmail = async (email) => {
  const { rows } = await poolQuery(
    `SELECT 
      u.*,
      c.club_name,
      c.club_code,
      c.description AS club_description
     FROM users u
     LEFT JOIN clubs c ON u.club_id = c.id
     WHERE u.email = $1
     LIMIT 1`,
    [email.toLowerCase()]
  );
  return rows[0] || null;
};

const updateProfile = async (
  email,
  { name = null, branch = null, roll_number = null, role = null, club_id = null, request_admin = false }
) => {
  let query;
  let params;

  if (request_admin) {
    query = `
      UPDATE users
      SET name=$1, branch=$2, roll_number=$3, club_id=$4,
          admin_requested=true, requested_at=NOW(), updated_at=NOW()
      WHERE email=$5`;
    params = [name, branch, roll_number, club_id, email.toLowerCase()];
  } else if (role) {
    query = `
      UPDATE users
      SET name=$1, branch=$2, roll_number=$3, role=$4, updated_at=NOW()
      WHERE email=$5`;
    params = [name, branch, roll_number, role, email.toLowerCase()];
  } else {
    query = `
      UPDATE users
      SET name=$1, branch=$2, roll_number=$3, updated_at=NOW()
      WHERE email=$4`;
    params = [name, branch, roll_number, email.toLowerCase()];
  }

  await poolQuery(query, params);
};

const updatePassword = async (email, passwordHash) => {
  await poolQuery(
    `UPDATE users SET password_hash=$1, updated_at=NOW() WHERE email=$2`,
    [passwordHash, email.toLowerCase()]
  );
};

/* =========================
   CLUB FUNCTIONS
========================= */

const getAllClubs = async () => {
  const { rows } = await poolQuery(
    `SELECT id, club_name, club_code, description, category
     FROM clubs
     WHERE is_active=true
     ORDER BY club_name`
  );
  return rows;
};

const getClubById = async (clubId) => {
  const { rows } = await poolQuery(
    `SELECT * FROM clubs WHERE id=$1 AND is_active=true LIMIT 1`,
    [clubId]
  );
  return rows[0] || null;
};

const getClubMembers = async (clubId) => {
  const { rows } = await poolQuery(
    `SELECT email, name, branch, roll_number, role, admin_requested
     FROM users
     WHERE club_id=$1
     ORDER BY role DESC, name`,
    [clubId]
  );
  return rows;
};

/* =========================
   ANNOUNCEMENTS
========================= */

const getAllAnnouncements = async (limit = 50, offset = 0, userEmail = null) => {
  const { rows } = await poolQuery(
    `SELECT 
      a.id, a.title, a.content, a.image_url, a.created_at,
      a.registration_enabled, a.registration_deadline, a.max_registrations,
      a.club_id, c.club_name, c.club_code,
      a.created_by, u.name AS author_name,
      COUNT(DISTINCT al.id) AS like_count,
      COUNT(DISTINCT ac.id) AS comment_count,
      EXISTS(SELECT 1 FROM announcement_likes WHERE announcement_id = a.id AND user_email = $3) AS has_liked
     FROM announcements a
     JOIN clubs c ON a.club_id = c.id
     LEFT JOIN users u ON a.created_by = u.email
     LEFT JOIN announcement_likes al ON a.id = al.announcement_id
     LEFT JOIN announcement_comments ac ON a.id = ac.announcement_id
     WHERE a.is_active=true
     GROUP BY a.id, c.club_name, c.club_code, u.name
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, userEmail]
  );
  return rows;
};

const getAnnouncementsByClub = async (clubId, limit = 50, userEmail = null) => {
  const { rows } = await poolQuery(
    `SELECT 
        a.id,
        a.title,
        a.content,
        a.image_url,
        a.created_at,
        a.registration_enabled, a.registration_deadline, a.max_registrations,
        a.club_id,
        c.club_name,
        a.created_by,
        u.name as author_name,
        COUNT(DISTINCT al.id) AS like_count,
        COUNT(DISTINCT ac.id) AS comment_count,
        EXISTS(SELECT 1 FROM announcement_likes WHERE announcement_id = a.id AND user_email = $3) AS has_liked
       FROM announcements a
       JOIN clubs c ON a.club_id = c.id
       LEFT JOIN users u ON a.created_by = u.email
       LEFT JOIN announcement_likes al ON a.id = al.announcement_id
       LEFT JOIN announcement_comments ac ON a.id = ac.announcement_id
       WHERE a.club_id = $1 AND a.is_active = true
       GROUP BY a.id, c.club_name, u.name
       ORDER BY a.created_at DESC
       LIMIT $2`,
    [clubId, limit, userEmail]
  );
  return rows;
};

const createAnnouncement = async (clubId, title, content, createdBy) => {
  const { rows } = await poolQuery(
    `INSERT INTO announcements (club_id, title, content, created_by)
     VALUES ($1,$2,$3,$4)
     RETURNING id`,
    [clubId, title, content, createdBy]
  );
  return rows[0];
};

const deleteAnnouncement = async (announcementId, userEmail) => {
  const res = await poolQuery(
    `UPDATE announcements SET is_active=false WHERE id=$1 AND created_by=$2`,
    [announcementId, userEmail]
  );
  return res.rowCount > 0;
};

const updateAnnouncement = async (announcementId, title, content, userEmail) => {
  const res = await poolQuery(
    `UPDATE announcements
     SET title=$1, content=$2, updated_at=NOW()
     WHERE id=$3 AND created_by=$4`,
    [title, content, announcementId, userEmail]
  );
  return res.rowCount > 0;
};

/* =========================
   LIKES & COMMENTS
========================= */

const toggleLike = async (announcementId, userEmail) => {
  // Check if like exists
  const { rows } = await poolQuery(
    `SELECT id FROM announcement_likes WHERE announcement_id = $1 AND user_email = $2`,
    [announcementId, userEmail]
  );

  if (rows.length > 0) {
    // Exists, so unlike
    await poolQuery(
      `DELETE FROM announcement_likes WHERE announcement_id = $1 AND user_email = $2`,
      [announcementId, userEmail]
    );
    return false; // has_liked = false
  } else {
    // Does not exist, so like
    await poolQuery(
      `INSERT INTO announcement_likes (announcement_id, user_email) VALUES ($1, $2)`,
      [announcementId, userEmail]
    );
    return true; // has_liked = true
  }
};

const getComments = async (announcementId) => {
  const { rows } = await poolQuery(
    `SELECT 
        c.id, c.content, c.created_at,
        u.name AS author_name, u.email AS author_email, u.profile_picture
       FROM announcement_comments c
       JOIN users u ON c.user_email = u.email
       WHERE c.announcement_id = $1
       ORDER BY c.created_at ASC`,
    [announcementId]
  );
  return rows;
};

const addComment = async (announcementId, userEmail, content) => {
  const { rows } = await poolQuery(
    `INSERT INTO announcement_comments (announcement_id, user_email, content) 
     VALUES ($1, $2, $3) RETURNING id`,
    [announcementId, userEmail, content]
  );
  return rows[0].id;
  return rows[0].id;
};

/* =========================
   PUSH NOTIFICATIONS (FCM)
========================= */

const saveFCMToken = async (email, token) => {
  const res = await poolQuery(
    `UPDATE users SET fcm_token = $1 WHERE email = $2`,
    [token, email]
  );
  return res.rowCount > 0;
};

const getClubAdminFCMToken = async (clubId) => {
  const { rows } = await poolQuery(
    `SELECT u.fcm_token 
     FROM users u
     WHERE u.club_id = $1 AND u.role = 'club_admin' AND u.fcm_token IS NOT NULL`,
    [clubId]
  );
  return rows.length > 0 ? rows[0].fcm_token : null;
};

module.exports = {
  pool,
  poolQuery,
  findUserByEmail,
  createUser,
  getProfileByEmail,
  updateProfile,
  updatePassword,
  getAllClubs,
  getClubById,
  getClubMembers,
  getAllAnnouncements,
  getAnnouncementsByClub,
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  toggleLike,
  getComments,
  addComment,
  saveFCMToken,
  getClubAdminFCMToken
};
