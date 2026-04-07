const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const userRoutes = require("./routes/userRoutes");
const setupSocket = require("./socket/socketHandler");

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === "true";
const vercelPreviewOriginPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const corsOptions = {
  origin(origin, callback) {
    const isAllowedVercelPreview =
      allowVercelPreviews && vercelPreviewOriginPattern.test(origin || "");

    if (!origin || allowedOrigins.includes(origin) || isAllowedVercelPreview) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin: ${origin}. Add it to CLIENT_URL.`));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: corsOptions
});

app.set("io", io);
setupSocket(io);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "real-time-chat-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    message: err.message || "Server error"
  });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
