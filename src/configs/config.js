// config.js
const getEnvVariable = (key, defaultValue) => {
  // Try REACT_APP_ prefix first, then fallback to regular env var, then default
  return process.env[`REACT_APP_${key}`] || process.env[key] || defaultValue;
};

// Define defaults based on environment
const getDefaultApiBaseUrl = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' 
    ? 'http://localhost:5000' 
    : 'https://api.tienhock.com';
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
} = {
  // API Configuration
  API_BASE_URL: getEnvVariable('API_BASE_URL', getDefaultApiBaseUrl()),
  NODE_ENV: getEnvVariable('NODE_ENV', 'development'),
  SERVER_PORT: getEnvVariable('SERVER_PORT', '5000'),
  SERVER_HOST: getEnvVariable('SERVER_HOST', '0.0.0.0'),

  // Database Configuration
  DB_USER: getEnvVariable('DB_USER', 'postgres'),
  DB_HOST: getEnvVariable('DB_HOST', 'localhost'),
  DB_NAME: getEnvVariable('DB_NAME', 'tienhock'),
  DB_PASSWORD: getEnvVariable('DB_PASSWORD', ''),
  DB_PORT: getEnvVariable('DB_PORT', '5432'),

  // MyInvois Configuration
  MYINVOIS_API_BASE_URL: getEnvVariable('MYINVOIS_API_BASE_URL', ''),
  MYINVOIS_CLIENT_ID: getEnvVariable('MYINVOIS_CLIENT_ID', ''),
  MYINVOIS_CLIENT_SECRET: getEnvVariable('MYINVOIS_CLIENT_SECRET', ''),
};

// Debug logging in development
if (process.env.NODE_ENV === 'development') {
  console.log('Config loaded:', {
    API_BASE_URL,
    NODE_ENV,
    SERVER_PORT,
    SERVER_HOST,
  });
}