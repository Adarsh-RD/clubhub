// backend/index.js - CLEAN VERSION
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const socialRoutes = require('./routes/social');
const broadcastRoutes = require('./routes/broadcast');
const {
  pool,
  poolQuery,
  findUserByEmail,
  createUser,
  updatePassword,
  getProfileByEmail,
  updateProfile,
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
  getClubAdminFCMToken,
  getClubAdmins,
  addNotification,
  getUserNotifications,
  markNotificationsAsRead
} = require("./db");

const admin = require('./firebase-admin');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Render load balancer)

// ==================== CONFIGURATION ====================

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '1h';
const CODE_TTL = (process.env.CODE_TTL_SECONDS ? parseInt(process.env.CODE_TTL_SECONDS) : 300) * 1000;
const DEV_FALLBACK = String(process.env.DEV_FALLBACK || '').toLowerCase() === 'true';

// ==================== FILE UPLOAD SETUP ====================
// Using memoryStorage so images are stored as base64 in the DB (persistent across Render restarts)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB to accommodate short videos
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif|mp4|webm|mov/i;
    const extname = allowedTypes.test(path.extname(file.originalname));
    const mimetype = allowedTypes.test(file.mimetype) || (file.mimetype && file.mimetype.startsWith('video/'));
    if (mimetype || extname) {
      return cb(null, true);
    }
    cb(new Error('Only image and video files allowed! Received: ' + file.mimetype + ' | ' + file.originalname));
  }
});

// ==================== MIDDLEWARE ====================

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));

// ==================== EMAIL SETUP ====================

const smtpPort = parseInt(process.env.EMAIL_PORT || '587');
const smtpSecure = (String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true') || smtpPort === 465;

let transporter;

const initializeEmail = async () => {
  console.log('📧 Brevo API Transport selected (bypassing Render SMTP blocks).');
};

// Initialize immediately
initializeEmail();

// Wrapper function to send mail safely using Brevo HTTP API
const sendEmailWrapper = async (mailOptions) => {
  const apiKey = process.env.EMAIL_PASS;

  if (!apiKey) {
    throw new Error('Missing EMAIL_PASS (Brevo API Key) in environment variables');
  }

  // Extract pure email if formatted as "Name <email@domain.com>"
  let senderEmail = mailOptions.from || process.env.EMAIL_USER;
  const emailMatch = senderEmail.match(/<([^>]+)>/);
  if (emailMatch) {
    senderEmail = emailMatch[1];
  }

  const payload = {
    sender: {
      name: "Club Hub",
      email: senderEmail.trim()
    },
    to: [
      { email: mailOptions.to }
    ],
    subject: mailOptions.subject,
  };

  if (mailOptions.html) { payload.htmlContent = mailOptions.html; }
  if (mailOptions.text) { payload.textContent = mailOptions.text; }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Brevo API Error (${response.status}):`, errorText);
    throw new Error(`Brevo HTTP API failed: ${response.status}`);
  }

  const data = await response.json();
  return { accepted: [mailOptions.to], rejected: [], messageId: data.messageId };
};

// ==================== OTP CODE STORAGE ====================

const codeStore = new Map();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function storeCode(email, code) {
  const key = email.toLowerCase();
  const expiresAt = Date.now() + CODE_TTL;
  codeStore.set(key, { code, expiresAt });
}

function validateCode(email, code) {
  const key = email.toLowerCase();
  const rec = codeStore.get(key);
  if (!rec) return false;
  if (Date.now() > rec.expiresAt) {
    codeStore.delete(key);
    return false;
  }
  if (rec.code !== code) return false;
  codeStore.delete(key);
  return true;
}

// ==================== MIDDLEWARE FUNCTIONS ====================

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });

  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'invalid auth header' });
  }

  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.userEmail = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function isCoordinator(req, res, next) {
  const coordinators = ['bigbossssz550@gmail.com', '01fe23bci050@kletech.ac.in'];
  if (!coordinators.includes(req.userEmail?.toLowerCase())) {
    return res.status(403).json({ ok: false, error: 'Access denied: Admin privileges required' });
  }
  next();
}

// ==================== RATE LIMITING ====================

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
});

// TEMPORARY DB MIGRATE ROUTE: Render will hit this to alter the enum
app.get('/fix-db', async (req, res) => {
  try {
    await pool.query("ALTER TYPE registration_status ADD VALUE 'waitlisted'");
    res.send('Fixed DB enum');
  } catch (e) {
    if (e.message.includes('already exists')) res.send('Enum already fixed');
    else res.status(500).send(e.message);
  }
});

// ==================== AUTH ROUTES ====================

app.get('/test-email-ports', async (req, res) => {
  const nodemailer = require('nodemailer');
  const portsToTest = [587, 2525, 465];
  const results = [];

  for (const port of portsToTest) {
    const isSecure = port === 465;
    const testTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: port,
      secure: isSecure,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: false }
    });

    try {
      await testTransporter.verify();
      results.push({ port, status: 'Success', secure: isSecure });
      console.log(`Port ${port} success`);
    } catch (err) {
      results.push({ port, status: 'Failed', error: err.message, secure: isSecure });
      console.log(`Port ${port} failed: ${err.message}`);
    }
  }

  res.json({
    message: "SMTP Port Test Results from Render",
    host: process.env.EMAIL_HOST,
    results
  });
});

app.post('/auth/send-code', limiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email required' });
  }

  // 🔒 College students only (KLE Tech)
  const allowedDomain = '@kletech.ac.in';
  if (!email.toLowerCase().endsWith(allowedDomain) && email.toLowerCase() !== 'bigbossssz550@gmail.com') {
    return res.status(403).json({ error: `Only ${allowedDomain} email addresses are allowed.` });
  }

  const code = generateCode();
  storeCode(email, code);
  console.log(`[OTP] stored for ${email.toLowerCase()}: ${code} (expires in ${Math.round(CODE_TTL / 1000)}s)`);

  const fromAddress = process.env.FROM_EMAIL || process.env.EMAIL_USER || 'no-reply@clubhub.local';
  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: 'Your verification code',
    text: `Your verification code is: ${code}`,
    html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in ${Math.round(CODE_TTL / 1000)} seconds.</p>`,
  };

  try {
    const info = await sendEmailWrapper(mailOptions);
    console.log('Email sent:', { accepted: info.accepted, rejected: info.rejected });
    return res.json({ ok: true, message: 'Code sent' });
  } catch (err) {
    console.error('Error sending email:', err.message);
    if (DEV_FALLBACK) {
      console.warn('DEV_FALLBACK enabled — returning OTP in response');
      return res.json({ ok: true, message: 'Code generated (dev fallback)', code });
    }
    return res.status(500).json({ error: 'failed to send email', detail: err.message });
  }
});

