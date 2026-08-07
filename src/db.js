const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.log('ℹ️ MONGODB_URI not set. Running in Local File / Memory Fallback Mode.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    console.log('✅ Connected successfully to MongoDB Cloud Database!');
    return true;
  } catch (err) {
    console.error('⚠️ MongoDB Connection Error:', err.message);
    console.log('⚠️ Falling back to Local File / Memory Storage Mode.');
    isConnected = false;
    return false;
  }
}

function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  isDBConnected
};
