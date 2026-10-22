import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { setAuthToken } from "../services/api.js";
import { ensureKeyPair } from "../crypto/keyStore.js";
import { clearMasterKeyCache } from "../crypto/keyStore.js";

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
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [keyChangedWarning, setKeyChangedWarning] = useState(false);

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
    clearMasterKeyCache();
    setToken(null);
    setUser(null);
    setAuthToken(null);
    setEncryptionReady(false);
    setKeyChangedWarning(false);
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
    return data;
  }, [token]);

  // Initialize encryption key pair once the user session is known
  const initEncryption = useCallback(async (currentUser) => {
    if (!currentUser?._id) return;
    try {
      const { keyChanged } = await ensureKeyPair(currentUser._id, currentUser.publicKey || "");
      setKeyChangedWarning(keyChanged);
      setEncryptionReady(true);
    } catch (_err) {
      // Non-fatal: the app still works, encryption just won't be available
      setEncryptionReady(false);
    }
  }, []);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshMe()
        .then((freshUser) => {
          if (freshUser) initEncryption(freshUser);
        })
        .catch(logout);
    }
  }, [logout, refreshMe, token, initEncryption]);

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      register,
      logout,
      refreshMe,
      encryptionReady,
      keyChangedWarning
    }),
    [login, logout, refreshMe, register, token, user, encryptionReady, keyChangedWarning]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
