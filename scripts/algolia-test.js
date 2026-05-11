/**
 * scripts/algolia-test.js
 */

require('dotenv').config();
const { algoliasearch } = require('algoliasearch');

async function test() {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_ADMIN_KEY;
  
  console.log(`Testing Algolia with App ID: ${appId}`);
  
  try {
    const client = algoliasearch(appId, apiKey);
    const indices = await client.listIndices();
    console.log('✅ Success! Indices found:', indices);
  } catch (error) {
    console.error('❌ Algolia connection failed:', error.message);
  }
}

test();
