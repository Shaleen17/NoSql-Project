import { formatTime, getId } from "../services/chatHelpers.js";

const MessageList = ({ messages, currentUserId, typingUser, loading, showServerView }) => (
  <div className="messages">
    {loading ? <p className="empty-text">Loading messages...</p> : null}
    {!loading && messages.length === 0 ? (
      <p className="empty-text">No messages yet. Say hello.</p>
    ) : null}
    {messages.map((message) => {
      const isMine = getId(message.sender) === getId(currentUserId);
      // Use displayText if present (decrypted), fall back to raw text for legacy messages
      const textToShow = message.displayText !== undefined ? message.displayText : message.text;

      return (
        <div className={`message-row ${isMine ? "mine" : "theirs"}`} key={message._id}>
          <div className="message-bubble">
            {!isMine ? <span className="message-sender">{message.sender?.name}</span> : null}
            <p className={message.decryptFailed ? "decrypt-failed" : ""}>{textToShow}</p>
            <span className="message-meta">
              {message.isEncrypted ? (
                <span className="lock-badge" title={`Cipher: ${message.cipher}`}>
                  🔒 {message.cipher}
                </span>
              ) : null}
              {" "}
              {formatTime(message.createdAt)}
              {isMine && message.status ? ` · ${message.status}` : ""}
            </span>
            {showServerView && message.isEncrypted ? (
              <div className="server-view">
                <span className="server-view-label">Server sees:</span>
                <code className="server-view-ciphertext">{message.text}</code>
                {message.nonce ? (
                  <div>
                    <span className="server-view-label">Nonce:</span>
                    <code className="server-view-ciphertext">{message.nonce}</code>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      );
    })}
    {typingUser ? <p className="typing-text">{typingUser} is typing...</p> : null}
  </div>
);

export default MessageList;
