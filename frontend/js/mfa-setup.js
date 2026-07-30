// ──────────────────────────────────────────────────────
// MFA Setup — 3-Step Flow
// Step 1: Send Email OTP → verify it
// Step 2: Show QR code (scan with authenticator app)
// Step 3: Confirm 6-digit app code → enable MFA
// ──────────────────────────────────────────────────────

lucide.createIcons();

const API_BASE = (function () {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    return 'https://sandip-fas-aiml-backend.vercel.app';
  }
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://sandip-fas-aiml-backend.vercel.app';
  }
  return 'http://localhost:5001';
})();

// ── Auth Guard ──
const token = localStorage.getItem('token');
const userStr = localStorage.getItem('user');
if (!token || !userStr) {
  window.location.href = 'index.html';
}
const user = JSON.parse(userStr);

// ── State ──
let setupSecret = '';
let resendTimer = null;

// ── Helpers ──
function showError(elementId, msg) {
  const el = document.getElementById(elementId);
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  el.style.display = 'none';
}

function setButtonLoading(btn, loadingText) {
  btn.dataset.originalHtml = btn.innerHTML;
  btn.innerHTML = `<span>${loadingText}</span>`;
  btn.disabled = true;
}

function resetButton(btn) {
  btn.innerHTML = btn.dataset.originalHtml;
  btn.disabled = false;
  lucide.createIcons();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

// ── Step Navigation ──
function goToStep(step) {
  document.getElementById('step-1-section').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('step-2-section').style.display = step === 2 ? 'block' : 'none';
  document.getElementById('step-3-section').style.display = step === 3 ? 'block' : 'none';

  for (let i = 1; i <= 3; i++) {
    const circle = document.getElementById(`step${i}-circle`);
    const label = document.getElementById(`step${i}-label`);
    if (i < step) {
      circle.className = 'step-circle done';
      circle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      label.className = 'step-label done';
    } else if (i === step) {
      circle.className = 'step-circle active';
      circle.textContent = i;
      label.className = 'step-label active';
    } else {
      circle.className = 'step-circle pending';
      circle.textContent = i;
      label.className = 'step-label';
    }
  }

  if (step >= 2) document.getElementById('connector1').classList.add('done');
  else document.getElementById('connector1').classList.remove('done');
  if (step >= 3) document.getElementById('connector2').classList.add('done');
  else document.getElementById('connector2').classList.remove('done');

  lucide.createIcons();
}

// ── Resend Timer ──
function startResendTimer(btn, seconds = 60) {
  btn.disabled = true;
  let remaining = seconds;
  btn.textContent = `Resend code in ${remaining}s`;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    remaining--;
    btn.textContent = `Resend code in ${remaining}s`;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      btn.textContent = "Didn't receive it? Resend code";
      btn.disabled = false;
    }
  }, 1000);
}

