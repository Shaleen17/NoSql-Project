import { formatTime, getChatTitle, getId, getUnreadCount } from "../services/chatHelpers.js";
import OnlineStatus from "./OnlineStatus.jsx";

const ChatList = ({ chats, currentUserId, selectedChatId, onSelectChat }) => (
  <section className="panel-section">
    <div className="section-heading">
      <h2>Chats</h2>
    </div>
    <div className="list chat-list">
      {chats.length === 0 ? (
        <p className="empty-text">No chats yet. Select a user to start.</p>
      ) : (
        chats.map((chat) => {
          const otherUser = chat.participants?.find((participant) => getId(participant) !== getId(currentUserId));
          const unreadCount = getUnreadCount(chat, currentUserId);
          const isActive = getId(chat._id) === getId(selectedChatId);

          return (
            <button
              type="button"
              className={`list-item chat-list-item ${isActive ? "active" : ""}`}
              key={chat._id}
              onClick={() => onSelectChat(chat)}
            >
              <span className="avatar">{getChatTitle(chat, currentUserId).slice(0, 1).toUpperCase()}</span>
              <span className="list-item-main">
                <span className="row-between">
                  <strong>{getChatTitle(chat, currentUserId)}</strong>
                  <small>{formatTime(chat.lastMessageTime || chat.updatedAt)}</small>
                </span>
                <span className="row-between muted-row">
                  <span>{chat.lastMessageText || "No messages yet"}</span>
                  {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : null}
                </span>
                {otherUser ? <OnlineStatus isOnline={otherUser.isOnline} lastSeen={otherUser.lastSeen} /> : null}
              </span>
            </button>
          );
        })
      )}
    </div>
  </section>
);

export default ChatList;
