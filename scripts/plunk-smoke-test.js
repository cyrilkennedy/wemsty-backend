require('dotenv').config();
const Plunk = require('@plunk/node').default;

async function main() {
  const to = process.argv[2] || process.env.SMTP_TEST_TO;
  const apiKey = process.env.PLUNK_API_KEY;

  if (!apiKey) {
    console.error('Error: PLUNK_API_KEY is not defined in .env');
    process.exit(1);
  }

  if (!to) {
    console.error('Error: Provide a recipient: node scripts/plunk-smoke-test.js you@example.com');
    process.exit(1);
  }

  console.log(`🚀 Sending test email to ${to} via Plunk...`);

  const plunk = new Plunk(apiKey);

  try {
    const success = await plunk.emails.send({
      to,
      subject: 'Wemsty Plunk API Smoke Test',
      body: `
        <h1>Plunk is working!</h1>
        <p>This is a smoke test from the Wemsty Backend.</p>
        <p>Time: ${new Date().toISOString()}</p>
      `,
    });

    if (success) {
      console.log('✅ Plunk smoke test sent successfully!');
      console.log('Response:', success);
    } else {
      console.error('❌ Plunk failed to send the email.');
    }
  } catch (error) {
    console.error('❌ Plunk API error:', error.message);
    process.exit(1);
  }
}

function validatePlunkConfig(env = process.env, to = env.SMTP_TEST_TO) {
  if (!to) {
    throw new Error('Provide a recipient: node scripts/plunk-smoke-test.js you@example.com');
  }

  if (!env.PLUNK_API_KEY) {
    throw new Error('Missing PLUNK_API_KEY config');
  }

  return { to };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  validatePlunkConfig
};
