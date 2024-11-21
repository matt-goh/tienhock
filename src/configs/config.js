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

  // MyInvois API Configuration
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
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

  MYINVOIS_CLIENT_ID: getEnvVariable('MYINVOIS_CLIENT_ID'),
  MYINVOIS_CLIENT_SECRET: getEnvVariable('MYINVOIS_CLIENT_SECRET'),
};

export const MYINVOIS_API_BASE_URL = 'https://preprod-api.myinvois.hasil.gov.my';

// Helper function to convert HTTP URL to WebSocket URL
export const getWebSocketUrl = () => {
  return API_BASE_URL.replace(/^http/, 'ws');
};