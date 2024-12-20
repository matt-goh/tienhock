// config.js
const getEnvVariable = (key) => {
  // Try REACT_APP_ prefix first, then fallback to regular env var
  return process.env[`REACT_APP_${key}`] || process.env[key];
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
} = {
  // API Configuration
  API_BASE_URL: getEnvVariable('API_BASE_URL'),
  NODE_ENV: getEnvVariable('NODE_ENV'),
  SERVER_PORT: getEnvVariable('SERVER_PORT'),
  SERVER_HOST: getEnvVariable('SERVER_HOST'),

  // Database Configuration
  DB_USER: getEnvVariable('DB_USER'),
  DB_HOST: getEnvVariable('DB_HOST'),
  DB_NAME: getEnvVariable('DB_NAME'),
  DB_PASSWORD: getEnvVariable('DB_PASSWORD'),
  DB_PORT: getEnvVariable('DB_PORT'),
};

// Helper function to convert HTTP URL to WebSocket URL
export const getWebSocketUrl = () => {
  // Instead of using API_BASE_URL, use window.location to get the current host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host; // This will not include the development port
  
  // Return the WebSocket URL with the /api/ws path
  return `${protocol}//${host}/api/ws`;
};