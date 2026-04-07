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
