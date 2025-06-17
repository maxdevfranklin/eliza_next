// --- Constants ---
export const USER_NAME = "User";

// Dynamic source based on environment - falls back to API for generic usage
export const CHAT_SOURCE = typeof window !== 'undefined' 
  ? window.location.hostname || "api"
  : process.env.NEXT_PUBLIC_APP_URL?.replace(/https?:\/\//, '') || "api";
