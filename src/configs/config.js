// config.js
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

  // MyInvois API Configuration
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
} = {
  // API Configuration
  API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
  NODE_ENV: process.env.REACT_APP_NODE_ENV,
  SERVER_PORT: process.env.REACT_APP_SERVER_PORT,
  SERVER_HOST: process.env.REACT_APP_SERVER_HOST,

  // Database Configuration
  DB_USER: process.env.REACT_APP_DB_USER,
  DB_HOST: process.env.REACT_APP_DB_HOST,
  DB_NAME: process.env.REACT_APP_DB_NAME,
  DB_PASSWORD: process.env.REACT_APP_DB_PASSWORD,
  DB_PORT: process.env.REACT_APP_DB_PORT,

  // MyInvois API Configuration
  MYINVOIS_API_BASE_URL: process.env.MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID: process.env.MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET: process.env.MYINVOIS_CLIENT_SECRET,
};

// Helper function to convert HTTP URL to WebSocket URL
export const getWebSocketUrl = () => {
  return API_BASE_URL.replace(/^http/, 'ws');
};