app.post('/auth/verify', async (req, res) => {
  const { email, code, password, confirm } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'email and code required' });
  }

  try {
    const ok = validateCode(email, code);
    if (!ok) return res.status(401).json({ error: 'invalid or expired code' });

    const key = email.toLowerCase();
    const existing = await findUserByEmail(key);

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'password must be at least 6 characters' });
      }
      if (password !== confirm) {
        return res.status(400).json({ error: 'password and confirm do not match' });
      }

      const hash = await bcrypt.hash(password, 10);
      if (existing) {
        await updatePassword(key, hash);
        const payload = { sub: key, role: existing.role };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        return res.json({ ok: true, token, user: { email: key, role: existing.role, name: existing.name, branch: existing.branch, roll_number: existing.roll_number } });
      } else {
        await createUser(key, hash, null);
        const payload = { sub: key, role: null };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        return res.json({ ok: true, token, user: { email: key, role: null, created: true } });
      }
    } else {
      if (!existing) {
        await createUser(key, null, null);
      }
      const role = existing ? existing.role : null;
      const payload = { sub: key, role };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      return res.json({ ok: true, token, user: { email: key, role, name: existing ? existing.name : null, branch: existing ? existing.branch : null, roll_number: existing ? existing.roll_number : null } });
    }
  } catch (err) {
    console.error('Error in /auth/verify:', err);
    return res.status(500).json({ error: 'server error', detail: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await findUserByEmail(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    if (!user.password_hash) {
      return res.status(400).json({ error: "Password not set. Please sign up or reset password." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      ok: true,
      token,
      user: { email: user.email, role: user.role, name: user.name, branch: user.branch, roll_number: user.roll_number }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "server error" });
  }
});

const crypto = require('crypto');

app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  try {
    console.log(`[Forgot Password] Request received for email: '${email}'`);
    const cleanEmail = email.toLowerCase().trim();
    const user = await findUserByEmail(cleanEmail);
    if (!user) {
      console.log(`[Forgot Password] User not found for email: '${cleanEmail}'. Returning success to prevent enumeration.`);
      // Return 200 anyway to prevent email enumeration
      return res.json({ ok: true, message: "If that email exists, a reset link was sent." });
    }
    
    console.log(`[Forgot Password] User found. Generating token...`);

    const resetToken = crypto.randomBytes(32).toString('hex');
    // Save token and expire in 1 hour
    await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '1 hour' WHERE id = $2`,
      [resetToken, user.id]
    );

    const resetLink = `${process.env.FRONTEND_ORIGIN || 'https://club-hub-vert.vercel.app'}/reset-password.html?token=${resetToken}`;

    const payload = {
        sender: { name: "Club Hub", email: "sportsshortsssss@gmail.com" },
        to: [{ email: user.email, name: user.name || "Student" }],
        subject: "Reset your Club Hub Password",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #050505; color: #ffffff; border-radius: 10px;">
            <h2 style="color: #E11D48; text-align: center;">Club Hub Password Reset</h2>
            <p style="font-size: 16px; color: #e2e8f0;">Hello,</p>
            <p style="font-size: 16px; color: #e2e8f0;">We received a request to reset your password. Click the button below to choose a new one:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #E11D48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Reset Password</a>
            </div>
            <p style="font-size: 14px; color: #94a3b8;">If you did not request this, please ignore this email.</p>
            <p style="font-size: 14px; color: #94a3b8; text-align: center; margin-top: 40px;">&copy; ${new Date().getFullYear()} Club Hub</p>
          </div>
        `
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': process.env.EMAIL_PASS
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        console.error('[Forgot Password] Brevo API Error:', await response.text());
        return res.status(500).json({ error: "Failed to send email" });
    }

    console.log(`[Forgot Password] Reset email sent successfully via Brevo to ${user.email}`);
    res.json({ ok: true, message: "If that email exists, a reset link was sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "server error" });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" });

  if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  try {
    const { rows } = await pool.query(
      `SELECT id, email FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const user = rows[0];
    const password_hash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
      [password_hash, user.id]
    );

    res.json({ ok: true, message: "Password has been successfully reset" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ==================== USN PARSING ====================

const BRANCH_CODES = {
  'BCS': 'Computer Science & Engineering',
  'BCI': 'Computer Science & Engineering (Artificial Intelligence)',
  'BCV': 'Computer Science & Engineering (Cyber Security)',
  'BIS': 'Information Science & Engineering',
  'BEC': 'Electronics & Communication Engineering',
  'BEE': 'Electrical & Electronics Engineering',
  'BME': 'Mechanical Engineering',
  'BCE': 'Civil Engineering',
  'BCH': 'Chemical Engineering',
  'BBT': 'Biotechnology',
  'BAD': 'Artificial Intelligence & Data Science',
  'BRO': 'Robotics & Automation',
  'BML': 'Machine Learning',
};

function parseUSN(email) {
  if (!email || !email.toLowerCase().endsWith('@kletech.ac.in')) {
    return null;
  }

  const usn = email.split('@')[0].toUpperCase();

  // USN format: 01FE23BCI050
  // Pattern: 2-digit college code + 2-char campus + 2-digit year + 2-3 char branch + 3-digit roll
  const match = usn.match(/^(\d{2})([A-Z]{2})(\d{2})([A-Z]{2,3})(\d{3})$/);
  if (!match) {
    return { usn, raw: true }; // Return raw USN if pattern doesn't match
  }

  const [, collegeCode, campusCode, admissionYearShort, branchCode, rollSerial] = match;
  const admissionYear = 2000 + parseInt(admissionYearShort);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  // Academic year starts in July (month 6)
  const academicYear = currentMonth >= 6 ? currentYear : currentYear - 1;
  const yearOfStudy = academicYear - admissionYear + 1;

  const yearSuffix = yearOfStudy === 1 ? 'st' : yearOfStudy === 2 ? 'nd' : yearOfStudy === 3 ? 'rd' : 'th';
  const yearLabel = yearOfStudy > 0 && yearOfStudy <= 6 ? `${yearOfStudy}${yearSuffix} Year` : null;

  const branchName = BRANCH_CODES[branchCode] || branchCode;

  return {
    usn,
    college_code: collegeCode,
    campus_code: campusCode,
    admission_year: admissionYear,
    branch_code: branchCode,
    branch: branchName,
    roll_serial: rollSerial,
    year: yearLabel,
    year_of_study: yearOfStudy,
  };
}

app.post('/api/parse-usn', (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ ok: false, error: 'email required' });
  }

  const parsed = parseUSN(email);
  if (!parsed) {
    return res.json({ ok: true, is_kletech: false, message: 'Not a KLE Tech email' });
  }

  if (parsed.raw) {
    return res.json({ ok: true, is_kletech: true, usn: parsed.usn, parsed: false, message: 'USN format not recognized' });
  }

  return res.json({
    ok: true,
    is_kletech: true,
    parsed: true,
    usn: parsed.usn,
    branch: parsed.branch,
    branch_code: parsed.branch_code,
    year: parsed.year,
    year_of_study: parsed.year_of_study,
    admission_year: parsed.admission_year,
    roll_number: parsed.usn,
  });
});

// ==================== USER PROFILE ROUTES ====================

app.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });

  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'invalid auth header' });
  }

  let payload;
  try {
    payload = jwt.verify(parts[1], JWT_SECRET);
  } catch (jwtErr) {
    if (jwtErr.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'invalid token' });
  }

  try {
    const user = await findUserByEmail(payload.sub);
    if (!user) return res.status(404).json({ error: 'user not found' });

    return res.json({
      ok: true,
      user: {
        email: user.email,
        name: user.name,
        branch: user.branch,
        role: user.role,
        roll_number: user.roll_number,
        admin_requested: user.admin_requested,
        profile_picture: user.profile_picture,
        club_id: user.club_id,
        dob: user.dob,
        year: user.year,
      }
    });
  } catch (err) {
    console.error('[/me] DB error:', err.message);
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
  }
});

app.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'missing token' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await findUserByEmail(decoded.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      profile: {
        email: user.email,
        name: user.name,
        branch: user.branch,
        roll_number: user.roll_number,
        role: user.role,
        club_id: user.club_id,
        admin_requested: user.admin_requested,
        requested_at: user.requested_at,
        club_name: user.club_name,
        club_code: user.club_code,
        profile_picture: user.profile_picture,
        dob: user.dob,
        year: user.year,
      }
    });
  } catch (err) {
    console.error('GET /profile error:', err);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

app.post('/profile', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'missing token' });

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
    const email = payload.sub.toLowerCase();

    const { name, branch, roll_number, role, club_id, dob, year } = req.body;

    const currentUser = await findUserByEmail(email);

    if (role && !currentUser.role) {
      if (role === 'student') {
        await updateProfile(email, {
          name: name || null,
          branch: branch || null,
          roll_number: roll_number || null,
          role: 'student',
          club_id: null,
          request_admin: false,
          dob: dob || null,
          year: year || null
        });
      } else if (role === 'club_admin') {
        await updateProfile(email, {
          name: name || null,
          branch: branch || null,
          roll_number: roll_number || null,
          role: null,
          club_id: club_id || null,
          request_admin: true,
          dob: dob || null,
          year: year || null
        });

        // Send email notification to coordinator
        sendAdminRequestEmail(email, name, club_id);
      }
    } else {
      await updateProfile(email, {
        name: name || null,
        branch: branch || null,
        roll_number: roll_number || null,
        role: null,
        club_id: null,
        request_admin: false,
        dob: dob || null,
        year: year || null
      });
    }

    const updatedUser = await findUserByEmail(email);

    return res.json({
      ok: true,
      message: role === 'club_admin' && !currentUser.role
        ? 'Club admin request submitted! Coordinator will review your request.'
        : 'Profile updated successfully',
      profile: updatedUser
    });
  } catch (err) {
    console.error('Profile save error:', err);
    return res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// ==================== PROFILE PICTURE ROUTE ====================

app.post('/profile/picture', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'missing token' });

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
    const email = payload.sub.toLowerCase();

    const { profile_picture } = req.body;

    if (!profile_picture || typeof profile_picture !== 'string') {
      return res.status(400).json({ error: 'profile_picture (base64 data URL) required' });
    }

    // Validate it's a data URL
    if (!profile_picture.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    await pool.query(
      `UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE email = $2`,
      [profile_picture, email]
    );

    console.log(`✓ Profile picture updated for ${email}`);
    return res.json({ ok: true, message: 'Profile picture updated successfully' });
  } catch (err) {
    console.error('Error saving profile picture:', err);
    return res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// ==================== PUSH NOTIFICATIONS ====================

app.post('/profile/fcm-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token is required' });
    }

    const success = await saveFCMToken(req.userEmail, token);
    if (success) {
      return res.json({ ok: true, message: 'FCM token saved' });
    } else {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
  } catch (err) {
    console.error('Error saving FCM token:', err);
    res.status(500).json({ ok: false, error: 'Failed to save FCM token' });
  }
});

// ==================== CLUB ROUTES ====================

app.get('/clubs', async (req, res) => {
  try {
    const clubs = await getAllClubs();
    return res.json({ ok: true, clubs });
  } catch (err) {
    console.error('Error fetching clubs:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/clubs/:id', async (req, res) => {
  try {
    const clubId = parseInt(req.params.id);
    const club = await getClubById(clubId);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const members = await getClubMembers(clubId);
    return res.json({ ok: true, club, members });
  } catch (err) {
    console.error('Error fetching club:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.put('/clubs/:id', authMiddleware, async (req, res) => {
  try {
    const clubId = parseInt(req.params.id);
    const { club_name, description, category, logo_url, banner_url, bio } = req.body;

    const user = await findUserByEmail(req.userEmail);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const coordinators = ['bigbossssz550@gmail.com', '01fe23bci050@kletech.ac.in'];
    const isCoordinator = coordinators.includes(user.email.toLowerCase());
    const isClubAdmin = user.role === 'club_admin' && user.club_id === clubId;

    if (!isCoordinator && !isClubAdmin) {
      return res.status(403).json({ ok: false, error: 'Access denied: Admin privileges required for this club' });
    }

    await pool.query(
      `UPDATE clubs
       SET club_name = COALESCE($1, club_name),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           logo_url = COALESCE($4, logo_url),
           banner_url = COALESCE($5, banner_url),
           bio = COALESCE($6, bio)
       WHERE id = $7`,
      [club_name, description, category, logo_url, banner_url, bio, clubId]
    );

    return res.json({ ok: true, message: 'Club profile updated successfully' });
  } catch (err) {
    console.error('Error updating club profile:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// ==================== ANNOUNCEMENT ROUTES ====================

app.get('/announcements', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Optional Auth for has_liked
    let userEmail = null;
    const auth = req.headers.authorization;
    if (auth) {
      const token = auth.split(' ')[1];
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userEmail = payload.sub.toLowerCase();
      } catch (err) {
        // Ignore invalid token for public fetch
      }
    }

    const announcements = await getAllAnnouncements(limit, offset, userEmail);
    console.log(`✓ Fetched ${announcements.length} announcements with registration data`);

    return res.json({ ok: true, announcements });
  } catch (err) {
    console.error('Error fetching announcements:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/announcements/club/:clubId', async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);

    // Optional Auth for has_liked
    let userEmail = null;
    const auth = req.headers.authorization;
    if (auth) {
      const token = auth.split(' ')[1];
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userEmail = payload.sub.toLowerCase();
      } catch (err) {
        // Ignore invalid token for public fetch
      }
    }

    const announcements = await getAnnouncementsByClub(clubId, 50, userEmail);
    return res.json({ ok: true, announcements });
  } catch (err) {
    console.error('Error fetching club announcements:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// ==================== LIKES & COMMENTS ====================

app.post('/announcements/:id/like', authMiddleware, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.id);
    const userEmail = req.userEmail;

    const hasLiked = await toggleLike(announcementId, userEmail);

    res.json({ ok: true, has_liked: hasLiked });
  } catch (err) {
    console.error('Error toggling like:', err);
    res.status(500).json({ ok: false, error: 'Failed to toggle like' });
  }
});

app.get('/announcements/:id/comments', async (req, res) => {
  try {
    const announcementId = parseInt(req.params.id);
    const comments = await getComments(announcementId);
    res.json({ ok: true, comments });
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch comments' });
  }
});

app.post('/announcements/:id/comments', authMiddleware, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.id);
    const userEmail = req.userEmail;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ ok: false, error: 'Comment content cannot be empty' });
    }

    const commentId = await addComment(announcementId, userEmail, content.trim());

    res.json({
      ok: true,
      message: 'Comment added',
      comment_id: commentId
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ ok: false, error: 'Failed to add comment' });
  }
});

// REPLACE YOUR EXISTING app.post('/announcements') ROUTE WITH THIS:


// Route removed: duplicate legacy handler that was ignoring registration data.
// The correct handler is located at the bottom of the file.


// REPLACE YOUR notifySubscribers FUNCTION WITH THIS:

async function notifySubscribers(clubId, announcementTitle, announcementContent, announcementId) {
  try {
    console.log('🔔 notifySubscribers called for club:', clubId);

    // Get club details
    const club = await getClubById(clubId);
    if (!club) {
      console.log('❌ Club not found:', clubId);
      return;
    }

    console.log('✅ Club found:', club.club_name);

    // Get all active subscribers with their emails
    const { rows: subscribers } = await pool.query(`
      SELECT u.id, u.email, u.name
      FROM club_subscriptions cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.club_id = $1 AND cs.is_active = true AND u.email IS NOT NULL
    `, [clubId]);

    console.log(`📊 Found ${subscribers.length} subscribers for club ${club.club_name}`);

    if (subscribers.length === 0) {
      console.log('⚠️ No subscribers to notify for club', clubId);
      return;
    }

    // Log subscriber details
    subscribers.forEach((sub, i) => {
      console.log(`  ${i + 1}. ${sub.email} (ID: ${sub.id}, Name: ${sub.name || 'N/A'})`);
    });

    console.log('📧 Attempting to send emails...');

    // Send email to each subscriber
    const emailPromises = subscribers.map((subscriber, index) => {
      const mailOptions = {
        from: process.env.FROM_EMAIL || process.env.EMAIL_USER,
        to: subscriber.email,
        subject: `🔔 New Announcement from ${club.club_name} - Club Hub`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background: #f5f5f5;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
              }
              .header { 
                background: linear-gradient(135deg, #C41E3A, #E63946); 
                padding: 30px; 
                text-align: center; 
                color: white;
              }
              .header h1 { 
                margin: 0; 
                font-size: 24px;
              }
              .club-badge {
                display: inline-block;
                background: rgba(255, 255, 255, 0.2);
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 14px;
                margin-top: 10px;
              }
              .content { 
                padding: 30px; 
              }
              .greeting {
                font-size: 16px;
                color: #1F2937;
                margin-bottom: 20px;
              }
              .announcement-box {
                background: #F9FAFB;
                border-left: 4px solid #C41E3A;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
              }
              .announcement-title {
                font-size: 20px;
                font-weight: bold;
                color: #1F2937;
                margin-bottom: 15px;
              }
              .announcement-content {
                font-size: 15px;
                color: #4B5563;
                line-height: 1.8;
                white-space: pre-wrap;
              }
              .view-button {
                display: inline-block;
                background: #C41E3A;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                margin: 20px 0;
              }
              .footer {
                background: #F9FAFB;
                padding: 20px;
                text-align: center;
                color: #6B7280;
                font-size: 14px;
              }
              .unsubscribe {
                margin-top: 15px;
                font-size: 12px;
              }
              .unsubscribe a {
                color: #6B7280;
                text-decoration: underline;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔔 New Announcement</h1>
                <div class="club-badge">${club.club_name}</div>
              </div>
              
              <div class="content">
                <p class="greeting">
                  Hi${subscriber.name ? ' ' + subscriber.name.split(' ')[0] : ''},
                </p>
                
                <p>
                  <strong>${club.club_name}</strong> just posted a new announcement!
                </p>
                
                <div class="announcement-box">
                  <div class="announcement-title">${announcementTitle}</div>
                  <div class="announcement-content">${announcementContent.substring(0, 300)}${announcementContent.length > 300 ? '...' : ''}</div>
                </div>
                
                <div style="text-align: center;">
                  <a href="http://localhost:3000/" class="view-button">
                    View Full Announcement
                  </a>
                </div>
                
                <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
                  You're receiving this because you subscribed to ${club.club_name} on Club Hub.
                </p>
              </div>
              
              <div class="footer">
                <p><strong>Club Hub</strong> - KLE Technological University</p>
                <div class="unsubscribe">
                  Not interested anymore? <a href="http://localhost:3000/clubs.html">Manage your subscriptions</a>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      };

      console.log(`  📤 Sending email ${index + 1}/${subscribers.length} to ${subscriber.email}...`);

      return transporter.sendMail(mailOptions)
        .then((info) => {
          console.log(`  ✅ Email ${index + 1} sent to ${subscriber.email}`, {
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected
          });
        })
        .catch(err => {
          console.error(`  ❌ Failed to send email ${index + 1} to ${subscriber.email}:`, {
            error: err.message,
            code: err.code,
            command: err.command
          });
        });
    });

    await Promise.all(emailPromises);
    console.log(`✅ Completed sending ${subscribers.length} notification emails`);
  } catch (err) {
    console.error('❌ Error in notifySubscribers:', err);
    throw err;
  }
}

app.delete('/announcements/:id', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'missing token' });

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
    const email = payload.sub.toLowerCase();

    const announcementId = parseInt(req.params.id);
    const { rows: anns } = await pool.query('SELECT club_id, created_by FROM announcements WHERE id = $1', [announcementId]);
    if (anns.length === 0) {
      return res.status(404).json({ error: 'announcement not found' });
    }
    const ann = anns[0];

    const { rows: users } = await pool.query('SELECT role, club_id FROM users WHERE email = $1', [email]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    const user = users[0];

    const isSuperAdmin = ['bigbossssz550@gmail.com', '01fe23bci050@kletech.ac.in'].includes(email);
    const isCreator = ann.created_by && ann.created_by.toLowerCase() === email;
    const isClubAdmin = user.role === 'club_admin' && user.club_id === ann.club_id;

    if (!isSuperAdmin && !isCreator && !isClubAdmin) {
      return res.status(403).json({ error: 'Unauthorized to delete this announcement' });
    }

    const success = await deleteAnnouncement(announcementId);

    if (!success) {
      return res.status(404).json({ error: 'announcement not found' });
    }

    return res.json({ ok: true, message: 'Announcement deleted' });
  } catch (err) {
    console.error('Error deleting announcement:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.put('/announcements/:id', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'missing token' });

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
    const email = payload.sub.toLowerCase();

    const announcementId = parseInt(req.params.id);
    const { title, content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }

    const { rows: anns } = await pool.query('SELECT club_id, created_by FROM announcements WHERE id = $1', [announcementId]);
    if (anns.length === 0) {
      return res.status(404).json({ error: 'announcement not found' });
    }
    const ann = anns[0];

    const { rows: users } = await pool.query('SELECT role, club_id FROM users WHERE email = $1', [email]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    const user = users[0];

    const isSuperAdmin = ['bigbossssz550@gmail.com', '01fe23bci050@kletech.ac.in'].includes(email);
    const isCreator = ann.created_by && ann.created_by.toLowerCase() === email;
    const isClubAdmin = user.role === 'club_admin' && user.club_id === ann.club_id;

    if (!isSuperAdmin && !isCreator && !isClubAdmin) {
      return res.status(403).json({ error: 'Unauthorized to update this announcement' });
    }

    // Auto-generate title from content if not provided
    const finalTitle = title || content.substring(0, 80).trim();
    const success = await updateAnnouncement(announcementId, finalTitle, content);

    if (!success) {
      return res.status(404).json({ error: 'announcement not found' });
    }

    return res.json({ ok: true, message: 'Announcement updated' });
  } catch (err) {
    console.error('Error updating announcement:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// ==================== ADMIN ROUTES ====================

app.get('/admin/pending-requests', authMiddleware, isCoordinator, async (req, res) => {
  try {
    const { rows: requests } = await pool.query(`
      SELECT 
        u.email,
        u.name,
        u.branch,
        u.roll_number,
        u.club_id,
        u.requested_at,
        c.club_name,
        c.club_code
      FROM users u
      LEFT JOIN clubs c ON u.club_id = c.id
      WHERE u.admin_requested = true AND u.role IS NULL
      ORDER BY u.requested_at DESC
    `);

    res.json({ ok: true, requests });
  } catch (err) {
    console.error('Error fetching pending requests:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch requests' });
  }
});

app.get('/admin/stats', authMiddleware, isCoordinator, async (req, res) => {
  try {
    const { rows: countResult } = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'club_admin'"
    );

    res.json({ ok: true, adminCount: countResult[0].count });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

app.post('/admin/approve-request', authMiddleware, isCoordinator, async (req, res) => {
  try {
    const { email, club_id } = req.body;

    if (!email) {
      return res.status(400).json({ ok: false, error: 'Email required' });
    }

    await pool.query(`
      UPDATE users 
      SET role = 'club_admin', 
          admin_requested = false,
          updated_at = NOW()
      WHERE email = $1
    `, [email.toLowerCase()]);

    console.log(`✓ Approved club admin: ${email}`);

    res.json({ ok: true, message: 'Approved successfully' });
  } catch (err) {
    console.error('Error approving:', err);
    res.status(500).json({ ok: false, error: 'Failed to approve' });
  }
});

app.post('/admin/reject-request', authMiddleware, isCoordinator, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ ok: false, error: 'Email required' });
    }

    await pool.query(`
      UPDATE users 
      SET admin_requested = false,
          club_id = NULL,
          requested_at = NULL,
          updated_at = NOW()
      WHERE email = $1
    `, [email.toLowerCase()]);

    console.log(`✗ Rejected request: ${email}`);

    res.json({ ok: true, message: 'Rejected' });
  } catch (err) {
    console.error('Error rejecting:', err);
    res.status(500).json({ ok: false, error: 'Failed to reject' });
  }
});

// ==================== EMAIL NOTIFICATION FUNCTION ====================

// UPDATE THE sendAdminRequestEmail FUNCTION IN backend/index.js

async function sendAdminRequestEmail(userEmail, userName, clubId) {
  try {
    let clubName = 'Unknown Club';
    if (clubId) {
      const { rows: clubs } = await pool.query('SELECT club_name FROM clubs WHERE id = $1', [clubId]);
      if (clubs.length > 0) clubName = clubs[0].club_name;
    }

    // Generate unique token for this request
    const requestToken = jwt.sign(
      {
        action: 'admin_request',
        email: userEmail,
        club_id: clubId,
        timestamp: Date.now()
      },
      JWT_SECRET,
      { expiresIn: '7d' } // Token valid for 7 days
    );

    // Create approve and reject links
    const backendUrl = process.env.BACKEND_URL || 'https://clubhub-5eh7.onrender.com';
    const approveUrl = `${backendUrl}/admin/approve-via-email?token=${requestToken}`;
    const rejectUrl = `${backendUrl}/admin/reject-via-email?token=${requestToken}`;

    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.EMAIL_USER,
      to: '01fe23bci050@kletech.ac.in',
      subject: '🎯 New Club Admin Request - Club Hub',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0;
              padding: 0;
            }
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background: #f5f5f5;
              padding: 20px;
            }
            .header { 
              background: linear-gradient(135deg, #F2B705, #F5C422); 
              padding: 30px; 
              text-align: center; 
              border-radius: 10px 10px 0 0;
            }
            .header h1 { 
              color: #1A1A1A; 
              margin: 0; 
              font-size: 24px;
            }
            .content { 
              background: white; 
              padding: 30px; 
              border: 1px solid #E5E7EB;
            }
            .info-box { 
              background: #F9FAFB; 
              padding: 20px; 
              border-radius: 8px; 
              margin: 20px 0;
              border-left: 4px solid #C41E3A;
            }
            .info-item { 
              margin: 10px 0;
              font-size: 15px;
            }
            .label { 
              font-weight: bold; 
              color: #374151;
              display: inline-block;
              width: 120px;
            }
            .value { 
              color: #1F2937;
            }
            .action-section {
              background: #FFF9E6;
              padding: 25px;
              border-radius: 10px;
              margin: 25px 0;
              border: 2px solid #F2B705;
              text-align: center;
            }
            .action-title {
              font-size: 18px;
              font-weight: bold;
              color: #1A1A1A;
              margin-bottom: 15px;
            }
            .button-group {
              display: flex;
              gap: 15px;
              justify-content: center;
              margin-top: 20px;
            }
            .button { 
              display: inline-block; 
              padding: 15px 40px; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: bold;
              font-size: 16px;
              text-align: center;
              cursor: pointer;
            }
            .btn-approve {
              background: #10B981;
              color: white;
            }
            .btn-approve:hover {
              background: #059669;
            }
            .btn-reject {
              background: #EF4444;
              color: white;
            }
            .btn-reject:hover {
              background: #DC2626;
            }
            .dashboard-link {
              text-align: center;
              margin: 20px 0;
              padding: 15px;
              background: #F9FAFB;
              border-radius: 8px;
            }
            .dashboard-link a {
              color: #C41E3A;
              text-decoration: none;
              font-weight: 600;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #6B7280; 
              font-size: 14px;
              background: white;
              border-radius: 0 0 10px 10px;
            }
            .warning {
              color: #D97706;
              font-size: 13px;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>🎯 New Club Admin Request</h1>
            </div>
            
            <div class="content">
              <p style="font-size: 16px; margin-bottom: 20px;">Hello Coordinator,</p>
              
              <p style="font-size: 15px;">A new club admin access request has been submitted on Club Hub:</p>
              
              <div class="info-box">
                <div class="info-item">
                  <span class="label">Name:</span> 
                  <span class="value">${userName || 'Not provided'}</span>
                </div>
                <div class="info-item">
                  <span class="label">Email:</span> 
                  <span class="value">${userEmail}</span>
                </div>
                <div class="info-item">
                  <span class="label">Requested Club:</span> 
                  <span class="value">${clubName}</span>
                </div>
                <div class="info-item">
                  <span class="label">Date:</span> 
                  <span class="value">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                </div>
              </div>
              
              <div class="action-section">
                <div class="action-title">⚡ Quick Action - Click to Respond</div>
                <p style="color: #6B7280; font-size: 14px; margin: 10px 0;">
                  Review this request and take action with one click:
                </p>
                
                <div class="button-group">
                  <a href="${approveUrl}" class="button btn-approve">
                    ✓ Approve Request
                  </a>
                  <a href="${rejectUrl}" class="button btn-reject">
                    ✗ Reject Request
                  </a>
                </div>
                
                <p class="warning">
                  ⚠️ These links expire in 7 days
                </p>
              </div>
              
              <div class="dashboard-link">
                <p style="margin: 5px 0; color: #6B7280; font-size: 14px;">
                  Or view all requests in:
                </p>
                <a href="${process.env.FRONTEND_ORIGIN || 'https://club-hub-vert.vercel.app'}/admin-dashboard.html">Admin Dashboard →</a>
              </div>
              
              <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
                💡 <strong>Tip:</strong> Once approved, the user will immediately gain club admin privileges and can start creating announcements.
              </p>
            </div>
            
            <div class="footer">
              <p style="margin: 5px 0;"><strong>Club Hub</strong> - KLE Technological University</p>
              <p style="margin: 5px 0; font-size: 12px;">This is an automated notification. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmailWrapper(mailOptions);
    console.log(`✓ Admin notification email sent to 01fe23bci050@kletech.ac.in`);
  } catch (err) {
    console.error('Failed to send admin notification email:', err);
    // Don't throw - request should still be saved even if email fails
  }
}

// ==================== ADD THESE NEW ROUTES ====================

// Approve request via email link
app.get('/admin/approve-via-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error - Club Hub</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #FEE2E2; margin: 0; }
            .container { background: white; padding: 40px; border-radius: 10px; text-align: center; max-width: 500px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h1 { color: #DC2626; margin-bottom: 20px; }
            p { color: #6B7280; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Invalid Link</h1>
            <p>This approval link is invalid or missing required information.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Expired - Club Hub</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #FEF2F2; margin: 0; }
            .container { background: white; padding: 40px; border-radius: 10px; text-align: center; max-width: 500px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h1 { color: #DC2626; margin-bottom: 20px; }
            p { color: #6B7280; line-height: 1.6; }
            .button { display: inline-block; margin-top: 20px; padding: 12px 30px; background: #C41E3A; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⏰ Link Expired</h1>
            <p>This approval link has expired. Please use the admin dashboard to review the request.</p>
            <a href="http://localhost:3000/admin-dashboard.html" class="button">Go to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    }

    const { email, club_id } = decoded;

    // Check if request still exists
    const { rows: requests } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND admin_requested = true AND role IS NULL',
      [email.toLowerCase()]
    );

    if (requests.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already Processed - Club Hub</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #FEF3C7; margin: 0; }
            .container { background: white; padding: 40px; border-radius: 10px; text-align: center; max-width: 500px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h1 { color: #D97706; margin-bottom: 20px; }
            p { color: #6B7280; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>ℹ️ Already Processed</h1>
            <p>This request has already been approved or rejected.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Approve the request
    await pool.query(`
      UPDATE users 
      SET role = 'club_admin', 
          admin_requested = false,
          updated_at = NOW()
      WHERE email = $1
    `, [email.toLowerCase()]);

    console.log(`✓ Approved club admin via email: ${email}`);

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Approved - Club Hub</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #F2B705, #F5C422); margin: 0; }
          .container { background: white; padding: 50px; border-radius: 15px; text-align: center; max-width: 500px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
          .icon { font-size: 80px; margin-bottom: 20px; }
          h1 { color: #10B981; margin-bottom: 20px; font-size: 28px; }
          p { color: #6B7280; line-height: 1.8; font-size: 16px; }
          .user-info { background: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
          .label { font-weight: bold; color: #374151; }
          .value { color: #1F2937; }
          .button { display: inline-block; margin-top: 20px; padding: 12px 30px; background: #C41E3A; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✅</div>
          <h1>Request Approved!</h1>
          <p>The club admin request has been successfully approved.</p>
          <div class="user-info">
            <p><span class="label">User:</span> <span class="value">${email}</span></p>
            <p><span class="label">Status:</span> <span class="value">Now Club Admin</span></p>
            <p><span class="label">Access:</span> <span class="value">Can create announcements</span></p>
          </div>
          <p>The user has been notified and can now access admin features.</p>
          <a href="${process.env.FRONTEND_ORIGIN || 'https://club-hub-vert.vercel.app'}/admin-dashboard.html" class="button">View Dashboard</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error approving via email:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - Club Hub</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #FEE2E2; margin: 0; }
          .container { background: white; padding: 40px; border-radius: 10px; text-align: center; max-width: 500px; }
          h1 { color: #DC2626; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Error</h1>
          <p>Failed to process the request. Please try using the admin dashboard instead.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Reject request via email link
app.get('/admin/reject-via-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send('<h1>Invalid link</h1>');
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Expired - Club Hub</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #FEF2F2; margin: 0; }
            .container { background: white; padding: 40px; border-radius: 10px; text-align: center; max-width: 500px; }
            h1 { color: #DC2626; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⏰ Link Expired</h1>
            <p>This link has expired. Please use the admin dashboard.</p>
          </div>
        </body>
        </html>
      `);
    }

    const { email } = decoded;

    // Check if request exists
    const { rows: requests } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND admin_requested = true AND role IS NULL',
      [email.toLowerCase()]
    );

    if (requests.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already Processed</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #FEF3C7; margin: 0; }
            .container { background: white; padding: 40px; border-radius: 10px; text-align: center; max-width: 500px; }
            h1 { color: #D97706; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>ℹ️ Already Processed</h1>
            <p>This request has already been processed.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Reject the request
    await pool.query(`
      UPDATE users 
      SET admin_requested = false,
          club_id = NULL,
          requested_at = NULL,
          updated_at = NOW()
      WHERE email = $1
    `, [email.toLowerCase()]);

    console.log(`✗ Rejected club admin via email: ${email}`);

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rejected - Club Hub</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #F2B705, #F5C422); margin: 0; }
          .container { background: white; padding: 50px; border-radius: 15px; text-align: center; max-width: 500px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
          .icon { font-size: 80px; margin-bottom: 20px; }
          h1 { color: #EF4444; margin-bottom: 20px; font-size: 28px; }
          p { color: #6B7280; line-height: 1.8; font-size: 16px; }
          .user-info { background: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🚫</div>
          <h1>Request Rejected</h1>
          <p>The club admin request has been rejected.</p>
          <div class="user-info">
            <p><strong>User:</strong> ${email}</p>
            <p><strong>Status:</strong> Request denied</p>
          </div>
          <p>The request has been removed from the system.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error rejecting via email:', err);
    res.status(500).send('<h1>Error processing request</h1>');
  }
});
// ADD THESE ROUTES TO backend/index.js

// ==================== CLUB SUBSCRIPTION ROUTES ====================

// Subscribe to a club
app.post('/clubs/:clubId/subscribe', authMiddleware, async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);
    const userEmail = req.userEmail;

    // Get user ID
    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Check if club exists
    const club = await getClubById(clubId);
    if (!club) {
      return res.status(404).json({ ok: false, error: 'Club not found' });
    }

    // Check if already subscribed
    const { rows: existing } = await pool.query(
      'SELECT id, is_active FROM club_subscriptions WHERE user_id = $1 AND club_id = $2',
      [user.id, clubId]
    );

    if (existing.length > 0) {
      // Reactivate if was unsubscribed
      await pool.query(
        'UPDATE club_subscriptions SET is_active = true, subscribed_at = NOW() WHERE user_id = $1 AND club_id = $2',
        [user.id, clubId]
      );
    } else {
      // Create new subscription
      await pool.query(
        'INSERT INTO club_subscriptions (user_id, club_id) VALUES ($1, $2)',
        [user.id, clubId]
      );
    }

    console.log(`✓ ${userEmail} subscribed to club ${clubId}`);

    // --- SEND NOTIFICATION TO ALL ADMINS ---
    try {
      const admins = await getClubAdmins(clubId);
      for (const adminUser of admins) {
        // 1. Save to DB
        await addNotification(
          adminUser.id,
          'New Club Subscription 🎉',
          `${user.name || userEmail.split('@')[0]} just subscribed to ${club.club_name}!`,
          'subscription',
          clubId
        );

        // 2. Send push if token exists and Firebase is setup
        if (admin.apps.length > 0 && adminUser.fcm_token) {
          try {
            await admin.messaging().send({
              token: adminUser.fcm_token,
              notification: {
                title: 'New Club Subscription 🎉',
                body: `${user.name || userEmail.split('@')[0]} just subscribed to ${club.club_name}!`,
              },
              webpush: {
                fcmOptions: { link: '/notifications.html' }
              }
            });
            console.log(`✓ Push notification sent to admin ${adminUser.email}`);
          } catch (err) {
            console.error(`Failed to push to ${adminUser.email}:`, err.message);
          }
        }
      }
    } catch (notifErr) {
      console.error('Error handling notifications:', notifErr);
    }

    res.json({
      ok: true,
      message: 'Successfully subscribed to club',
      subscribed: true
    });
  } catch (err) {
    console.error('Error subscribing to club:', err);
    res.status(500).json({ ok: false, error: 'Failed to subscribe' });
  }
});

// Unsubscribe from a club
app.post('/clubs/:clubId/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);
    const userEmail = req.userEmail;

    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Soft delete - set is_active to false
    await pool.query(
      'UPDATE club_subscriptions SET is_active = false WHERE user_id = $1 AND club_id = $2',
      [user.id, clubId]
    );

    console.log(`✓ ${userEmail} unsubscribed from club ${clubId}`);

    res.json({
      ok: true,
      message: 'Successfully unsubscribed from club',
      subscribed: false
    });
  } catch (err) {
    console.error('Error unsubscribing from club:', err);
    res.status(500).json({ ok: false, error: 'Failed to unsubscribe' });
  }
});

