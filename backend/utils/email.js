require('../config/env');

// Check if real email credentials are configured
const isEmailConfigured =
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS &&
  process.env.EMAIL_USER !== 'your_email@gmail.com' &&
  process.env.EMAIL_PASS !== 'your_gmail_app_password';

/**
 * Send a 6-digit OTP to the given email address for MFA setup verification.
 * Falls back to console logging if email credentials are not configured or sending fails.
 * (Triggering restart)
 */
async function sendMfaSetupOtp(toEmail, otp, name) {
  // Always print OTP to console (useful in dev AND as a fallback)
  console.log('\n' + '═'.repeat(55));
  console.log('  📧  MFA SETUP OTP');
  console.log('  Recipient : ' + toEmail);
  console.log('  OTP Code  : ' + otp);
  console.log('  Expires   : 10 minutes');
  console.log('═'.repeat(55) + '\n');

  // Only attempt real email if credentials are configured
  if (!isEmailConfigured) {
    console.log('  ⚠️  DEV MODE: No email credentials configured.');
    console.log('  Set EMAIL_USER and EMAIL_PASS in .env to send real emails.\n');
    return; // Exit early — OTP is in the console above
  }

  // Try to send real email — never crash the server if it fails
  try {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Sandip University FAS" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: 'Your Security Verification Code - Sandip University FAS',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 2rem; border-radius: 12px;">
          <div style="background: #1e293b; padding: 1.5rem; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="color: #f1f5f9; margin: 0; font-size: 1.2rem;">Sandip University FAS</h2>
            <p style="color: #94a3b8; margin: 4px 0 0; font-size: 0.8rem;">Security Verification</p>
          </div>
          <div style="background: #ffffff; padding: 2rem; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #334155;">Hello <strong>${name || 'Student'}</strong>,</p>
            <p style="color: #475569; line-height: 1.6;">
              Your Two-Factor Authentication setup code is:
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
              If you did not request this, please ignore this email.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`  ✅ Email sent successfully to ${toEmail}\n`);

  } catch (emailError) {
    // Email failed — log the error but DO NOT crash the server
    // The OTP was already printed to console above, so the flow continues
    console.error('  ❌ Email send failed (OTP still valid, check console above):', emailError.message, '\n');
  }
}

module.exports = { sendMfaSetupOtp };
