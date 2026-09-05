/**
 * Devka Beach Resort — Brevo (Sendinblue) Email Service
 * 
 * Provides transactional email dispatch for vendor onboarding email authentication.
 * 
 * API Key: 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
 * Verified Sender: Devka beach Resort <devkabeachresortsmit@gmail.com>
 */

const BREVO_CONFIG = {
  apiKey: "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",
  endpoint: "https://api.brevo.com/v3/smtp/email",
  sender: {
    name: "Devka Beach Resort",
    email: "devkabeachresortsmit@gmail.com"
  }
};

/**
 * Generate a secure 6-digit numeric OTP
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Build professional branded HTML email content
 */
function buildVerificationEmailHtml(recipientName, otpCode) {
  const safeName = recipientName ? recipientName : "Valued Partner";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F5EE; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #17222E;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #F8F5EE; padding: 30px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; border: 1px solid #E3DCC9; overflow: hidden; box-shadow: 0 10px 30px rgba(11, 31, 58, 0.08);">
          <!-- Header Banner -->
          <tr>
            <td align="center" style="background-color: #0B1F3A; padding: 32px 20px;">
              <div style="font-size: 11px; letter-spacing: 2px; color: #C6A15B; font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">
                Devka Beach Resort &middot; Daman
              </div>
              <h1 style="color: #F8F5EE; font-size: 22px; font-weight: 600; margin: 0; font-family: Georgia, serif;">
                Vendor Email Verification
              </h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <p style="font-size: 15px; line-height: 1.6; color: #17222E; margin-top: 0;">
                Dear <strong>${safeName}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #5B6B7C; margin-bottom: 24px;">
                You are completing your official vendor registration for <strong>Devka Beach Resort</strong>. Please use the following single-use verification code in the Declaration section to authenticate your contact email address:
              </p>
              
              <!-- OTP Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="background-color: #F8F5EE; border: 2px dashed #C6A15B; border-radius: 8px; padding: 18px 24px; display: inline-block; text-align: center;">
                      <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #9c814a; text-transform: uppercase; display: block; margin-bottom: 6px;">Your 6-Digit Verification Code</span>
                      <span style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #0B1F3A; font-family: monospace; display: block; padding-left: 10px;">${otpCode}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #5B6B7C; line-height: 1.5; margin-bottom: 8px;">
                &#9201; <strong>Validity:</strong> This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
              </p>
              <p style="font-size: 13px; color: #5B6B7C; line-height: 1.5; margin-bottom: 0;">
                If you did not request this registration, you can safely disregard this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F8F5EE; border-top: 1px solid #E3DCC9; padding: 20px 32px; text-align: center;">
              <p style="font-size: 12px; color: #5B6B7C; margin: 0; line-height: 1.5;">
                Devka Beach Resort, Nani Daman, Daman &amp; Diu 396210<br>
                Official Procurement &amp; Vendor Management System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send an OTP verification email using Brevo REST API
 * @param {string} toEmail - Recipient email address
 * @param {string} toName - Recipient name
 * @param {string} otpCode - 6-digit verification code
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendVerificationEmail(toEmail, toName, otpCode) {
  if (!toEmail || !toEmail.includes("@")) {
    throw new Error("Invalid recipient email address");
  }
  if (!otpCode) {
    throw new Error("OTP code is required");
  }

  const payload = {
    sender: BREVO_CONFIG.sender,
    to: [
      {
        email: toEmail.trim(),
        name: (toName && toName.trim()) ? toName.trim() : "Vendor Partner"
      }
    ],
    subject: `Email Verification Code [${otpCode}] — Devka Beach Resort`,
    htmlContent: buildVerificationEmailHtml(toName, otpCode)
  };

  const response = await fetch(BREVO_CONFIG.endpoint, {
    method: "POST",
    headers: {
      "api-key": BREVO_CONFIG.apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `Brevo API returned status ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      msg = errJson.message || msg;
    } catch (_) {
      msg = errText || msg;
    }
    throw new Error(msg);
  }

  const result = await response.json();
  return {
    success: true,
    messageId: result.messageId
  };
}

// CommonJS export for Node scripts + global export for browser environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BREVO_CONFIG,
    generateOtp,
    buildVerificationEmailHtml,
    sendVerificationEmail
  };
}

if (typeof window !== "undefined") {
  window.BrevoService = {
    BREVO_CONFIG,
    generateOtp,
    buildVerificationEmailHtml,
    sendVerificationEmail
  };
}