// Check subscription status for a club
app.get('/clubs/:clubId/subscription-status', authMiddleware, async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);
    const userEmail = req.userEmail;

    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.json({ ok: true, subscribed: false });
    }

    const { rows: subscription } = await pool.query(
      'SELECT is_active FROM club_subscriptions WHERE user_id = $1 AND club_id = $2',
      [user.id, clubId]
    );

    res.json({
      ok: true,
      subscribed: subscription.length > 0 && (subscription[0].is_active === 1 || subscription[0].is_active === true)
    });
  } catch (err) {
    console.error('Error checking subscription:', err);
    res.status(500).json({ ok: false, error: 'Failed to check subscription' });
  }
});

// Get all subscribed clubs for current user
app.get('/my-subscriptions', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.userEmail;

    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.json({ ok: true, subscriptions: [] });
    }

    const { rows: subscriptions } = await pool.query(`
      SELECT 
        c.id,
        c.club_name,
        c.club_code,
        c.description,
        c.category,
        cs.subscribed_at
      FROM club_subscriptions cs
      JOIN clubs c ON cs.club_id = c.id
      WHERE cs.user_id = $1 AND cs.is_active = true
      ORDER BY cs.subscribed_at DESC
    `, [user.id]);

    res.json({ ok: true, subscriptions });
  } catch (err) {
    console.error('Error fetching subscriptions:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch subscriptions' });
  }
});

