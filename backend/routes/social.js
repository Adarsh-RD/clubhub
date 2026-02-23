// backend/routes/social.js
// Social features for Club Hub - MySQL version

const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (pool) {
    const router = express.Router();
    const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

    // ==================== JWT MIDDLEWARE ====================

    function authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ ok: false, error: 'No token provided' });
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ ok: false, error: 'Invalid token' });
            }
            req.user = user;
            next();
        });
    }

    // ==================== PROFILE PICTURE ROUTES ====================

    router.post('/profile/picture', authenticateToken, async (req, res) => {
        try {
            const { profile_picture } = req.body;
            const userEmail = req.user.sub;

            if (!profile_picture) {
                return res.status(400).json({ ok: false, error: 'No image data provided' });
            }

            await pool.query(
                'UPDATE users SET profile_picture = $1 WHERE email = $2',
                [profile_picture, userEmail]
            );

            res.json({ ok: true, message: 'Profile picture updated successfully' });
        } catch (error) {
            console.error('Error updating profile picture:', error);
            res.status(500).json({ ok: false, error: 'Failed to update profile picture' });
        }
    });

    router.get('/profile/picture/:userId', async (req, res) => {
        try {
            const { userId } = req.params;

            const { rows } = await pool.query(
                'SELECT profile_picture FROM users WHERE id = $1',
                [userId]
            );

            const user = rows[0];

            if (!user || !user.profile_picture) {
                return res.status(404).json({ ok: false, error: 'Profile picture not found' });
            }

            res.json({ ok: true, profile_picture: user.profile_picture });
        } catch (error) {
            console.error('Error fetching profile picture:', error);
            res.status(500).json({ ok: false, error: 'Failed to fetch profile picture' });
        }
    });

    // ==================== LIKE ROUTES ====================

    router.post('/announcements/:id/like', authenticateToken, async (req, res) => {
        try {
            const announcementId = parseInt(req.params.id);
            const userEmail = req.user.sub;

            // Get user ID from email
            const { rows: userRows } = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                [userEmail]
            );

            if (userRows.length === 0) {
                return res.status(404).json({ ok: false, error: 'User not found' });
            }

            const userId = userRows[0].id;

            // Check if announcement exists
            const { rows: annRows } = await pool.query(
                'SELECT id FROM announcements WHERE id = $1',
                [announcementId]
            );

            if (annRows.length === 0) {
                return res.status(404).json({ ok: false, error: 'Announcement not found' });
            }

            // Check if already liked
            const { rows: existingLike } = await pool.query(
                'SELECT id FROM announcement_likes WHERE announcement_id = $1 AND user_id = $2',
                [announcementId, userId]
            );

            if (existingLike.length > 0) {
                // Unlike
                await pool.query(
                    'DELETE FROM announcement_likes WHERE announcement_id = $1 AND user_id = $2',
                    [announcementId, userId]
                );

                const { rows: countRows } = await pool.query(
                    'SELECT COUNT(*) as count FROM announcement_likes WHERE announcement_id = $1',
                    [announcementId]
                );

                return res.json({
                    ok: true,
                    liked: false,
                    likeCount: parseInt(countRows[0].count)
                });
            } else {
                // Like
                await pool.query(
                    'INSERT INTO announcement_likes (announcement_id, user_id) VALUES ($1, $2)',
                    [announcementId, userId]
                );

                const { rows: countRows } = await pool.query(
                    'SELECT COUNT(*) as count FROM announcement_likes WHERE announcement_id = $1',
                    [announcementId]
                );

                return res.json({
                    ok: true,
                    liked: true,
                    likeCount: parseInt(countRows[0].count)
                });
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            res.status(500).json({ ok: false, error: 'Failed to toggle like' });
        }
    });

    router.get('/announcements/:id/liked', authenticateToken, async (req, res) => {
        try {
            const announcementId = parseInt(req.params.id);
            const userEmail = req.user.sub;

            // Get user ID
            const { rows: userRows } = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                [userEmail]
            );

            if (userRows.length === 0) {
                return res.json({ ok: true, liked: false });
            }

            const userId = userRows[0].id;

            const { rows: likeRows } = await pool.query(
                'SELECT id FROM announcement_likes WHERE announcement_id = $1 AND user_id = $2',
                [announcementId, userId]
            );

            res.json({
                ok: true,
                liked: likeRows.length > 0
            });
        } catch (error) {
            console.error('Error checking like status:', error);
            res.status(500).json({ ok: false, error: 'Failed to check like status' });
        }
    });

    // ==================== COMMENT ROUTES ====================

    router.post('/announcements/:id/comments', authenticateToken, async (req, res) => {
        try {
            const announcementId = parseInt(req.params.id);
            const userEmail = req.user.sub;
            const { comment_text } = req.body;

            if (!comment_text || comment_text.trim().length === 0) {
                return res.status(400).json({ ok: false, error: 'Comment text is required' });
            }

            if (comment_text.length > 500) {
                return res.status(400).json({ ok: false, error: 'Comment too long (max 500 characters)' });
            }

            // Get user ID
            const { rows: userRows } = await pool.query(
                'SELECT id, name, email, profile_picture FROM users WHERE email = $1',
                [userEmail]
            );

            if (userRows.length === 0) {
                return res.status(404).json({ ok: false, error: 'User not found' });
            }

            const user = userRows[0];

            // Check if announcement exists
            const { rows: annRows } = await pool.query(
                'SELECT id FROM announcements WHERE id = $1',
                [announcementId]
            );

            if (annRows.length === 0) {
                return res.status(404).json({ ok: false, error: 'Announcement not found' });
            }

            // Insert comment
            const { rows: result } = await pool.query(
                'INSERT INTO announcement_comments (announcement_id, user_id, comment_text) VALUES ($1, $2, $3) RETURNING id',
                [announcementId, user.id, comment_text.trim()]
            );

            // Return the created comment with user info
            const comment = {
                id: result[0].id,
                announcement_id: announcementId,
                user_id: user.id,
                comment_text: comment_text.trim(),
                created_at: new Date(),
                name: user.name,
                email: user.email,
                profile_picture: user.profile_picture
            };

            res.json({
                ok: true,
                comment: comment
            });
        } catch (error) {
            console.error('Error adding comment:', error);
            res.status(500).json({ ok: false, error: 'Failed to add comment' });
        }
    });

    router.get('/announcements/:id/comments', async (req, res) => {
        try {
            const announcementId = parseInt(req.params.id);

            const { rows: comments } = await pool.query(
                `SELECT 
          c.id,
          c.announcement_id,
          c.user_id,
          c.comment_text,
          c.created_at,
          u.name,
          u.email,
          u.profile_picture
        FROM announcement_comments c 
        JOIN users u ON c.user_id = u.id 
        WHERE c.announcement_id = $1
        ORDER BY c.created_at DESC`,
                [announcementId]
            );

            res.json({
                ok: true,
                comments: comments,
                count: comments.length
            });
        } catch (error) {
            console.error('Error fetching comments:', error);
            res.status(500).json({ ok: false, error: 'Failed to fetch comments' });
        }
    });

    router.delete('/comments/:id', authenticateToken, async (req, res) => {
        try {
            const commentId = parseInt(req.params.id);
            const userEmail = req.user.sub;

            // Get user ID
            const { rows: userRows } = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                [userEmail]
            );

            if (userRows.length === 0) {
                return res.status(404).json({ ok: false, error: 'User not found' });
            }

            const userId = userRows[0].id;

            // Check if comment exists and belongs to user
            const { rows: commentRows } = await pool.query(
                'SELECT id, user_id FROM announcement_comments WHERE id = $1',
                [commentId]
            );

            if (commentRows.length === 0) {
                return res.status(404).json({ ok: false, error: 'Comment not found' });
            }

            if (commentRows[0].user_id !== userId) {
                return res.status(403).json({ ok: false, error: 'Not authorized to delete this comment' });
            }

            await pool.query(
                'DELETE FROM announcement_comments WHERE id = $1',
                [commentId]
            );

            res.json({ ok: true, message: 'Comment deleted successfully' });
        } catch (error) {
            console.error('Error deleting comment:', error);
            res.status(500).json({ ok: false, error: 'Failed to delete comment' });
        }
    });

    // ==================== ENHANCED ANNOUNCEMENTS ====================

    router.get('/announcements/enhanced', async (req, res) => {
        try {
            const { rows: announcements } = await pool.query(`
        SELECT 
          a.id,
          a.club_id,
          a.title,
          a.content,
          a.image_url,
          a.created_by,
          a.created_at,
          a.updated_at,
          a.is_active,
          c.club_name,
          c.club_code,
          (SELECT COUNT(*) FROM announcement_likes WHERE announcement_id = a.id) as like_count,
          (SELECT COUNT(*) FROM announcement_comments WHERE announcement_id = a.id) as comment_count
        FROM announcements a
        LEFT JOIN clubs c ON a.club_id = c.id
        WHERE a.is_active = true
        ORDER BY a.created_at DESC
      `);

            res.json({ ok: true, announcements });
        } catch (error) {
            console.error('Error fetching enhanced announcements:', error);
            res.status(500).json({ ok: false, error: 'Failed to fetch announcements' });
        }
    });

    return router;
};