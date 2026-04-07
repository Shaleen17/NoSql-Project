import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: `${API_URL}/api`
});

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete api.defaults.headers.common.Authorization;
};

export const getApiErrorMessage = (error, fallback = "Request failed") => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }

  if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
    return `Cannot reach backend API at ${API_URL}. Check VITE_API_URL on Vercel and CLIENT_URL on Render.`;
  }

  return fallback;
};

export default api;