// Get subscriber count for a club
app.get('/clubs/:clubId/subscriber-count', async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);

    const { rows: result } = await pool.query(
      'SELECT COUNT(*) as count FROM club_subscriptions WHERE club_id = $1 AND is_active = true',
      [clubId]
    );

    res.json({ ok: true, count: result[0].count });
  } catch (err) {
    console.error('Error getting subscriber count:', err);
    res.status(500).json({ ok: false, error: 'Failed to get count' });
  }
});

// ==================== NOTIFICATIONS ROUTES ====================

app.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const user = await findUserByEmail(req.userEmail);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    // Default limit 50
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await getUserNotifications(user.id, limit);

    res.json({ ok: true, notifications });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

app.post('/notifications/read', authMiddleware, async (req, res) => {
  try {
    const user = await findUserByEmail(req.userEmail);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    await markNotificationsAsRead(user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error marking notifications read:', err);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

// ==================== EMAIL NOTIFICATION FUNCTION ====================

// Function to send announcement notification to subscribers
async function notifySubscribers(clubId, announcementTitle, announcementContent, announcementId) {
  try {
    // Get club details
    const club = await getClubById(clubId);
    if (!club) return;

    // Get all active subscribers with their emails
    const { rows: subscribers } = await pool.query(`
      SELECT u.email, u.name
      FROM club_subscriptions cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.club_id = $1 AND cs.is_active = true AND u.email IS NOT NULL
    `, [clubId]);

    if (subscribers.length === 0) {
      console.log('No subscribers to notify for club', clubId);
      return;
    }

    console.log(`Sending announcement notification to ${subscribers.length} subscribers of ${club.club_name}`);

    // Send email to subscribers in batches to avoid rate limits
    const BATCH_SIZE = 10;
    const DELAY_MS = 500;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      console.log(`Processing email batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(subscribers.length / BATCH_SIZE)}...`);

      const emailPromises = batch.map(subscriber => {
        const mailOptions = {
          from: process.env.FROM_EMAIL || process.env.EMAIL_USER,
          to: subscriber.email,
          subject: `🔔 New Announcement from ${club.club_name} - Club Hub`,
          html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background: #f5f5f5;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
              }
              .header { 
                background: linear-gradient(135deg, #C41E3A, #E63946); 
                padding: 30px; 
                text-align: center; 
                color: white;
              }
              .header h1 { 
                margin: 0; 
                font-size: 24px;
              }
              .club-badge {
                display: inline-block;
                background: rgba(255, 255, 255, 0.2);
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 14px;
                margin-top: 10px;
              }
              .content { 
                padding: 30px; 
              }
              .greeting {
                font-size: 16px;
                color: #1F2937;
                margin-bottom: 20px;
              }
              .announcement-box {
                background: #F9FAFB;
                border-left: 4px solid #C41E3A;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
              }
              .announcement-title {
                font-size: 20px;
                font-weight: bold;
                color: #1F2937;
                margin-bottom: 15px;
              }
              .announcement-content {
                font-size: 15px;
                color: #4B5563;
                line-height: 1.8;
                white-space: pre-wrap;
              }
              .view-button {
                display: inline-block;
                background: #C41E3A;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                margin: 20px 0;
              }
              .footer {
                background: #F9FAFB;
                padding: 20px;
                text-align: center;
                color: #6B7280;
                font-size: 14px;
              }
              .unsubscribe {
                margin-top: 15px;
                font-size: 12px;
              }
              .unsubscribe a {
                color: #6B7280;
                text-decoration: underline;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔔 New Announcement</h1>
                <div class="club-badge">${club.club_name}</div>
              </div>
              
              <div class="content">
                <p class="greeting">
                  Hi${subscriber.name ? ' ' + subscriber.name.split(' ')[0] : ''},
                </p>
                
                <p>
                  <strong>${club.club_name}</strong> just posted a new announcement!
                </p>
                
                <div class="announcement-box">
                  <div class="announcement-title">${announcementTitle}</div>
                  <div class="announcement-content">${announcementContent.substring(0, 300)}${announcementContent.length > 300 ? '...' : ''}</div>
                </div>
                
                <div style="text-align: center;">
                  <a href="http://localhost:3000/" class="view-button">
                    View Full Announcement
                  </a>
                </div>
                
                <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
                  You're receiving this because you subscribed to ${club.club_name} on Club Hub.
                </p>
              </div>
              
              <div class="footer">
                <p><strong>Club Hub</strong> - KLE Technological University</p>
                <div class="unsubscribe">
                  Not interested anymore? <a href="http://localhost:3000/clubs.html">Manage your subscriptions</a>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
        };

        // Use sendEmailWrapper for safe handling
        return sendEmailWrapper(mailOptions)
          .then(() => console.log(`✓ Email sent to ${subscriber.email}`))
          .catch(err => console.error(`✗ Failed to send to ${subscriber.email}:`, err.message));
      });

      await Promise.all(emailPromises);

      // Delay between batches
      if (i + BATCH_SIZE < subscribers.length) {
        await delay(DELAY_MS);
      }
    }
    console.log(`✓ Notification emails sent to ${subscribers.length} subscribers in batches`);
  } catch (err) {
    console.error('Error notifying subscribers:', err);
    // Don't throw - announcement should still be created even if emails fail
  }
}

// ==================== UPDATE ANNOUNCEMENT CREATION ====================

// UPDATE YOUR EXISTING app.post('/announcements') ROUTE
// Find this route and modify it to send notifications:


// Route removed: duplicate legacy handler.
// Correct handler is at line 2044.

// ==================== SOCIAL ROUTES (LIKES & COMMENTS) ====================
// ADD THESE ROUTES TO backend/index.js

// ==================== EVENT REGISTRATION ROUTES ====================

// Register for an event
app.post('/announcements/:announcementId/register', authMiddleware, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.announcementId);
    const userEmail = req.userEmail;
    const { custom_fields_data } = req.body || {};

    // Get user details
    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Check if announcement exists and has registration enabled
    const { rows: announcements } = await pool.query(
      `SELECT id, title, registration_enabled, registration_deadline, max_registrations 
       FROM announcements WHERE id = $1`,
      [announcementId]
    );

    if (announcements.length === 0) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    const announcement = announcements[0];

    if (!announcement.registration_enabled) {
      return res.status(400).json({ ok: false, error: 'Registration not enabled for this event' });
    }

    // Check if registration deadline has passed
    if (announcement.registration_deadline) {
      const deadline = new Date(announcement.registration_deadline);
      if (new Date() > deadline) {
        return res.status(400).json({ ok: false, error: 'Registration deadline has passed' });
      }
    }

    // Check if max registrations reached
    if (announcement.max_registrations) {
      const { rows: countResult } = await pool.query(
        `SELECT COUNT(*) as count FROM event_registrations WHERE announcement_id = $1 AND status = 'registered'`,
        [announcementId]
      );

      if (parseInt(countResult[0].count) >= announcement.max_registrations) {
        return res.status(400).json({ ok: false, error: 'Event is full. Maximum registrations reached.' });
      }
    }

    // Validate custom fields if any are required
    const { rows: customFields } = await pool.query(
      `SELECT id, field_name, is_required FROM event_registration_fields WHERE announcement_id = $1 ORDER BY sort_order`,
      [announcementId]
    );

    if (customFields.length > 0) {
      const fieldsData = custom_fields_data || {};
      const fieldsDataLower = {};
      for (const key of Object.keys(fieldsData)) {
        fieldsDataLower[String(key).toLowerCase().trim()] = fieldsData[key];
      }

      for (const field of customFields) {
        const valById = fieldsData[field.id];
        const valByName = fieldsData[field.field_name];
        const valByNameLower = fieldsDataLower[String(field.field_name).toLowerCase().trim()];
        
        const value = valById !== undefined ? valById : (valByName !== undefined ? valByName : valByNameLower);

        if (field.is_required && (value === undefined || value === null || !String(value).trim())) {
          return res.status(400).json({ ok: false, error: `"${field.field_name}" is required` });
        }
      }
    }

    // Check if already registered
    const { rows: existing } = await pool.query(
      'SELECT id, status FROM event_registrations WHERE announcement_id = $1 AND user_id = $2',
      [announcementId, user.id]
    );

    const fieldsJson = custom_fields_data ? JSON.stringify(custom_fields_data) : '{}';

    if (existing.length > 0) {
      if (existing[0].status === 'registered') {
        return res.status(400).json({ ok: false, error: 'Already registered for this event' });
      } else {
        // Re-register if previously cancelled
        await pool.query(
          `UPDATE event_registrations SET status = 'registered', registered_at = NOW(), custom_fields_data = $2 WHERE id = $1`,
          [existing[0].id, fieldsJson]
        );
      }
    } else {
      // Create new registration
      await pool.query(
        `INSERT INTO event_registrations (announcement_id, user_id, custom_fields_data) VALUES ($1, $2, $3)`,
        [announcementId, user.id, fieldsJson]
      );
    }

    console.log(`✓ ${userEmail} registered for event ${announcementId}`);

    // --- SEND NOTIFICATION TO ALL ADMINS ---
    try {
      const admins = await getClubAdmins(announcement.club_id);
      for (const adminUser of admins) {
        // 1. Save to DB
        await addNotification(
          adminUser.id,
          'New Event Registration 🎟️',
          `${user.name || userEmail.split('@')[0]} registered for "${announcement.title}"`,
          'registration',
          announcementId
        );

        // 2. Send push if token exists and Firebase is setup
        if (admin.apps.length > 0 && adminUser.fcm_token) {
          try {
            await admin.messaging().send({
              token: adminUser.fcm_token,
              notification: {
                title: 'New Event Registration 🎟️',
                body: `${user.name || userEmail.split('@')[0]} registered for "${announcement.title}"`,
              },
              webpush: {
                fcmOptions: { link: '/notifications.html' }
              }
            });
          } catch (err) {
            console.error(`Failed to push to ${adminUser.email}:`, err.message);
          }
        }
      }
    } catch (notifErr) {
      console.error('Error handling notifications:', notifErr);
    }

    res.json({
      ok: true,
      message: 'Successfully registered for event!',
      registered: true
    });
  } catch (err) {
    console.error('Error registering for event:', err);
    res.status(500).json({ ok: false, error: 'Failed to register' });
  }
});

// Cancel registration
app.post('/announcements/:announcementId/unregister', authMiddleware, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.announcementId);
    const userEmail = req.userEmail;

    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Update registration status to cancelled
    // Update registration status to cancelled
    const { rowCount } = await pool.query(
      'UPDATE event_registrations SET status = \'cancelled\' WHERE announcement_id = $1 AND user_id = $2 AND (status = \'registered\' OR status = \'waitlisted\')',
      [announcementId, user.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Registration not found' });
    }

    console.log(`✓ ${userEmail} cancelled registration for event ${announcementId}`);

    res.json({
      ok: true,
      message: 'Registration cancelled successfully',
      registered: false
    });
  } catch (err) {
    console.error('Error cancelling registration:', err);
    res.status(500).json({ ok: false, error: 'Failed to cancel registration' });
  }
});

