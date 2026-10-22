const Chat = require("../models/Chat");
const Message = require("../models/Message");
const {
  createMessageRecord,
  isParticipant,
  normalizeId,
  userFields
} = require("../services/messageService");

exports.getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (!isParticipant(chat, req.user._id)) {
      return res.status(403).json({ message: "You are not a member of this chat" });
    }

    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", userFields)
      .populate("receiver", userFields);

    res.json({
      page,
      limit,
      messages: messages.reverse()
    });
  } catch (error) {
    next(error);
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const { message, chat } = await createMessageRecord({
      chatId: req.body.chatId,
      senderId: req.user._id,
      text: req.body.text,
      fileUrl: req.body.fileUrl,
      messageType: req.body.messageType,
      cipher: req.body.cipher,
      nonce: req.body.nonce,
      isEncrypted: req.body.isEncrypted
    });

    const io = req.app.get("io");

    if (io) {
      const chatRoom = `chat:${normalizeId(chat._id)}`;
      const userRooms = chat.participants.map((participant) => `user:${normalizeId(participant._id)}`);
      let target = io.to(chatRoom);
      userRooms.forEach((room) => {
        target = target.to(room);
      });
      target.emit("receive_message", message);
      target.emit("chat_updated", chat);
    }

    res.status(201).json({ message, chat });
  } catch (error) {
    next(error);
  }
};

exports.markSeen = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (!isParticipant(chat, req.user._id)) {
      return res.status(403).json({ message: "You are not a member of this chat" });
    }

    await Message.updateMany(
      {
        chatId,
        receiver: req.user._id,
        status: { $ne: "seen" }
      },
      {
        $set: {
          status: "seen",
          seenAt: new Date()
        }
      }
    );

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $set: { [`unreadCount.${req.user._id.toString()}`]: 0 } },
      { new: true }
    )
      .populate("participants", userFields)
      .populate("lastMessage");

    const io = req.app.get("io");

    if (io) {
      io.to(`chat:${chatId}`).emit("messages_seen", {
        chatId,
        seenBy: req.user._id.toString()
      });
      io.to(`user:${req.user._id.toString()}`).emit("chat_updated", updatedChat);
    }

    res.json({ message: "Messages marked as seen", chat: updatedChat });
  } catch (error) {
    next(error);
  }
};
