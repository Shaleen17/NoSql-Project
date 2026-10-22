const User = require("../models/User");

exports.getMe = async (req, res) => {
  res.json(req.user);
};

exports.getUsers = async (req, res, next) => {
  try {
    const { search = "" } = req.query;
    const query = {
      _id: { $ne: req.user._id }
    };

    if (search.trim()) {
      const pattern = new RegExp(search.trim(), "i");
      query.$or = [{ name: pattern }, { email: pattern }];
    }

    const users = await User.find(query)
      .select("-password")
      .sort({ isOnline: -1, name: 1 });

    res.json(users);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/users/public-key
 * Body: { publicKey: "<hex string>" }
 * Stores the user's DH public key. Only the public key travels — private keys
 * are never sent to the server.
 */
exports.updatePublicKey = async (req, res, next) => {
  try {
    const { publicKey } = req.body;

    if (typeof publicKey !== "string") {
      return res.status(400).json({ message: "publicKey must be a string" });
    }

    if (!/^[0-9a-f]+$/.test(publicKey)) {
      return res.status(400).json({ message: "publicKey must be a lowercase hex string" });
    }

    if (publicKey.length < 2 || publicKey.length > 512) {
      return res.status(400).json({ message: "publicKey length must be between 2 and 512 hex chars" });
    }

    if (/^0+$/.test(publicKey)) {
      return res.status(400).json({ message: "publicKey must not be all zeros" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { publicKey },
      { new: true }
    ).select("-password");

    res.json(updated);
  } catch (error) {
    next(error);
  }
};
