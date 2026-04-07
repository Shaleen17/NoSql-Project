import { formatTime, getId } from "../services/chatHelpers.js";

const MessageList = ({ messages, currentUserId, typingUser, loading }) => (
  <div className="messages">
    {loading ? <p className="empty-text">Loading messages...</p> : null}
    {!loading && messages.length === 0 ? (
      <p className="empty-text">No messages yet. Say hello.</p>
    ) : null}
    {messages.map((message) => {
      const isMine = getId(message.sender) === getId(currentUserId);

      return (
        <div className={`message-row ${isMine ? "mine" : "theirs"}`} key={message._id}>
          <div className="message-bubble">
            {!isMine ? <span className="message-sender">{message.sender?.name}</span> : null}
            <p>{message.text}</p>
            <span className="message-meta">
              {formatTime(message.createdAt)}
              {isMine && message.status ? ` · ${message.status}` : ""}
            </span>
          </div>
        </div>
      );
    })}
    {typingUser ? <p className="typing-text">{typingUser} is typing...</p> : null}
  </div>
);

export default MessageList;
