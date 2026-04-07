export const getId = (value) => (value?._id || value || "").toString();

export const getChatPartner = (chat, currentUserId) => {
  if (!chat || !Array.isArray(chat.participants)) {
    return null;
  }

  return chat.participants.find((participant) => getId(participant) !== getId(currentUserId)) || null;
};

export const getChatTitle = (chat, currentUserId) => {
  if (!chat) {
    return "Select a chat";
  }

  if (chat.isGroupChat) {
    return chat.chatName || "Group chat";
  }

  return getChatPartner(chat, currentUserId)?.name || "Unknown user";
};

export const getUnreadCount = (chat, currentUserId) => {
  if (!chat?.unreadCount) {
    return 0;
  }

  return chat.unreadCount[getId(currentUserId)] || 0;
};

export const formatTime = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};
