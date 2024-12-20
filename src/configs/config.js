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

export const getWebSocketUrl = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  if (isDevelopment) {
    // Development environment - use port 5001
    return `${wsProtocol}//localhost:5001/api/ws`;
  }
  
  // Production environment - use window.location to get the current host
  return `${wsProtocol}//${window.location.host}/api/ws`;
};