// Check registration status for an event
app.get('/announcements/:announcementId/registration-status', authMiddleware, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.announcementId);
    const userEmail = req.userEmail;

    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.json({ ok: true, registered: false });
    }

    const { rows: registrations } = await pool.query(
      'SELECT status FROM event_registrations WHERE announcement_id = $1 AND user_id = $2',
      [announcementId, user.id]
    );

    res.json({
      ok: true,
      registered: registrations.length > 0 && registrations[0].status === 'registered'
    });
  } catch (err) {
    console.error('Error checking registration status:', err);
    res.status(500).json({ ok: false, error: 'Failed to check status' });
  }
});

// Get registration count and capacity for an event
app.get('/announcements/:announcementId/registration-info', async (req, res) => {
  try {
    const announcementId = parseInt(req.params.announcementId);

    const { rows: announcements } = await pool.query(
      `SELECT registration_enabled, registration_deadline, max_registrations 
       FROM announcements WHERE id = $1`,
      [announcementId]
    );

    if (announcements.length === 0) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    const announcement = announcements[0];

    const { rows: countResult } = await pool.query(
      "SELECT COUNT(*) as count FROM event_registrations WHERE announcement_id = $1 AND status = 'registered'",
      [announcementId]
    );

    const currentCount = parseInt(countResult[0].count);
    const isFull = announcement.max_registrations && currentCount >= announcement.max_registrations;
    const deadlinePassed = announcement.registration_deadline && new Date() > new Date(announcement.registration_deadline);

    res.json({
      ok: true,
      registration_enabled: announcement.registration_enabled === 1,
      current_count: currentCount,
      max_registrations: announcement.max_registrations,
      is_full: isFull,
      deadline: announcement.registration_deadline,
      deadline_passed: deadlinePassed
    });
  } catch (err) {
    console.error('Error getting registration info:', err);
    res.status(500).json({ ok: false, error: 'Failed to get info' });
  }
});

