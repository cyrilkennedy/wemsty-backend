const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const maxPoolSize = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10);
    const minPoolSize = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2', 10);

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection options for better reliability
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      maxPoolSize, // Maintain up to N socket connections
      minPoolSize, // Keep a warm minimum pool
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    
    // Provide helpful error messages for common issues
    if (err.message.includes('querySrv') || err.message.includes('ECONNREFUSED')) {
      console.error('\n🔧 DNS Resolution Issue:');
      console.error('   - Your network may be blocking DNS SRV queries');
      console.error('   - The connection string has been updated to standard format');
      console.error('   - Check your internet connection');
    }
    
    if (err.message.includes('not whitelisted') || err.message.includes("Could not connect to any servers")) {
      console.error('\n🔧 IP Whitelist Issue:');
      console.error('   Your IP address is not whitelisted in MongoDB Atlas!');
      console.error('');
      console.error('   To fix this:');
      console.error('   1. Go to MongoDB Atlas (cloud.mongodb.com)');
      console.error('   2. Select your cluster');
      console.error('   3. Click "Network Access" in the left sidebar');
      console.error('   4. Click "Add IP Address"');
      console.error('   5. Either:');
      console.error('      - Click "Add Current IP Address" to allow your IP');
      console.error('      - Or enter "0.0.0.0/0" to allow all IPs (for development)');
      console.error('   6. Click "Confirm"');
      console.error('');
      console.error('   ⚠️  Note: Changes may take a few moments to take effect.');
    }
    
    if (err.message.includes('Authentication failed')) {
      console.error('\n🔧 Authentication failed - check your MONGODB_URI credentials');
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;

