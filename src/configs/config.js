// src/config.js

// Check if we're in browser (Vite) or Node.js (server)
const isBrowser = typeof window !== 'undefined';

const getEnvVariable = (key, defaultValue) => {
  if (isBrowser) {
    // Vite environment variables
    const viteEnv = import.meta.env || {};
    return viteEnv[`VITE_${key}`] || defaultValue;
  } else {
    // Node.js environment variables
    return process.env[key] || defaultValue;
  }
};

// Define defaults based on environment
const getDefaultApiBaseUrl = () => {
  const env = isBrowser
    ? (import.meta.env?.MODE || "development")
    : (process.env.NODE_ENV || "development");
  return env === "development"
    ? "http://localhost:5000"
    : "https://api.tienhock.com";
};

export const {
  // API Configuration
  API_BASE_URL,
  NODE_ENV,
  SERVER_PORT,
  SERVER_HOST,

  // Database Configuration
  DB_USER,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,

  // MyInvois Configuration
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,

  // Green Target MyInvois Configuration
  MYINVOIS_GT_CLIENT_ID,
  MYINVOIS_GT_CLIENT_SECRET,

  // Jelly Polly MyInvois Configuration
  MYINVOIS_JP_CLIENT_ID,
  MYINVOIS_JP_CLIENT_SECRET,
} = {
  // API Configuration
  API_BASE_URL: getEnvVariable("API_BASE_URL", getDefaultApiBaseUrl()),
  NODE_ENV: getEnvVariable("NODE_ENV", "development"),
  SERVER_PORT: getEnvVariable("SERVER_PORT", "5000"),
  SERVER_HOST: getEnvVariable("SERVER_HOST", "0.0.0.0"),

  // Database Configuration
  DB_USER: getEnvVariable("DB_USER", "postgres"),
  DB_HOST: getEnvVariable("DB_HOST", "localhost"),
  DB_NAME: getEnvVariable("DB_NAME", "tienhock"),
  DB_PASSWORD: getEnvVariable("DB_PASSWORD", ""),
  DB_PORT: getEnvVariable("DB_PORT", "5432"),

  // MyInvois Configuration
  MYINVOIS_API_BASE_URL: getEnvVariable("MYINVOIS_API_BASE_URL", ""),
  MYINVOIS_CLIENT_ID: getEnvVariable("MYINVOIS_CLIENT_ID", ""),
  MYINVOIS_CLIENT_SECRET: getEnvVariable("MYINVOIS_CLIENT_SECRET", ""),

  // Green Target MyInvois Configuration
  MYINVOIS_GT_CLIENT_ID: getEnvVariable("MYINVOIS_GT_CLIENT_ID", ""),
  MYINVOIS_GT_CLIENT_SECRET: getEnvVariable("MYINVOIS_GT_CLIENT_SECRET", ""),

  // JellyPolly MyInvois Configuration
  MYINVOIS_JP_CLIENT_ID: getEnvVariable("MYINVOIS_JP_CLIENT_ID", ""),
  MYINVOIS_JP_CLIENT_SECRET: getEnvVariable("MYINVOIS_JP_CLIENT_SECRET", ""),
};

// Debug logging in development
const isDevelopment = isBrowser
  ? (import.meta.env?.MODE === "development")
  : (process.env.NODE_ENV === "development");

if (isDevelopment) {
  console.log("Config loaded:", {
    API_BASE_URL,
    NODE_ENV,
    SERVER_PORT,
    SERVER_HOST,
  });
}
