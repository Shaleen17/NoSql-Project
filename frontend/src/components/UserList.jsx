import OnlineStatus from "./OnlineStatus.jsx";

const UserList = ({ users, onSelectUser, onSearch, search }) => (
  <section className="panel-section">
    <div className="section-heading">
      <h2>Users</h2>
    </div>
    <input
      className="search-input"
      value={search}
      onChange={(event) => onSearch(event.target.value)}
      placeholder="Search users"
    />
    <div className="list">
      {users.length === 0 ? (
        <p className="empty-text">No users found.</p>
      ) : (
        users.map((user) => (
          <button
            type="button"
            className="list-item"
            key={user._id}
            onClick={() => onSelectUser(user)}
          >
            <span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span>
            <span className="list-item-main">
              <strong>{user.name}</strong>
              <OnlineStatus isOnline={user.isOnline} lastSeen={user.lastSeen} />
            </span>
          </button>
        ))
      )}
    </div>
  </section>
);

export default UserList;
