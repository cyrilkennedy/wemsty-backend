const crypto = require('crypto');
console.log('JWT_SECRET=' + crypto.randomBytes(64).toString('hex'));