// Get custom registration fields for an event
app.get('/announcements/:announcementId/registration-fields', async (req, res) => {
  try {
    const announcementId = parseInt(req.params.announcementId);

    const { rows: fields } = await pool.query(
      `SELECT id, field_name, field_type, is_required, sort_order
       FROM event_registration_fields
       WHERE announcement_id = $1
       ORDER BY sort_order ASC`,
      [announcementId]
    );

    res.json({ ok: true, fields });
  } catch (err) {
    console.error('Error fetching registration fields:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch fields' });
  }
});

// Get all registrations for an event (Club Admins only)
app.get('/announcements/:announcementId/registrations', authMiddleware, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.announcementId);
    const userEmail = req.userEmail;

    // Check if user is the club admin who created this announcement
    const user = await findUserByEmail(userEmail);
    if (user.role !== 'club_admin') {
      return res.status(403).json({ ok: false, error: 'Only club admins can view registrations' });
    }

    const { rows: announcement } = await pool.query(
      'SELECT club_id, created_by FROM announcements WHERE id = $1',
      [announcementId]
    );

    if (announcement.length === 0) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    // Verify the club admin owns this announcement
    if (user.club_id !== announcement[0].club_id) {
      return res.status(403).json({ ok: false, error: 'You can only view registrations for your club events' });
    }

    // Get all registrations
    const { rows: registrations } = await pool.query(
      `SELECT 
        er.id,
        u.name AS user_name,
        u.email AS user_email,
        u.roll_number,
        u.branch,
        er.registered_at,
        er.status,
        er.custom_fields_data
       FROM event_registrations er
       JOIN users u ON er.user_id = u.id
       WHERE er.announcement_id = $1
       ORDER BY er.registered_at DESC`,
      [announcementId]
    );

    // Get custom field definitions for this event
    const { rows: customFields } = await pool.query(
      `SELECT id, field_name, field_type FROM event_registration_fields WHERE announcement_id = $1 ORDER BY sort_order`,
      [announcementId]
    );

    res.json({
      ok: true,
      registrations,
      custom_fields: customFields,
      total_count: registrations.length,
      registered_count: registrations.filter(r => r.status === 'registered').length
    });
  } catch (err) {
    console.error('Error fetching registrations:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch registrations' });
  }
});

