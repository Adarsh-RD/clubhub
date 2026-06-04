// backend/routes/broadcast.js
// Instagram-style Broadcast Channels for Club Hub
// Completely separate from the main feed / announcements system

const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

module.exports = function (pool, poolQuery, broadcastWSMessage) {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

  // ==================== MULTER SETUP ====================
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif|mp4|webm|mov/i;
      const extname = allowedTypes.test(path.extname(file.originalname));
      const mimetype = allowedTypes.test(file.mimetype) || (file.mimetype && file.mimetype.startsWith('video/'));
      if (mimetype || extname) return cb(null, true);
      cb(new Error('Only image and video files allowed'));
    }
  });

  // ==================== AUTH MIDDLEWARE ====================
  function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ ok: false, error: 'Invalid token' });
      req.user = user;
      next();
    });
  }

  // ==================== INIT: Create tables if not exist ====================
  async function ensureTables() {
    try {
      await poolQuery(`
        CREATE TABLE IF NOT EXISTS broadcast_messages (
          id SERIAL PRIMARY KEY,
          club_id INTEGER REFERENCES clubs(id) NOT NULL,
          sender_email VARCHAR(255) REFERENCES users(email) NOT NULL,
          message_type VARCHAR(50) DEFAULT 'text',
          content TEXT,
          image_url TEXT,
          link_url TEXT,
          is_urgent BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await poolQuery(`
        CREATE TABLE IF NOT EXISTS broadcast_subscriptions (
          id SERIAL PRIMARY KEY,
          user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE NOT NULL,
          club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_email, club_id)
        )
      `);

      await poolQuery(`
        CREATE TABLE IF NOT EXISTS broadcast_reactions (
          id SERIAL PRIMARY KEY,
          message_id INTEGER REFERENCES broadcast_messages(id) ON DELETE CASCADE NOT NULL,
          user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE NOT NULL,
          emoji VARCHAR(50) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(message_id, user_email)
        )
      `);

      console.log('✅ Broadcast tables ready');
    } catch (err) {
      console.error('⚠️ Broadcast table creation error (may already exist):', err.message);
    }
  }

  // Run on startup
  ensureTables();

  // ==================== GET ALL CLUBS (for channel list) ====================
  router.get('/channels', authenticateToken, async (req, res) => {
    try {
      const userEmail = req.user.sub;

      const { rows } = await poolQuery(`
        SELECT 
          c.id, c.club_name, c.club_code, c.category, c.description,
          (SELECT COUNT(*) FROM broadcast_subscriptions bs 
           WHERE bs.club_id = c.id AND bs.is_active = true) AS subscriber_count,
          (SELECT COUNT(*) FROM broadcast_messages bm 
           WHERE bm.club_id = c.id AND bm.is_active = true) AS message_count,
          EXISTS(SELECT 1 FROM broadcast_subscriptions bs 
                 WHERE bs.club_id = c.id AND bs.user_email = $1 AND bs.is_active = true) AS is_subscribed,
          (SELECT bm.created_at FROM broadcast_messages bm 
           WHERE bm.club_id = c.id AND bm.is_active = true 
           ORDER BY bm.created_at DESC LIMIT 1) AS last_message_at,
          (SELECT bm.content FROM broadcast_messages bm 
           WHERE bm.club_id = c.id AND bm.is_active = true 
           ORDER BY bm.created_at DESC LIMIT 1) AS last_message_preview
        FROM clubs c
        WHERE c.is_active = true
        ORDER BY last_message_at DESC NULLS LAST, c.club_name ASC
      `, [userEmail]);

      res.json({ ok: true, channels: rows });
    } catch (err) {
      console.error('Error fetching broadcast channels:', err);
      res.status(500).json({ ok: false, error: 'Failed to fetch channels' });
    }
  });

  // ==================== GET MESSAGES FOR A CHANNEL ====================
  router.get('/channels/:clubId/messages', authenticateToken, async (req, res) => {
    try {
      const clubId = parseInt(req.params.clubId);
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const { rows } = await poolQuery(`
        SELECT 
          bm.id, bm.club_id, bm.sender_email, bm.message_type,
          bm.content, bm.image_url, bm.link_url, bm.is_urgent,
          bm.created_at,
          u.name AS sender_name, u.profile_picture AS sender_avatar,
          c.club_name, c.club_code,
          COALESCE(
            (SELECT json_agg(json_build_object('user_email', br.user_email, 'emoji', br.emoji))
             FROM broadcast_reactions br
             WHERE br.message_id = bm.id),
            '[]'::json
          ) AS reactions
        FROM broadcast_messages bm
        JOIN users u ON bm.sender_email = u.email
        JOIN clubs c ON bm.club_id = c.id
        WHERE bm.club_id = $1 AND bm.is_active = true
        ORDER BY bm.created_at ASC
        LIMIT $2 OFFSET $3
      `, [clubId, limit, offset]);

      // Also get channel info
      const { rows: channelRows } = await poolQuery(`
        SELECT 
          c.id, c.club_name, c.club_code, c.category, c.description,
          (SELECT COUNT(*) FROM broadcast_subscriptions bs 
           WHERE bs.club_id = c.id AND bs.is_active = true) AS subscriber_count,
          EXISTS(SELECT 1 FROM broadcast_subscriptions bs 
                 WHERE bs.club_id = c.id AND bs.user_email = $2 AND bs.is_active = true) AS is_subscribed
        FROM clubs c WHERE c.id = $1
      `, [clubId, req.user.sub]);

      res.json({
        ok: true,
        messages: rows,
        channel: channelRows[0] || null,
        total: rows.length
      });
    } catch (err) {
      console.error('Error fetching broadcast messages:', err);
      res.status(500).json({ ok: false, error: 'Failed to fetch messages' });
    }
  });

  // ==================== POST A BROADCAST MESSAGE (Admin only) ====================
  router.post('/channels/:clubId/messages', authenticateToken, upload.single('image'), async (req, res) => {
    try {
      const clubId = parseInt(req.params.clubId);
      const userEmail = req.user.sub;

      // Verify user is admin of this club
      const { rows: userRows } = await poolQuery(
        `SELECT role, club_id FROM users WHERE email = $1`,
        [userEmail]
      );

      if (userRows.length === 0) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const user = userRows[0];
      const isCoordinator = userEmail === 'bigbossssz550@gmail.com';

      if (!isCoordinator && (user.role !== 'club_admin' || user.club_id !== clubId)) {
        return res.status(403).json({ ok: false, error: 'Only club admins can post in broadcast channels' });
      }

      const { content, message_type, link_url, is_urgent } = req.body;

      if (!content && !req.file) {
        return res.status(400).json({ ok: false, error: 'Message content or image is required' });
      }

      // Handle image upload
      let imageUrl = null;
      if (req.file) {
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        imageUrl = `data:${mimeType};base64,${base64}`;
      }

      const { rows } = await poolQuery(`
        INSERT INTO broadcast_messages (club_id, sender_email, message_type, content, image_url, link_url, is_urgent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        clubId,
        userEmail,
        message_type || 'text',
        content || null,
        imageUrl,
        link_url || null,
        is_urgent === 'true' || is_urgent === true
      ]);

      // Get sender info for response
      const { rows: senderRows } = await poolQuery(
        `SELECT name, profile_picture FROM users WHERE email = $1`,
        [userEmail]
      );

      const message = {
        ...rows[0],
        sender_name: senderRows[0]?.name || userEmail,
        sender_avatar: senderRows[0]?.profile_picture || null
      };

      if (typeof broadcastWSMessage === 'function') {
        broadcastWSMessage(clubId, { action: 'create', message });
      }

      res.json({ ok: true, message });
    } catch (err) {
      console.error('Error posting broadcast message:', err);
      res.status(500).json({ ok: false, error: 'Failed to post message' });
    }
  });

  // ==================== DELETE A BROADCAST MESSAGE (Admin only) ====================
  router.delete('/channels/:clubId/messages/:messageId', authenticateToken, async (req, res) => {
    try {
      const clubId = parseInt(req.params.clubId);
      const messageId = parseInt(req.params.messageId);
      const userEmail = req.user.sub;

      // Verify user is admin of this club
      const { rows: userRows } = await poolQuery(
        `SELECT role, club_id FROM users WHERE email = $1`,
        [userEmail]
      );

      const user = userRows[0];
      const isCoordinator = userEmail === 'bigbossssz550@gmail.com';

      if (!isCoordinator && (user.role !== 'club_admin' || user.club_id !== clubId)) {
        return res.status(403).json({ ok: false, error: 'Only club admins can delete broadcast messages' });
      }

      await poolQuery(
        `UPDATE broadcast_messages SET is_active = false WHERE id = $1 AND club_id = $2`,
        [messageId, clubId]
      );

      if (typeof broadcastWSMessage === 'function') {
        broadcastWSMessage(clubId, { action: 'delete', id: messageId });
      }

      res.json({ ok: true, message: 'Message deleted' });
    } catch (err) {
      console.error('Error deleting broadcast message:', err);
      res.status(500).json({ ok: false, error: 'Failed to delete message' });
    }
  });

  // ==================== SUBSCRIBE / UNSUBSCRIBE ====================
  router.post('/channels/:clubId/subscribe', authenticateToken, async (req, res) => {
    try {
      const clubId = parseInt(req.params.clubId);
      const userEmail = req.user.sub;

      // Check if already subscribed
      const { rows: existing } = await poolQuery(
        `SELECT id, is_active FROM broadcast_subscriptions WHERE user_email = $1 AND club_id = $2`,
        [userEmail, clubId]
      );

      if (existing.length > 0) {
        // Toggle subscription
        const newState = !existing[0].is_active;
        await poolQuery(
          `UPDATE broadcast_subscriptions SET is_active = $1 WHERE id = $2`,
          [newState, existing[0].id]
        );
        res.json({ ok: true, subscribed: newState });
      } else {
        // Create new subscription
        await poolQuery(
          `INSERT INTO broadcast_subscriptions (user_email, club_id) VALUES ($1, $2)`,
          [userEmail, clubId]
        );
        res.json({ ok: true, subscribed: true });
      }
    } catch (err) {
      console.error('Error toggling subscription:', err);
      res.status(500).json({ ok: false, error: 'Failed to toggle subscription' });
    }
  });

  // ==================== GET MY SUBSCRIBED CHANNELS ====================
  router.get('/my-channels', authenticateToken, async (req, res) => {
    try {
      const userEmail = req.user.sub;

      const { rows } = await poolQuery(`
        SELECT 
          c.id, c.club_name, c.club_code, c.category,
          (SELECT COUNT(*) FROM broadcast_subscriptions bs 
           WHERE bs.club_id = c.id AND bs.is_active = true) AS subscriber_count,
          (SELECT bm.created_at FROM broadcast_messages bm 
           WHERE bm.club_id = c.id AND bm.is_active = true 
           ORDER BY bm.created_at DESC LIMIT 1) AS last_message_at,
          (SELECT bm.content FROM broadcast_messages bm 
           WHERE bm.club_id = c.id AND bm.is_active = true 
           ORDER BY bm.created_at DESC LIMIT 1) AS last_message_preview
        FROM broadcast_subscriptions bs
        JOIN clubs c ON bs.club_id = c.id
        WHERE bs.user_email = $1 AND bs.is_active = true AND c.is_active = true
        ORDER BY last_message_at DESC NULLS LAST
      `, [userEmail]);

      res.json({ ok: true, channels: rows });
    } catch (err) {
      console.error('Error fetching subscribed channels:', err);
      res.status(500).json({ ok: false, error: 'Failed to fetch channels' });
    }
  });

  // ==================== TOGGLE EMOJI REACTION ====================
  router.post('/messages/:messageId/react', authenticateToken, async (req, res) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const userEmail = req.user.sub;
      const { emoji } = req.body;

      if (!emoji) return res.status(400).json({ ok: false, error: 'Emoji is required' });

      // First check if user already has a reaction on this message
      const { rows: existing } = await poolQuery(
        `SELECT id, emoji FROM broadcast_reactions WHERE message_id = $1 AND user_email = $2`,
        [messageId, userEmail]
      );

      let actionType = 'create';
      if (existing.length > 0) {
        if (existing[0].emoji === emoji) {
          // If it's the exact same emoji, delete it (toggle off)
          await poolQuery(`DELETE FROM broadcast_reactions WHERE id = $1`, [existing[0].id]);
          actionType = 'delete';
        } else {
          // If it's a different emoji, update it (change reaction)
          await poolQuery(`UPDATE broadcast_reactions SET emoji = $1 WHERE id = $2`, [emoji, existing[0].id]);
          actionType = 'update';
        }
      } else {
        // Create new reaction
        await poolQuery(
          `INSERT INTO broadcast_reactions (message_id, user_email, emoji) VALUES ($1, $2, $3)`,
          [messageId, userEmail, emoji]
        );
        actionType = 'create';
      }

      // Fetch all reactions for this message
      const { rows: allReactions } = await poolQuery(
        `SELECT user_email, emoji FROM broadcast_reactions WHERE message_id = $1`,
        [messageId]
      );

      // Find club_id of this message to broadcast WebSocket event to the channel
      const { rows: msgInfo } = await poolQuery(
        `SELECT club_id FROM broadcast_messages WHERE id = $1`,
        [messageId]
      );

      if (msgInfo.length > 0) {
        const clubId = msgInfo[0].club_id;
        if (typeof broadcastWSMessage === 'function') {
          broadcastWSMessage(clubId, {
            action: 'react',
            message_id: messageId,
            reactions: allReactions
          });
        }
      }

      res.json({ ok: true, action: actionType, reactions: allReactions });
    } catch (err) {
      console.error('Error toggling reaction:', err);
      res.status(500).json({ ok: false, error: 'Failed to toggle reaction' });
    }
  });

  return router;
};
