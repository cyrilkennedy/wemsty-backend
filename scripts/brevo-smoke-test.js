require('dotenv').config();

const nodemailer = require('nodemailer');

function validateBrevoConfig(env = process.env, to = env.SMTP_TEST_TO) {
  if (!to) {
    throw new Error('Provide a recipient: npm run email:smoke -- you@example.com');
  }

  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing SMTP config: ${missing.join(', ')}`);
  }

  return { to };
}

async function main() {
  const to = process.argv[2] || process.env.SMTP_TEST_TO;
  validateBrevoConfig(process.env, to);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"Wemsty Security" <${process.env.SMTP_FROM}>`,
    to,
    subject: 'Wemsty Brevo SMTP smoke test',
    text: 'Brevo SMTP is configured correctly for Wemsty.',
    html: '<p>Brevo SMTP is configured correctly for <strong>Wemsty</strong>.</p>'
  });

  console.log(`Brevo SMTP smoke test sent: ${info.messageId}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  validateBrevoConfig
};
