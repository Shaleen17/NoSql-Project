const jwt = require("jsonwebtoken");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");
const {
  createMessageRecord,
  isParticipant,
  normalizeId,
  userFields
} = require("../services/messageService");

const onlineUsers = new Map();

const addOnlineSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId) || new Set();
  sockets.add(socketId);
  onlineUsers.set(userId, sockets);
  return sockets.size === 1;
};

const removeOnlineSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);

  if (!sockets) {
    return false;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }

  return false;
};

const ackError = (ack, error) => {
  if (typeof ack === "function") {
    ack({ ok: false, message: error.message || "Something went wrong" });
  }
};

const setupSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Socket token missing"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return next(new Error("Socket user not found"));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();
    const becameOnline = addOnlineSocket(userId, socket.id);

    socket.join(`user:${userId}`);

    if (becameOnline) {
      const user = await User.findByIdAndUpdate(
        userId,
        { isOnline: true, lastSeen: null },
        { new: true }
      ).select("-password");
      io.emit("user_online", user);
    }

    socket.on("join_chat", async (chatId, ack) => {
      try {
        const chat = await Chat.findById(chatId);

        if (!chat || !isParticipant(chat, userId)) {
          throw new Error("Cannot join this chat");
        }

        socket.join(`chat:${chatId}`);

        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on("leave_chat", (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on("send_message", async (payload, ack) => {
      try {
        const { message, chat } = await createMessageRecord({
          chatId: payload.chatId,
          senderId: userId,
          text: payload.text,
          fileUrl: payload.fileUrl,
          messageType: payload.messageType
        });

        const chatRoom = `chat:${normalizeId(chat._id)}`;
        const userRooms = chat.participants.map((participant) => `user:${normalizeId(participant._id)}`);
        let target = io.to(chatRoom);

        userRooms.forEach((room) => {
          target = target.to(room);
        });

        target.emit("receive_message", message);
        target.emit("chat_updated", chat);

        if (typeof ack === "function") {
          ack({ ok: true, message, chat });
        }
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on("typing", async ({ chatId }) => {
      const chat = await Chat.findById(chatId);

      if (chat && isParticipant(chat, userId)) {
        socket.to(`chat:${chatId}`).emit("typing", {
          chatId,
          userId,
          name: socket.user.name
        });
      }
    });

    socket.on("stop_typing", async ({ chatId }) => {
      const chat = await Chat.findById(chatId);

      if (chat && isParticipant(chat, userId)) {
        socket.to(`chat:${chatId}`).emit("stop_typing", {
          chatId,
          userId
        });
      }
    });

    socket.on("mark_seen", async ({ chatId }, ack) => {
      try {
        const chat = await Chat.findById(chatId);

        if (!chat || !isParticipant(chat, userId)) {
          throw new Error("Cannot mark this chat as seen");
        }

        await Message.updateMany(
          {
            chatId,
            receiver: userId,
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
          { $set: { [`unreadCount.${userId}`]: 0 } },
          { new: true }
        )
          .populate("participants", userFields)
          .populate("lastMessage");

        io.to(`chat:${chatId}`).emit("messages_seen", {
          chatId,
          seenBy: userId
        });
        io.to(`user:${userId}`).emit("chat_updated", updatedChat);

        if (typeof ack === "function") {
          ack({ ok: true, chat: updatedChat });
        }
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on("disconnect", async () => {
      const becameOffline = removeOnlineSocket(userId, socket.id);

      if (becameOffline) {
        const user = await User.findByIdAndUpdate(
          userId,
          {
            isOnline: false,
            lastSeen: new Date()
          },
          { new: true }
        ).select("-password");
        io.emit("user_offline", user);
      }
    });
  });
};

module.exports = setupSocket;
