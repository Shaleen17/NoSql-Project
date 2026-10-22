import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatList from "../components/ChatList.jsx";
import KeyExchangePanel from "../components/KeyExchangePanel.jsx";
import MessageInput from "../components/MessageInput.jsx";
import MessageList from "../components/MessageList.jsx";
import Navbar from "../components/Navbar.jsx";
import OnlineStatus from "../components/OnlineStatus.jsx";
import UserList from "../components/UserList.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { encryptMessage, decryptMessage } from "../crypto/ciphers.js";
import { getSharedMasterKey } from "../crypto/keyStore.js";
import { keyFingerprint } from "../crypto/ciphers.js";
import api from "../services/api.js";
import { getChatPartner, getChatTitle, getId } from "../services/chatHelpers.js";

const Chat = () => {
  const { user, keyChangedWarning } = useAuth();
  const { socket } = useSocket();
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedCipher, setSelectedCipher] = useState("vernam");
  const [showServerView, setShowServerView] = useState(false);
  const [masterKey, setMasterKey] = useState(null);
  const [fingerprint, setFingerprint] = useState("");
  const [encryptionError, setEncryptionError] = useState("");

  const currentUserId = user?._id;
  const selectedChatId = selectedChat?._id;

  const selectedPartner = useMemo(
    () => getChatPartner(selectedChat, currentUserId),
    [currentUserId, selectedChat]
  );

  // Derive master key whenever the partner changes
  useEffect(() => {
    setMasterKey(null);
    setFingerprint("");
    setEncryptionError("");

    if (!selectedPartner?.publicKey || !currentUserId) {
      return;
    }

    let cancelled = false;

    getSharedMasterKey(currentUserId, selectedPartner.publicKey)
      .then(async (key) => {
        if (cancelled) return;
        setMasterKey(key);
        const fp = await keyFingerprint(key);
        if (!cancelled) setFingerprint(fp);
      })
      .catch((err) => {
        if (!cancelled) setEncryptionError(err.message || "Encryption setup failed");
      });

    return () => { cancelled = true; };
  }, [currentUserId, selectedPartner?.publicKey]);

  // Decrypt a single message object for display — does NOT mutate the original
  const decryptForDisplay = useCallback(
    async (message) => {
      if (!message.isEncrypted) {
        return { ...message, displayText: message.text, decryptFailed: false };
      }

      if (!masterKey) {
        return { ...message, displayText: "🔒 Unable to decrypt this message", decryptFailed: true };
      }

      try {
        const plaintext = await decryptMessage({
          text: message.text,
          cipher: message.cipher,
          nonce: message.nonce,
          masterKey
        });
        return { ...message, displayText: plaintext, decryptFailed: false };
      } catch (_err) {
        return { ...message, displayText: "🔒 Unable to decrypt this message", decryptFailed: true };
      }
    },
    [masterKey]
  );

  // Decrypt all messages when masterKey becomes available
  const [displayMessages, setDisplayMessages] = useState([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all(messages.map((m) => decryptForDisplay(m))).then((decrypted) => {
      if (!cancelled) setDisplayMessages(decrypted);
    });

    return () => { cancelled = true; };
  }, [messages, decryptForDisplay]);

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

  // Ref to always have fresh decryptForDisplay without re-subscribing socket listeners
  const decryptForDisplayRef = useRef(decryptForDisplay);
  useEffect(() => { decryptForDisplayRef.current = decryptForDisplay; }, [decryptForDisplay]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleMessage = async (message) => {
      const messageChatId = getId(message.chatId);

      if (getId(selectedChatId) === messageChatId) {
        const decrypted = await decryptForDisplayRef.current(message);

        setMessages((currentMessages) => {
          if (currentMessages.some((currentMessage) => getId(currentMessage._id) === getId(message._id))) {
            return currentMessages;
          }
          return [...currentMessages, message];
        });

        setDisplayMessages((prev) => {
          if (prev.some((m) => getId(m._id) === getId(message._id))) return prev;
          return [...prev, decrypted];
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
        setDisplayMessages((prev) =>
          prev.map((message) =>
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
      setDisplayMessages([]);
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

  const handleSend = async (plaintext) => {
    if (!selectedChatId) {
      return;
    }

    setError("");

    // Encrypt the message before sending
    let payload;
    if (masterKey) {
      try {
        const encrypted = await encryptMessage({ plaintext, cipher: selectedCipher, masterKey });
        payload = {
          chatId: selectedChatId,
          text: encrypted.text,
          cipher: encrypted.cipher,
          nonce: encrypted.nonce,
          isEncrypted: true
        };
      } catch (encErr) {
        setError("Encryption failed: " + (encErr.message || "unknown error"));
        return;
      }
    } else {
      // No master key yet — send as plaintext (legacy/fallback)
      payload = { chatId: selectedChatId, text: plaintext };
    }

    if (socket?.connected) {
      socket.emit("send_message", payload, (response) => {
        if (!response?.ok) {
          setError(response?.message || "Could not send message");
        }
      });
      return;
    }

    try {
      const { data } = await api.post("/messages", payload);
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

  const partnerHasKey = Boolean(selectedPartner?.publicKey);
  const canSend = Boolean(selectedChatId) && (partnerHasKey || !selectedPartner);
  const noKeyMessage = selectedPartner && !partnerHasKey
    ? "This user has not set up encryption yet."
    : null;

  return (
    <main className="chat-page">
      <Navbar />
      {keyChangedWarning ? (
        <div className="warning-banner">
          ⚠️ A new encryption key was created on this device. Older messages encrypted for a previous key cannot be decrypted here.
        </div>
      ) : null}
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
            {selectedChat ? (
              <KeyExchangePanel
                currentUserId={currentUserId}
                partner={selectedPartner}
                fingerprint={fingerprint}
                masterKey={masterKey}
                selectedCipher={selectedCipher}
                showServerView={showServerView}
                onToggleServerView={() => setShowServerView((v) => !v)}
              />
            ) : null}
          </header>
          {encryptionError ? (
            <div className="error app-error">{encryptionError}</div>
          ) : null}
          {noKeyMessage ? (
            <div className="no-key-banner">{noKeyMessage}</div>
          ) : null}
          <MessageList
            messages={displayMessages}
            currentUserId={currentUserId}
            typingUser={typingUser}
            loading={loadingMessages}
            showServerView={showServerView}
          />
          <MessageInput
            disabled={!canSend}
            onSend={handleSend}
            onTypingStart={emitTyping}
            onTypingStop={emitStopTyping}
            selectedCipher={selectedCipher}
            onCipherChange={setSelectedCipher}
            hasEncryption={Boolean(masterKey)}
          />
        </section>
      </div>
    </main>
  );
};

export default Chat;
