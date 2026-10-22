const express = require("express");
const { getMe, getUsers, updatePublicKey } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/me", getMe);
router.get("/", getUsers);
router.put("/public-key", updatePublicKey);

module.exports = router;
