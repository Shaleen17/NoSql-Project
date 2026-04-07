const Chat = require("../models/Chat");
const Message = require("../models/Message");

const userFields = "name email profilePic isOnline lastSeen";

const normalizeId = (value) => value.toString();

const isParticipant = (chat, userId) =>
  chat.participants.some((participant) => normalizeId(participant._id || participant) === normalizeId(userId));

const getReceiverId = (chat, senderId) => {
  if (chat.isGroupChat) {
    return null;
  }

  const receiver = chat.participants.find(
    (participant) => normalizeId(participant._id || participant) !== normalizeId(senderId)
  );

  return receiver ? receiver._id || receiver : null;
};

const getRecipientIds = (chat, senderId) =>
  chat.participants
    .map((participant) => normalizeId(participant._id || participant))
    .filter((participantId) => participantId !== normalizeId(senderId));

const populateMessage = (query) =>
  query
    .populate("sender", userFields)
    .populate("receiver", userFields);

const createMessageRecord = async ({ chatId, senderId, text, fileUrl = null, messageType = "text" }) => {
  const trimmedText = typeof text === "string" ? text.trim() : "";

  if (messageType === "text" && !trimmedText) {
    const error = new Error("Message text cannot be empty");
    error.statusCode = 400;
    throw error;
  }

  const chat = await Chat.findById(chatId).populate("participants", userFields);

  if (!chat) {
    const error = new Error("Chat not found");
    error.statusCode = 404;
    throw error;
  }

  if (!isParticipant(chat, senderId)) {
    const error = new Error("You are not a member of this chat");
    error.statusCode = 403;
    throw error;
  }

  const receiverId = getReceiverId(chat, senderId);

  const message = await Message.create({
    chatId,
    sender: senderId,
    receiver: receiverId,
    messageType,
    text: trimmedText,
    fileUrl,
    status: "sent"
  });

  const recipientIds = getRecipientIds(chat, senderId);
  const unreadIncrements = recipientIds.reduce((updates, recipientId) => {
    updates[`unreadCount.${recipientId}`] = 1;
    return updates;
  }, {});

  const update = {
    $set: {
      lastMessage: message._id,
      lastMessageText: trimmedText || (messageType === "image" ? "Image" : "File"),
      lastMessageTime: message.createdAt,
      updatedAt: message.createdAt
    }
  };

  if (Object.keys(unreadIncrements).length > 0) {
    update.$inc = unreadIncrements;
  }

  const updatedChat = await Chat.findByIdAndUpdate(chatId, update, { new: true })
    .populate("participants", userFields)
    .populate("lastMessage");

  const populatedMessage = await populateMessage(Message.findById(message._id));

  return { message: populatedMessage, chat: updatedChat };
};

module.exports = {
  createMessageRecord,
  getRecipientIds,
  isParticipant,
  normalizeId,
  userFields
};
