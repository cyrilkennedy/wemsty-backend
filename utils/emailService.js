// utils/emailService.js

const nodemailer = require('nodemailer');

// ════════════════════════════════════════════════
// EMAIL TRANSPORTER CONFIGURATION
// ════════════════════════════════════════════════

const createTransporter = () => {
  // For development: Use Ethereal (fake SMTP)
  if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
    console.log('⚠️  No SMTP configured. Using console logging for emails.');
    return null;
  }

  // For production: Use real SMTP (Gmail, SendGrid, etc.)
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// ════════════════════════════════════════════════
// EMAIL TEMPLATES
// ════════════════════════════════════════════════

const getOTPEmailTemplate = (otp, purpose) => {
  const purposeText = {
    'password_reset': 'Password Reset',
    'email_verification': 'Email Verification',
    'login_verification': 'Login Verification'
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .otp-box { background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #777; font-size: 12px; }
        .button { background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Wemsty Security</h1>
          <p>${purposeText[purpose] || 'Verification'}</p>
        </div>
        <div class="content">
          <h2>Hello!</h2>
          <p>We received a request to verify your identity for <strong>${purposeText[purpose]}</strong>.</p>
          
          <div class="otp-box">
            <p style="margin: 0; font-size: 14px; color: #666;">Your verification code is:</p>
            <div class="otp-code">${otp}</div>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">Valid for 10 minutes</p>
          </div>

          <p>Enter this code in the verification page to continue.</p>

          <div class="warning">
            <strong>⚠️ Security Notice:</strong><br>
            • Never share this code with anyone<br>
            • Wemsty will never ask for this code via phone or email<br>
            • If you didn't request this, please ignore this email and secure your account
          </div>

          <p>This code will expire in <strong>10 minutes</strong>.</p>
        </div>
        <div class="footer">
          <p>This email was sent from Wemsty. If you didn't request this, please ignore it.</p>
          <p>&copy; ${new Date().getFullYear()} Wemsty. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const getPasswordResetSuccessTemplate = () => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-icon { font-size: 60px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #777; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Password Reset Successful</h1>
        </div>
        <div class="content">
          <div class="success-icon">🎉</div>
          <h2>Your password has been reset successfully!</h2>
          <p>You can now log in to your Wemsty account using your new password.</p>
          
          <p><strong>Security Tips:</strong></p>
          <ul>
            <li>Use a strong, unique password</li>
            <li>Enable two-factor authentication</li>
            <li>Never share your password with anyone</li>
            <li>Update your password regularly</li>
          </ul>

          <p>If you didn't make this change, please contact our support team immediately.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Wemsty. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ════════════════════════════════════════════════
// SEND EMAIL FUNCTIONS
// ════════════════════════════════════════════════

exports.sendOTPEmail = async (email, otp, purpose) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Wemsty Security" <${process.env.SMTP_FROM || 'noreply@wemsty.com'}>`,
    to: email,
    subject: `Your Wemsty Verification Code: ${otp}`,
    html: getOTPEmailTemplate(otp, purpose)
  };

  try {
    if (!transporter) {
      // Development mode - log to console
      console.log('\n📧 ===== EMAIL (Development Mode) =====');
      console.log(`To: ${email}`);
      console.log(`Subject: ${mailOptions.subject}`);
      console.log(`OTP Code: ${otp}`);
      console.log(`Purpose: ${purpose}`);
      console.log('======================================\n');
      return { success: true, messageId: 'dev-mode' };
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { success: false, error: error.message };
  }
};

exports.sendPasswordResetSuccessEmail = async (email) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Wemsty Security" <${process.env.SMTP_FROM || 'noreply@wemsty.com'}>`,
    to: email,
    subject: 'Password Reset Successful - Wemsty',
    html: getPasswordResetSuccessTemplate()
  };

  try {
    if (!transporter) {
      console.log('\n📧 Password reset success email (Dev Mode) sent to:', email);
      return { success: true, messageId: 'dev-mode' };
    }

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { success: false, error: error.message };
  }
};