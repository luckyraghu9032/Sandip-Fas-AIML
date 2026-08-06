require('../config/env');

const nodemailer = require('nodemailer');

// Debug: confirm env vars are loaded (remove after testing)
console.log('  📬 Email config check:');
console.log('     GMAIL_USER     :', process.env.GMAIL_USER || '❌ NOT SET');
console.log('     GMAIL_APP_PASS :', process.env.GMAIL_APP_PASS ? `✅ SET (${process.env.GMAIL_APP_PASS.length} chars)` : '❌ NOT SET');


// Gmail SMTP transporter — free, works for any recipient, no domain needed
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,      // e.g. luckyraghu9032@gmail.com
      pass: process.env.GMAIL_APP_PASS,  // 16-char Gmail App Password
    },
  });
}

/**
 * Send a 6-digit login OTP to the given email address.
 * Uses Gmail SMTP via Nodemailer — free, works for any recipient email.
 * Falls back to console logging if GMAIL_USER / GMAIL_APP_PASS are not configured.
 */
async function sendLoginOtp(toEmail, otp, name) {
  // Always print OTP to console as a fallback/debug reference
  console.log('\n' + '═'.repeat(55));
  console.log('  📧  LOGIN OTP');
  console.log('  Recipient : ' + toEmail);
  console.log('  OTP Code  : ' + otp);
  console.log('  Expires   : 10 minutes');
  console.log('═'.repeat(55) + '\n');

  // If Gmail credentials not configured, just log and return (dev mode)
  if (
    !process.env.GMAIL_USER ||
    !process.env.GMAIL_APP_PASS ||
    process.env.GMAIL_APP_PASS === 'your_gmail_app_password'
  ) {
    console.log('  ⚠️  DEV MODE: GMAIL_USER or GMAIL_APP_PASS not set. OTP is in the console above.\n');
    return;
  }

  try {
    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: `"Sandip University FAS" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: 'Your Login Verification Code - Sandip University FAS',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 2rem; border-radius: 12px;">
          <div style="background: #1e293b; padding: 1.5rem; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="color: #f1f5f9; margin: 0; font-size: 1.2rem;">Sandip University FAS</h2>
            <p style="color: #94a3b8; margin: 4px 0 0; font-size: 0.8rem;">Login Verification</p>
          </div>
          <div style="background: #ffffff; padding: 2rem; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #334155;">Hello <strong>${name || 'Student'}</strong>,</p>
            <p style="color: #475569; line-height: 1.6;">
              A login attempt was made to your FAS Student account.
              Use the code below to complete your sign-in:
            </p>
            <div style="text-align: center; margin: 2rem 0;">
              <div style="display: inline-block; background: #f1f5f9; border: 2px dashed #94a3b8; border-radius: 8px; padding: 1rem 2.5rem;">
                <span style="font-size: 2.5rem; font-weight: 800; letter-spacing: 10px; color: #0f172a; font-family: monospace;">${otp}</span>
              </div>
            </div>
            <p style="color: #64748b; font-size: 0.85rem; text-align: center;">
              ⏰ This code expires in <strong>10 minutes</strong>.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0;">
            <p style="color: #94a3b8; font-size: 0.8rem; text-align: center;">
              If you did not attempt to log in, please contact your administrator immediately.
            </p>
          </div>
        </div>
      `,
    });

    console.log(`  ✅ Login OTP sent via Gmail to ${toEmail} (Message ID: ${info.messageId})\n`);

  } catch (err) {
    // Never crash the server — OTP is still valid from the console above
    console.error('  ❌ Email send failed:', err.message, '\n');
  }
}

module.exports = { sendLoginOtp };
