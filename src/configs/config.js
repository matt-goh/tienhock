// config.js
import { PRODUCTION_CONFIG } from './production';

export const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? process.env.REACT_APP_API_BASE_URL  // Use env in development
  : PRODUCTION_CONFIG.API_BASE_URL;      // Use hardcoded in production

// Helper function to convert HTTP URL to WebSocket URL
export const getWebSocketUrl = () => {
  return API_BASE_URL.replace(/^http/, 'ws');
};