// Export registrations as CSV (Club Admins only)
app.get('/announcements/:announcementId/registrations/export', authMiddleware, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.announcementId);
    const userEmail = req.userEmail;

    const user = await findUserByEmail(userEmail);
    if (user.role !== 'club_admin') {
      return res.status(403).json({ ok: false, error: 'Only club admins can export registrations' });
    }

    const { rows: announcement } = await pool.query(
      'SELECT title, club_id FROM announcements WHERE id = $1',
      [announcementId]
    );

    if (announcement.length === 0 || user.club_id !== announcement[0].club_id) {
      return res.status(403).json({ ok: false, error: 'Unauthorized' });
    }

    const { rows: registrations } = await pool.query(
      `SELECT 
        u.name AS user_name,
        u.email AS user_email,
        u.roll_number,
        u.branch,
        er.registered_at,
        er.status,
        er.custom_fields_data
       FROM event_registrations er
       JOIN users u ON er.user_id = u.id
       WHERE er.announcement_id = $1
       ORDER BY er.registered_at DESC`,
      [announcementId]
    );

    // Get custom field definitions
    const { rows: customFields } = await pool.query(
      `SELECT id, field_name FROM event_registration_fields WHERE announcement_id = $1 ORDER BY sort_order`,
      [announcementId]
    );

    // Generate CSV with custom field columns
    const baseHeaders = ['Name', 'Email', 'Roll Number', 'Branch', 'Registered At', 'Status'];
    const customHeaders = customFields.map(f => f.field_name);
    const allHeaders = [...baseHeaders, ...customHeaders];

    const csv = [
      allHeaders.join(','),
      ...registrations.map(r => {
        const baseRow = [
          `"${r.user_name || ''}"`,
          r.user_email,
          r.roll_number || '',
          r.branch || '',
          new Date(r.registered_at).toLocaleString(),
          r.status
        ];
        const customValues = customFields.map(f => {
          const fieldsData = r.custom_fields_data || {};
          const fieldsDataLower = {};
          for (const key of Object.keys(fieldsData)) {
            fieldsDataLower[String(key).toLowerCase().trim()] = fieldsData[key];
          }
          const valById = fieldsData[f.id];
          const valByName = fieldsData[f.field_name];
          const valByNameLower = fieldsDataLower[String(f.field_name).toLowerCase().trim()];
          
          const val = valById !== undefined ? valById : (valByName !== undefined ? valByName : (valByNameLower || ''));
          return `"${String(val).replace(/"/g, '""')}"`;
        });
        return [...baseRow, ...customValues].join(',');
      })
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="registrations-${announcementId}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Error exporting registrations:', err);
    res.status(500).json({ ok: false, error: 'Failed to export' });
  }
});

// COMPLETE FIXED ANNOUNCEMENT CREATION ROUTE
// Replace your entire app.post('/announcements', ...) route in backend/index.js

