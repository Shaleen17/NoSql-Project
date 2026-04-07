const express = require("express");
const { getMessages, markSeen, sendMessage } = require("../controllers/messageController");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.post("/", sendMessage);
router.get("/:chatId", getMessages);
router.put("/seen/:chatId", markSeen);

module.exports = router;
