const express = require("express");
const { createOrGetChat, getMyChats } = require("../controllers/chatController");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.post("/", createOrGetChat);
router.get("/", getMyChats);

module.exports = router;
