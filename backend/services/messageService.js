const Chat = require("../models/Chat");
const Message = require("../models/Message");

const userFields = "name email profilePic isOnline lastSeen publicKey";

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

const createMessageRecord = async ({
  chatId,
  senderId,
  text,
  fileUrl = null,
  messageType = "text",
  cipher = "none",
  nonce = null,
  isEncrypted = false
}) => {
  // Validate encryption-related fields
  const allowedCiphers = ["none", "caesar", "vernam"];
  if (!allowedCiphers.includes(cipher)) {
    const error = new Error("Invalid cipher value");
    error.statusCode = 400;
    throw error;
  }

  if (isEncrypted && cipher === "none") {
    const error = new Error("isEncrypted requires cipher to be 'caesar' or 'vernam'");
    error.statusCode = 400;
    throw error;
  }

  if (cipher === "vernam") {
    if (!nonce || !/^[0-9a-f]{24}$/.test(nonce)) {
      const error = new Error("Vernam cipher requires a valid 24-char hex nonce");
      error.statusCode = 400;
      throw error;
    }
  }

  // For plaintext messages, trim and check for empty
  // For encrypted messages, do NOT trim (Caesar ciphertext can start/end with a space)
  let storeText;
  if (isEncrypted) {
    storeText = typeof text === "string" ? text : "";
  } else {
    storeText = typeof text === "string" ? text.trim() : "";
  }

  // Enforce max text length
  if (storeText.length > 10000) {
    const error = new Error("Message text exceeds maximum allowed length");
    error.statusCode = 400;
    throw error;
  }

  if (messageType === "text" && !storeText) {
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
    text: storeText,
    fileUrl,
    status: "sent",
    cipher,
    nonce,
    isEncrypted
  });

  const recipientIds = getRecipientIds(chat, senderId);
  const unreadIncrements = recipientIds.reduce((updates, recipientId) => {
    updates[`unreadCount.${recipientId}`] = 1;
    return updates;
  }, {});

  // Never store plaintext or ciphertext in lastMessageText for encrypted messages
  const lastMessageText = isEncrypted
    ? "🔒 Encrypted message"
    : storeText || (messageType === "image" ? "Image" : "File");

  const update = {
    $set: {
      lastMessage: message._id,
      lastMessageText,
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
