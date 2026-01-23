// routes/post.routes.js
const express = require('express');
const router = express.Router();

router.get('/test', (req, res) => res.json({ message: 'Post routes working' }));

module.exports = router;