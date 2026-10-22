const dns = require("dns");
const mongoose = require("mongoose");

// Use Google's public DNS to resolve MongoDB Atlas SRV records.
// The default system DNS on some networks does not support SRV lookups,
// which causes "querySrv ECONNREFUSED" errors even when Atlas is reachable.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing. Add it to backend/.env.");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
};

module.exports = connectDB;
