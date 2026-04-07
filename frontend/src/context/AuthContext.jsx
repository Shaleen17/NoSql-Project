import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { setAuthToken } from "../services/api.js";

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("chat_user"));
  } catch (_error) {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem("chat_token"));
  const [user, setUser] = useState(readStoredUser);

  const saveSession = useCallback((session) => {
    localStorage.setItem("chat_token", session.token);
    localStorage.setItem("chat_user", JSON.stringify(session.user));
    setToken(session.token);
    setUser(session.user);
    setAuthToken(session.token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("chat_token");
    localStorage.removeItem("chat_user");
    setToken(null);
    setUser(null);
    setAuthToken(null);
  }, []);

  const login = useCallback(
    async (form) => {
      const { data } = await api.post("/auth/login", form);
      saveSession(data);
      return data;
    },
    [saveSession]
  );

  const register = useCallback(
    async (form) => {
      const { data } = await api.post("/auth/register", form);
      saveSession(data);
      return data;
    },
    [saveSession]
  );

  const refreshMe = useCallback(async () => {
    if (!token) {
      return;
    }

    setAuthToken(token);
    const { data } = await api.get("/users/me");
    localStorage.setItem("chat_user", JSON.stringify(data));
    setUser(data);
  }, [token]);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshMe().catch(logout);
    }
  }, [logout, refreshMe, token]);

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      register,
      logout,
      refreshMe
    }),
    [login, logout, refreshMe, register, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
