require('../config/env');

const RESEND_API_KEY = process.env.RESEND_API_KEY;

/**
 * Send a 6-digit OTP to the given email address for MFA setup verification.
 * Uses Resend API (works reliably on Vercel serverless).
 * Falls back to console logging if RESEND_API_KEY is not configured.
 */
async function sendMfaSetupOtp(toEmail, otp, name) {
  // Always print OTP to console as a fallback/debug reference
  console.log('\n' + '═'.repeat(55));
  console.log('  📧  MFA SETUP OTP');
  console.log('  Recipient : ' + toEmail);
  console.log('  OTP Code  : ' + otp);
  console.log('  Expires   : 10 minutes');
  console.log('═'.repeat(55) + '\n');

  // If no API key configured, just log and return (dev mode)
  if (!RESEND_API_KEY || RESEND_API_KEY === 'your_resend_api_key') {
    console.log('  ⚠️  DEV MODE: RESEND_API_KEY not set. OTP is in the console above.\n');
    return;
  }

  try {
    const { Resend } = require('resend');
    const resend = new Resend(RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: 'Sandip University FAS <onboarding@resend.dev>',
      to: [toEmail],
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
              You requested to set up Two-Factor Authentication (2FA) on your FAS account.
              Use the code below to verify your identity:
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
              If you did not request this, please ignore this email. Your account is safe.
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('  ❌ Resend error:', error.message, '\n');
    } else {
      console.log(`  ✅ Email sent via Resend to ${toEmail} (ID: ${data.id})\n`);
    }

  } catch (err) {
    // Never crash the server — OTP is still valid from the console above
    console.error('  ❌ Email send failed:', err.message, '\n');
  }
}

module.exports = { sendMfaSetupOtp };
