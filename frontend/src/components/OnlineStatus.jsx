const OnlineStatus = ({ isOnline, lastSeen }) => (
  <span className={`status ${isOnline ? "status-online" : "status-offline"}`}>
    {isOnline ? "Online" : lastSeen ? `Last seen ${new Date(lastSeen).toLocaleString()}` : "Offline"}
  </span>
);

export default OnlineStatus;
