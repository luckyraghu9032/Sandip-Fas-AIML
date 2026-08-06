const express = require('express');
const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { ensureAppSchema } = require('../utils/schema');
const { normalizeDateOfBirth, normalizeEmail, normalizeRole, normalizeText } = require('../utils/normalizers');
const { sendLoginOtp } = require('../utils/email');
require('../config/env');

// Login endpoint
router.post('/login', async (req, res) => {
  const role = normalizeRole(req.body.role);
  const email = normalizeEmail(req.body.email);
  const prnNumber = normalizeText(req.body.prnNumber);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  console.log(`Login attempt for role: "${role}"`);

  try {
    await ensureAppSchema();

    if (!role || !['hod', 'coordinator', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Please choose a valid portal before signing in.' });
    }

    if (role === 'student') {
      if (!prnNumber && !email) {
        return res.status(400).json({ error: 'PRN number is required for the student portal.' });
      }
    } else if (!email) {
      return res.status(400).json({ error: 'Email is required for this portal.' });
    }

    if (!password) {
      return res.status(400).json({
        error: role === 'student'
          ? 'Date of birth password is required.'
          : 'Password is required.',
      });
    }

    const result = role === 'student'
      ? await db.query(
        'SELECT * FROM users WHERE prn_number = $1 AND role = $2',
        [prnNumber || email, role]
      )
      : await db.query(
        'SELECT * FROM users WHERE email = $1 AND role = $2',
        [email, role]
      );

    const user = result.rows[0];

    if (!user) {
      console.log(`User not found for role: ${role}`);
      return res.status(401).json({ error: 'Invalid credentials for the selected portal.' });
    }

    console.log(`User found in DB: ${user.email}, Role: ${user.role}`);

    const passwordCandidates = role === 'hod'
      ? [password]
      : role === 'coordinator'
        ? Array.from(new Set([password, normalizeDateOfBirth(password)]))
        : [normalizeDateOfBirth(password)];

    let isMatch = false;
    for (const candidatePassword of passwordCandidates) {
      // Coordinators may be created manually with PRN-based passwords, while older
      // records still use DOB-based passwords.
      if (candidatePassword && await bcrypt.compare(candidatePassword, user.password)) {
        isMatch = true;
        break;
      }
    }
    console.log(`Password match result for ${user.email}: ${isMatch}`);

    if (!isMatch) {
      console.log(`Password mismatch for: ${user.email}`);
      return res.status(401).json({ error: 'Invalid credentials for the selected portal.' });
    }

    console.log(`Login successful for: ${user.email}`);

    // For students: always send email OTP before granting access
    if (user.role === 'student') {
      if (!user.email) {
        return res.status(400).json({ error: 'No email address on your account. Please contact the administrator.' });
      }

      // Generate 6-digit OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Save OTP to DB
      await db.query(
        'UPDATE users SET email_otp = $1, email_otp_expiry = $2 WHERE id = $3',
        [otp, expiry, user.id]
      );

      // Send OTP email (non-blocking — OTP still in console if email fails)
      await sendLoginOtp(user.email, otp, user.name);

      // Issue a short-lived temp token
      const tempToken = jwt.sign(
        { id: user.id, emailOtpTemp: true },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      // Mask email for display (e.g. r***@gmail.com)
      const [localPart, domain] = user.email.split('@');
      const maskedEmail = localPart[0] + '***@' + domain;

      return res.json({ requireEmailOtp: true, tempToken, maskedEmail });
    }

    // HOD / Coordinator: direct JWT (no OTP)
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, division: user.division },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        division: user.division,
        department: user.department || '',
        prnNumber: user.prn_number || null,
        mfa_enabled: user.mfa_enabled || false,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify Email OTP during student login
router.post('/login/verify-email-otp', async (req, res) => {
  const { tempToken, otp } = req.body;

  if (!tempToken || !otp) {
    return res.status(400).json({ error: 'Temporary token and OTP are required.' });
  }

  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (!decoded.emailOtpTemp) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    const result = await db.query(
      'SELECT id, name, email, role, division, department, prn_number, mfa_enabled, email_otp, email_otp_expiry FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!user.email_otp) {
      return res.status(400).json({ error: 'No verification code found. Please log in again.' });
    }

    if (new Date() > new Date(user.email_otp_expiry)) {
      await db.query('UPDATE users SET email_otp = NULL, email_otp_expiry = NULL WHERE id = $1', [user.id]);
      return res.status(400).json({ error: 'Verification code has expired. Please log in again.' });
    }

    if (otp.trim() !== user.email_otp) {
      return res.status(400).json({ error: 'Incorrect verification code. Please try again.' });
    }

    // OTP correct — clear it and issue full JWT
    await db.query('UPDATE users SET email_otp = NULL, email_otp_expiry = NULL WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, division: user.division },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        division: user.division,
        department: user.department || '',
        prnNumber: user.prn_number || null,
        mfa_enabled: user.mfa_enabled || false,
      },
    });

  } catch (error) {
    console.error('Email OTP verify error during login:', error);
    res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
});

// Change Password endpoint
router.post('/change-password', auth, async (req, res) => {
  console.log('Change password request received');
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    await ensureAppSchema();

    if (req.user.role !== 'hod') {
      return res.status(403).json({ error: 'Coordinator and student passwords are managed from the HOD roster workflow.' });
    }

    // Get user from database
    const result = await db.query('SELECT password FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in database
    await db.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, userId]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