app.post('/announcements', upload.single('image'), async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'missing token' });

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
    const email = payload.sub.toLowerCase();

    // Log what we received
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 CREATE ANNOUNCEMENT REQUEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Raw req.body:', JSON.stringify(req.body, null, 2));
    console.log('req.file:', req.file ? req.file.filename : 'No file');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const {
      title: inputTitle,
      content,
      registration_enabled,
      registration_deadline,
      max_registrations,
      custom_fields
    } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content (description) is required' });
    }

    // Auto-generate title from content if missing
    const title = inputTitle || content.substring(0, 80).trim();

    const user = await findUserByEmail(email);
    if (user.role !== 'club_admin' || !user.club_id) {
      return res.status(403).json({ error: 'only club admins can create announcements' });
    }

    // Convert uploaded image to base64 for persistent storage (Render disk is ephemeral)
    let imageUrl = null;
    if (req.file) {
      const mimeType = req.file.mimetype || 'image/jpeg';
      const base64 = req.file.buffer.toString('base64');
      imageUrl = `data:${mimeType};base64,${base64}`;
    }

    // Parse registration_enabled — FormData sends boolean as string 'true' or 'false'
    let regEnabled = 0;

    if (registration_enabled === 'true' ||
      registration_enabled === true ||
      registration_enabled === 1 ||
      registration_enabled === '1') {
      regEnabled = 1;
    }

    // Parse deadline
    let regDeadline = null;
    if (registration_deadline &&
      registration_deadline !== '' &&
      registration_deadline !== 'null' &&
      registration_deadline !== 'undefined') {
      const parsedDate = new Date(registration_deadline);
      if (!isNaN(parsedDate.getTime())) {
        regDeadline = parsedDate;
      } else {
        console.warn('Invalid deadline format received:', registration_deadline);
      }
    }

    // Parse max registrations
    let maxReg = null;
    if (max_registrations &&
      max_registrations !== '' &&
      max_registrations !== 'null' &&
      max_registrations !== 'undefined') {
      maxReg = parseInt(max_registrations);
      if (isNaN(maxReg)) maxReg = null;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ PARSED VALUES:');
    console.log('  regEnabled (parsed):', regEnabled);
    console.log('  regDeadline:', regDeadline);
    console.log('  maxReg:', maxReg);
    console.log('  custom_fields:', custom_fields);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Insert announcement (Postgres syntax)
    const { rows: result } = await pool.query(
      `INSERT INTO announcements 
       (club_id, title, content, image_url, registration_enabled, registration_deadline, max_registrations, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [user.club_id, title, content, imageUrl, regEnabled, regDeadline, maxReg, email]
    );

    const announcementId = result[0].id;

    // Verify it was saved correctly
    const { rows: verify } = await pool.query(
      'SELECT id, registration_enabled, registration_deadline, max_registrations FROM announcements WHERE id = $1',
      [announcementId]
    );

    console.log('✅ SAVED TO DATABASE:');
    console.log('  Announcement ID:', announcementId);
    console.log('  Verification:', verify[0]);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Insert custom registration fields if provided
    if (regEnabled && custom_fields) {
      try {
        const parsedFields = typeof custom_fields === 'string' ? JSON.parse(custom_fields) : custom_fields;
        if (Array.isArray(parsedFields)) {
          for (let i = 0; i < parsedFields.length; i++) {
            const field = parsedFields[i];
            if (field.field_name && field.field_name.trim()) {
              await pool.query(
                `INSERT INTO event_registration_fields (announcement_id, field_name, field_type, is_required, sort_order)
                 VALUES ($1, $2, $3, $4, $5)`,
                [announcementId, field.field_name.trim(), field.field_type || 'text', field.is_required !== false, i]
              );
            }
          }
          console.log(`✅ Inserted ${parsedFields.length} custom registration fields`);
        }
      } catch (fieldErr) {
        console.error('Error inserting custom fields:', fieldErr);
        // Don't fail the whole announcement creation
      }
    }

    // Send EMAIL notification to SUBSCRIBED students only
    if (typeof notifySubscribers === 'function') {
      try {
        notifySubscribers(user.club_id, title, content, announcementId);
      } catch (err) {
        console.error('Error notifying subscribers:', err);
      }
    }

    // Send IN-APP + PUSH notification to ALL students
    try {
      const club = await getClubById(user.club_id);
      const clubName = club ? club.club_name : 'A club';
      
      // Get ALL students with their FCM tokens (not just subscribers)
      const { rows: allStudents } = await pool.query(
        `SELECT id, fcm_token FROM users WHERE id != $1`,
        [user.id]
      );

      console.log(`[Notifications] Sending in-app + push to ${allStudents.length} students for: "${title}"`);

      const pushTitle = `📢 ${clubName}`;
      const pushBody = title;

      for (const student of allStudents) {
        // 1. Save in-app notification
        await addNotification(
          student.id,
          pushTitle,
          pushBody,
          'announcement',
          announcementId
        );

        // 2. Send FCM push if student has a token and Firebase is initialized
        if (admin.apps.length > 0 && student.fcm_token) {
          try {
            await admin.messaging().send({
              token: student.fcm_token,
              notification: {
                title: pushTitle,
                body: pushBody,
              },
              webpush: {
                fcmOptions: { link: '/notifications.html' }
              }
            });
          } catch (pushErr) {
            // Token might be expired/invalid - don't break the loop
            if (pushErr.code === 'messaging/registration-token-not-registered') {
              // Clear invalid token
              await pool.query('UPDATE users SET fcm_token = NULL WHERE id = $1', [student.id]);
            }
          }
        }
      }

      console.log(`[Notifications] ✅ In-app + push notifications sent to all ${allStudents.length} students`);
    } catch (notifErr) {
      console.error('[Notifications] Error sending notifications:', notifErr);
    }

    return res.json({
      ok: true,
      message: 'Announcement created successfully',
      announcement: {
        id: announcementId,
        club_id: user.club_id,
        title,
        content,
        image_url: imageUrl,
        registration_enabled: regEnabled,
        registration_deadline: regDeadline,
        max_registrations: maxReg,
        created_by: email
      }
    });
  } catch (err) {
    console.error('❌ ERROR creating announcement:', err);
    return res.status(500).json({ error: 'server error', detail: err.message });
  }
});
// ADD THIS ROUTE TO backend/index.js (if not already added)

// Get all events the current user is registered for
app.get('/my-registrations', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.userEmail;

    // Get user ID
    const user = await findUserByEmail(userEmail);
    if (!user) {
      return res.json({ ok: true, registrations: [] });
    }

    // Get all active registrations with event details
    const { rows: registrations } = await pool.query(`
      SELECT 
        er.id,
        er.announcement_id,
        er.registered_at,
        er.status,
        a.title,
        a.created_at as event_date,
        a.registration_deadline,
        c.club_name,
        c.club_code
      FROM event_registrations er
      JOIN announcements a ON er.announcement_id = a.id
      JOIN clubs c ON a.club_id = c.id
      WHERE er.user_id = $1 AND (er.status = 'registered' OR er.status = 'waitlisted')
      ORDER BY er.registered_at DESC
    `, [user.id]);

    res.json({
      ok: true,
      registrations
    });
  } catch (err) {
    console.error('Error fetching my registrations:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch registrations' });
  }
});

// ==================== WEBSOCKET SETUP ====================
const WebSocket = require('ws');
let wss;

function initWebSocket(serverInstance) {
  wss = new WebSocket.Server({ server: serverInstance });
  console.log('🔌 WebSocket Server initialized');
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
}

function broadcastWSMessage(clubId, data) {
  if (!wss) return;
  const payload = JSON.stringify({
    type: 'broadcast_event',
    club_id: clubId,
    ...data
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

app.use('/', socialRoutes(pool));
app.use('/broadcast', broadcastRoutes(pool, poolQuery, broadcastWSMessage));

// ==================== START SERVER ====================

const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Ensure the image_url column is TEXT to support long base64 strings
  try {
    await pool.query('ALTER TABLE announcements ALTER COLUMN image_url TYPE TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;');
    await pool.query('ALTER TABLE clubs ADD COLUMN IF NOT EXISTS banner_url TEXT;');
    await pool.query('ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bio TEXT;');

    // Check for stale schema
    const checkLikeCols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'announcement_likes' AND column_name = 'user_email'
    `);

    // If the table exists but doesn't have user_email, it's an old incompatible version
    if (checkLikeCols.rows.length === 0) {
      await pool.query('DROP TABLE IF EXISTS announcement_likes CASCADE;');
      await pool.query('DROP TABLE IF EXISTS announcement_comments CASCADE;');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcement_likes (
          id SERIAL PRIMARY KEY,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
          user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(announcement_id, user_email)
      );
    `);

    // Custom registration fields table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_registration_fields (
        id SERIAL PRIMARY KEY,
        announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE NOT NULL,
        field_name VARCHAR(255) NOT NULL,
        field_type VARCHAR(50) DEFAULT 'text',
        is_required BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add custom_fields_data column to event_registrations
    await pool.query(`
      ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcement_comments (
          id SERIAL PRIMARY KEY,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
          user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ DB Schema verified: tables and columns ready');
  } catch (err) {
    if (err.message.includes('does not exist')) {
      console.warn('⚠️ Could not verify schema: table may not exist yet.');
    } else {
      console.warn('⚠️ Schema verification note:', err.message);
    }
  }
});
initWebSocket(server);