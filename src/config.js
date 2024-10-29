export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// Helper function to convert HTTP URL to WebSocket URL
export const getWebSocketUrl = () => {
    return API_BASE_URL.replace(/^http/, 'ws');
  };