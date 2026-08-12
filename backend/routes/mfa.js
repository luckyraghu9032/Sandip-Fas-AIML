const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { sendMfaSetupOtp } = require('../utils/email');
const { ensureAppSchema } = require('../utils/schema');

// ─────────────────────────────────────────────────────
// STEP 1a: Send a 6-digit OTP to the user's email
// ─────────────────────────────────────────────────────
router.post('/send-setup-email', auth, async (req, res) => {
  try {
    // Ensure DB columns exist (safe to call multiple times)
    await ensureAppSchema();

    const userResult = await db.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!user.email) {
      return res.status(400).json({ error: 'No email address is associated with your account. Please contact the administrator.' });
    }

    // Generate a cryptographically random 6-digit OTP
    const otp = String(crypto.randomInt(100000, 1000000));
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Save OTP and expiry in database
    await db.query(
      'UPDATE users SET email_otp = $1, email_otp_expiry = $2 WHERE id = $3',
      [otp, expiry, req.user.id]
    );

    // Send email
    await sendMfaSetupOtp(user.email, otp, user.name);

    // Mask email for response (e.g., s***@sandipuniversity.edu.in)
    const [localPart, domain] = user.email.split('@');
    const maskedEmail = localPart[0] + '***@' + domain;

    res.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${maskedEmail}.`,
      maskedEmail,
    });
  } catch (error) {
    console.error('Send setup email error:', error);
    res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────
// STEP 1b: Verify Email OTP → return QR code secret
// ─────────────────────────────────────────────────────
router.post('/verify-email-otp', auth, async (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ error: 'Verification code is required.' });
  }

  try {
    const userResult = await db.query(
      'SELECT id, name, email, email_otp, email_otp_expiry FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if OTP exists
    if (!user.email_otp) {
      return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
    }

    // Check if OTP has expired
    if (new Date() > new Date(user.email_otp_expiry)) {
      await db.query('UPDATE users SET email_otp = NULL, email_otp_expiry = NULL WHERE id = $1', [req.user.id]);
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    // Check if OTP matches
    if (otp.trim() !== user.email_otp) {
      return res.status(400).json({ error: 'Incorrect verification code. Please try again.' });
    }

    // OTP is valid — clear it from DB so it can't be reused
    await db.query('UPDATE users SET email_otp = NULL, email_otp_expiry = NULL WHERE id = $1', [req.user.id]);

    // Identity verified! Now generate the TOTP secret and QR code
    const secret = speakeasy.generateSecret({
      name: `Sandip FAS (${user.email})`,
      issuer: 'Sandip University',
    });

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) {
        return res.status(500).json({ error: 'Error generating QR code.' });
      }
      res.json({
        success: true,
        secret: secret.base32,
        qrCodeUrl: data_url,
      });
    });
  } catch (error) {
    console.error('Verify email OTP error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────
// STEP 2: Verify Authenticator Code → Enable MFA
// ─────────────────────────────────────────────────────
router.post('/verify-setup', auth, async (req, res) => {
  const { token, secret } = req.body;

  if (!token || !secret) {
    return res.status(400).json({ error: 'Authenticator code and secret are required.' });
  }

  try {
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1, // Allow 30 seconds before/after
    });

    if (verified) {
      // Save secret and enable MFA permanently
      await db.query(
        'UPDATE users SET mfa_secret = $1, mfa_enabled = true WHERE id = $2',
        [secret, req.user.id]
      );
      res.json({ success: true, message: 'Two-Factor Authentication has been enabled successfully!' });
    } else {
      res.status(400).json({ success: false, error: 'Invalid authenticator code. Please try again.' });
    }
  } catch (error) {
    console.error('MFA verify setup error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
