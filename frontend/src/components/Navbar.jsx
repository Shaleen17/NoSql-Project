import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";

const Navbar = () => {
  const { logout, user } = useAuth();
  const { isConnected } = useSocket();

  return (
    <header className="navbar">
      <div>
        <h1>ChatFlow</h1>
        <p>{user?.name ? user.name : "Stay connected"}</p>
      </div>
      <div className="navbar-actions">
        <span className={`connection ${isConnected ? "connected" : ""}`}>
          {isConnected ? "Online" : "Connecting..."}
        </span>
        <button type="button" className="secondary-button" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
};

export default Navbar;
