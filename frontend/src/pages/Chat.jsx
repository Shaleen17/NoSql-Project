import { useCallback, useEffect, useMemo, useState } from "react";
import ChatList from "../components/ChatList.jsx";
import MessageInput from "../components/MessageInput.jsx";
import MessageList from "../components/MessageList.jsx";
import Navbar from "../components/Navbar.jsx";
import OnlineStatus from "../components/OnlineStatus.jsx";
import UserList from "../components/UserList.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import api from "../services/api.js";
import { getChatPartner, getChatTitle, getId } from "../services/chatHelpers.js";

const Chat = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);

  const currentUserId = user?._id;
  const selectedChatId = selectedChat?._id;

  const selectedPartner = useMemo(
    () => getChatPartner(selectedChat, currentUserId),
    [currentUserId, selectedChat]
  );

  const upsertChat = useCallback((updatedChat) => {
    setChats((currentChats) => {
      const exists = currentChats.some((chat) => getId(chat._id) === getId(updatedChat._id));
      const nextChats = exists
        ? currentChats.map((chat) => (getId(chat._id) === getId(updatedChat._id) ? updatedChat : chat))
        : [updatedChat, ...currentChats];

      return nextChats.sort(
        (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
    });

    setSelectedChat((current) =>
      current && getId(current._id) === getId(updatedChat._id) ? updatedChat : current
    );
  }, []);

  const fetchUsers = useCallback(async (searchText = "") => {
    const { data } = await api.get("/users", {
      params: searchText ? { search: searchText } : {}
    });
    setUsers(data);
  }, []);

  const fetchChats = useCallback(async () => {
    const { data } = await api.get("/chats");
    setChats(data);
  }, []);

  useEffect(() => {
    fetchUsers().catch(() => setError("Could not load users"));
    fetchChats().catch(() => setError("Could not load chats"));
  }, [fetchChats, fetchUsers]);

  useEffect(() => {
    const searchTimeout = window.setTimeout(() => {
      fetchUsers(search).catch(() => setError("Could not search users"));
    }, 300);

    return () => window.clearTimeout(searchTimeout);
  }, [fetchUsers, search]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleMessage = (message) => {
      const messageChatId = getId(message.chatId);

      if (getId(selectedChatId) === messageChatId) {
        setMessages((currentMessages) => {
          if (currentMessages.some((currentMessage) => getId(currentMessage._id) === getId(message._id))) {
            return currentMessages;
          }

          return [...currentMessages, message];
        });

        if (getId(message.sender) !== getId(currentUserId)) {
          socket.emit("mark_seen", { chatId: messageChatId });
        }
      }

      fetchChats().catch(() => setError("Could not refresh chats"));
    };

    const handleChatUpdated = (chat) => {
      upsertChat(chat);
    };

    const handleUserPresence = (updatedUser) => {
      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          getId(currentUser._id) === getId(updatedUser._id) ? updatedUser : currentUser
        )
      );
      setSelectedChat((currentChat) => {
        if (!currentChat) {
          return currentChat;
        }

        return {
          ...currentChat,
          participants: currentChat.participants.map((participant) =>
            getId(participant._id) === getId(updatedUser._id) ? updatedUser : participant
          )
        };
      });
      fetchChats().catch(() => setError("Could not refresh chats"));
    };

    const handleTyping = ({ chatId, userId, name }) => {
      if (getId(chatId) === getId(selectedChatId) && getId(userId) !== getId(currentUserId)) {
        setTypingUser(name);
      }
    };

    const handleStopTyping = ({ chatId, userId }) => {
      if (getId(chatId) === getId(selectedChatId) && getId(userId) !== getId(currentUserId)) {
        setTypingUser("");
      }
    };

    const handleMessagesSeen = ({ chatId, seenBy }) => {
      if (getId(chatId) === getId(selectedChatId)) {
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            getId(message.receiver) === getId(seenBy)
              ? { ...message, status: "seen" }
              : message
          )
        );
      }
      fetchChats().catch(() => setError("Could not refresh chats"));
    };

    socket.on("receive_message", handleMessage);
    socket.on("chat_updated", handleChatUpdated);
    socket.on("user_online", handleUserPresence);
    socket.on("user_offline", handleUserPresence);
    socket.on("typing", handleTyping);
    socket.on("stop_typing", handleStopTyping);
    socket.on("messages_seen", handleMessagesSeen);

    return () => {
      socket.off("receive_message", handleMessage);
      socket.off("chat_updated", handleChatUpdated);
      socket.off("user_online", handleUserPresence);
      socket.off("user_offline", handleUserPresence);
      socket.off("typing", handleTyping);
      socket.off("stop_typing", handleStopTyping);
      socket.off("messages_seen", handleMessagesSeen);
    };
  }, [currentUserId, fetchChats, selectedChatId, socket, upsertChat]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return undefined;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setLoadingMessages(true);
      setTypingUser("");

      try {
        const { data } = await api.get(`/messages/${selectedChatId}`, {
          params: { page: 1, limit: 30 }
        });

        if (!cancelled) {
          setMessages(data.messages);
        }

        socket?.emit("join_chat", selectedChatId);

        if (socket?.connected) {
          socket.emit("mark_seen", { chatId: selectedChatId });
        } else {
          await api.put(`/messages/seen/${selectedChatId}`);
        }

        fetchChats().catch(() => setError("Could not refresh chats"));
      } catch (_requestError) {
        if (!cancelled) {
          setError("Could not load messages");
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
      socket?.emit("leave_chat", selectedChatId);
    };
  }, [fetchChats, selectedChatId, socket]);

  const handleSelectUser = async (selectedUser) => {
    setError("");

    try {
      const { data } = await api.post("/chats", {
        receiverId: selectedUser._id
      });
      upsertChat(data);
      setSelectedChat(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not open chat");
    }
  };

  const handleSend = async (text) => {
    if (!selectedChatId) {
      return;
    }

    setError("");

    if (socket?.connected) {
      socket.emit("send_message", { chatId: selectedChatId, text }, (response) => {
        if (!response?.ok) {
          setError(response?.message || "Could not send message");
        }
      });
      return;
    }

    try {
      const { data } = await api.post("/messages", {
        chatId: selectedChatId,
        text
      });
      upsertChat(data.chat);
      setMessages((currentMessages) => [...currentMessages, data.message]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not send message");
    }
  };

  const emitTyping = () => {
    if (socket && selectedChatId) {
      socket.emit("typing", { chatId: selectedChatId });
    }
  };

  const emitStopTyping = () => {
    if (socket && selectedChatId) {
      socket.emit("stop_typing", { chatId: selectedChatId });
    }
  };

  return (
    <main className="chat-page">
      <Navbar />
      {error ? <div className="error app-error">{error}</div> : null}
      <div className="chat-shell">
        <aside className="sidebar">
          <ChatList
            chats={chats}
            currentUserId={currentUserId}
            selectedChatId={selectedChatId}
            onSelectChat={setSelectedChat}
          />
          <UserList
            users={users}
            onSelectUser={handleSelectUser}
            search={search}
            onSearch={setSearch}
          />
        </aside>
        <section className="conversation">
          <header className="conversation-header">
            <div>
              <h2>{getChatTitle(selectedChat, currentUserId)}</h2>
              {selectedPartner ? (
                <OnlineStatus isOnline={selectedPartner.isOnline} lastSeen={selectedPartner.lastSeen} />
              ) : (
                <p>Select a user or chat to start messaging.</p>
              )}
            </div>
          </header>
          <MessageList
            messages={messages}
            currentUserId={currentUserId}
            typingUser={typingUser}
            loading={loadingMessages}
          />
          <MessageInput
            disabled={!selectedChatId}
            onSend={handleSend}
            onTypingStart={emitTyping}
            onTypingStop={emitStopTyping}
          />
        </section>
      </div>
    </main>
  );
};

export default Chat;