// ─────────────────────────────────────────────────────
// STEP 1A: Send OTP email
// ─────────────────────────────────────────────────────
async function sendOtp() {
  const btn = document.getElementById('send-otp-btn');
  hideError('send-email-error');
  document.getElementById('send-email-success').style.display = 'none';
  setButtonLoading(btn, 'Sending...');

  try {
    const res = await fetch(`${API_BASE}/api/mfa/send-setup-email`, {
      method: 'POST',
      headers: { 'x-auth-token': token },
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // Show masked email
      document.getElementById('masked-email-text').textContent = data.maskedEmail;
      document.getElementById('email-badge').style.display = 'inline-flex';

      // Show success message and OTP input
      document.getElementById('send-email-success-text').textContent = data.message;
      document.getElementById('send-email-success').style.display = 'flex';
      document.getElementById('otp-input-section').style.display = 'block';

      startResendTimer(document.getElementById('resend-otp-btn'));
    } else {
      showError('send-email-error', data.error || 'Failed to send email. Please try again.');
    }
  } catch (e) {
    showError('send-email-error', 'Network error. Please check your connection.');
  } finally {
    resetButton(btn);
  }
}

// ─────────────────────────────────────────────────────
// STEP 1B: Verify Email OTP → Get QR Code
// ─────────────────────────────────────────────────────
async function verifyEmailOtp() {
  const otp = document.getElementById('emailOtp').value.trim();
  const btn = document.getElementById('verify-otp-btn');
  hideError('otp-error');

  if (!otp || otp.length !== 6) {
    showError('otp-error', 'Please enter the full 6-digit code from your email.');
    return;
  }

  setButtonLoading(btn, 'Verifying...');

  try {
    const res = await fetch(`${API_BASE}/api/mfa/verify-email-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token,
      },
      body: JSON.stringify({ otp }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // Store secret for final step
      setupSecret = data.secret;
      // Show QR code
      document.getElementById('qr-code-img').src = data.qrCodeUrl;
      document.getElementById('secret-key-text').textContent = data.secret;
      // Advance to Step 2
      goToStep(2);
      lucide.createIcons();
    } else {
      showError('otp-error', data.error || 'Invalid code. Please try again.');
    }
  } catch (e) {
    showError('otp-error', 'Network error. Please try again.');
  } finally {
    resetButton(btn);
  }
}

// ─────────────────────────────────────────────────────
// STEP 3: Verify Authenticator Code → Enable MFA
// ─────────────────────────────────────────────────────
async function enableMfa() {
  const authCode = document.getElementById('authCode').value.trim();
  const btn = document.getElementById('enable-mfa-btn');
  hideError('auth-error');
  document.getElementById('auth-success').style.display = 'none';

  if (!authCode || authCode.length !== 6) {
    showError('auth-error', 'Please enter the 6-digit code from your Authenticator app.');
    return;
  }

  setButtonLoading(btn, 'Enabling 2FA...');

  try {
    const res = await fetch(`${API_BASE}/api/mfa/verify-setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token,
      },
      body: JSON.stringify({ token: authCode, secret: setupSecret }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // Update local user data
      user.mfa_enabled = true;
      localStorage.setItem('user', JSON.stringify(user));

      document.getElementById('auth-success').style.display = 'flex';
      btn.disabled = true;

      // Redirect to appropriate dashboard after a moment
      setTimeout(() => {
        if (user.role === 'hod') window.location.href = 'hod-dashboard.html';
        else if (user.role === 'coordinator') window.location.href = 'coordinator-dashboard.html';
        else window.location.href = 'student-dashboard.html';
      }, 2000);
    } else {
      showError('auth-error', data.error || 'Invalid code. Please check your app and try again.');
      resetButton(btn);
    }
  } catch (e) {
    showError('auth-error', 'Network error. Please try again.');
    resetButton(btn);
  }
}

// ── Event Listeners ──
document.getElementById('send-otp-btn').addEventListener('click', sendOtp);
document.getElementById('verify-otp-btn').addEventListener('click', verifyEmailOtp);
document.getElementById('resend-otp-btn').addEventListener('click', sendOtp);
document.getElementById('go-to-step3-btn').addEventListener('click', () => goToStep(3));
document.getElementById('enable-mfa-btn').addEventListener('click', enableMfa);

document.getElementById('logout-link-1').addEventListener('click', logout);

// Copy secret key to clipboard
document.getElementById('copy-secret-btn').addEventListener('click', () => {
  const secret = document.getElementById('secret-key-text').textContent;
  navigator.clipboard.writeText(secret).then(() => {
    const btn = document.getElementById('copy-secret-btn');
    btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px;color:#10b981"></i>';
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = '<i data-lucide="copy" style="width:14px;height:14px;"></i>';
      lucide.createIcons();
    }, 1500);
  });
});

// Allow pressing Enter in OTP field
document.getElementById('emailOtp').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') verifyEmailOtp();
});
document.getElementById('authCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enableMfa();
});

// ── Initialize ──
goToStep(1);
