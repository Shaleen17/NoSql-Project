const Chat = require("../models/Chat");
const User = require("../models/User");
const { userFields } = require("../services/messageService");

const buildDirectKey = (userId, receiverId) =>
  [userId.toString(), receiverId.toString()].sort().join(":");

const populateChat = (query) =>
  query
    .populate("participants", userFields)
    .populate("lastMessage");

exports.createOrGetChat = async (req, res, next) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ message: "receiverId is required" });
    }

    if (receiverId === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot create a chat with yourself" });
    }

    const receiver = await User.findById(receiverId);

    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    const directKey = buildDirectKey(req.user._id, receiverId);

    let chat = await populateChat(Chat.findOne({ directKey }));

    if (!chat) {
      chat = await Chat.create({
        isGroupChat: false,
        participants: [req.user._id, receiverId],
        directKey,
        unreadCount: {
          [req.user._id.toString()]: 0,
          [receiverId]: 0
        }
      });

      chat = await populateChat(Chat.findById(chat._id));
    }

    res.status(201).json(chat);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.directKey) {
      const chat = await populateChat(Chat.findOne({ directKey: buildDirectKey(req.user._id, req.body.receiverId) }));
      return res.status(200).json(chat);
    }

    next(error);
  }
};

exports.getMyChats = async (req, res, next) => {
  try {
    const chats = await populateChat(
      Chat.find({ participants: req.user._id }).sort({ updatedAt: -1 })
    );

    res.json(chats);
  } catch (error) {
    next(error);
  }
};
