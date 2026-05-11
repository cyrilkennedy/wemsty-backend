/**
 * scripts/algolia-sync.js
 * Manual script to initialize Algolia indexes and sync database data.
 * 
 * Usage: node scripts/algolia-sync.js [--force]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/mongodb');
const algoliaService = require('../services/algolia.service');

// Import Models
const User = require('../models/User.model');
const Post = require('../models/Post.model');
const Circle = require('../models/Circle.model');

async function sync() {
  console.log('🚀 Starting Algolia Full Sync...');

  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Configure Indexes (Creates them if they don't exist)
    console.log('⚙️  Configuring Algolia indexes...');
    await algoliaService.configureIndexes();

    // 3. Sync Users
    console.log('👥 Syncing Users...');
    const users = await User.find({});
    console.log(`   Found ${users.length} users to sync.`);
    
    for (let i = 0; i < users.length; i++) {
      await algoliaService.saveUser(users[i]);
      if ((i + 1) % 10 === 0) console.log(`   Progress: ${i + 1}/${users.length} users`);
    }
    console.log('✅ Users synced.');

    // 4. Sync Circles
    console.log('⭕ Syncing Circles...');
    const circles = await Circle.find({});
    console.log(`   Found ${circles.length} circles to sync.`);
    
    for (let i = 0; i < circles.length; i++) {
      await algoliaService.saveCircle(circles[i]);
      if ((i + 1) % 10 === 0) console.log(`   Progress: ${i + 1}/${circles.length} circles`);
    }
    console.log('✅ Circles synced.');

    // 5. Sync Posts
    console.log('📝 Syncing Posts...');
    // We only sync public posts as per algoliaService.savePost logic
    const posts = await Post.find({ visibility: 'public', status: 'active' });
    console.log(`   Found ${posts.length} public/active posts to sync.`);
    
    for (let i = 0; i < posts.length; i++) {
      await algoliaService.savePost(posts[i]);
      if ((i + 1) % 50 === 0) console.log(`   Progress: ${i + 1}/${posts.length} posts`);
    }
    console.log('✅ Posts synced.');

    console.log('\n✨ Algolia sync completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    process.exit(1);
  }
}

sync();
