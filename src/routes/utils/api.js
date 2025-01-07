// src/routes/utils/api.js
import { sessionService } from '../../services/SessionService.ts';
import { API_BASE_URL } from '../../configs/config.js';

const handleResponse = async (response) => {
  const data = await response.json();
  
  if (!response.ok) {
    // Don't clear session if server explicitly says to preserve it
    if (response.status === 503 && data.maintenance && data.preserveSession) {
      throw new Error(data.message || 'Service temporarily unavailable');
    }
    
    // Don't clear session during maintenance mode
    if (response.status === 503 && data.maintenance) {
      throw new Error(data.message || 'Service temporarily unavailable');
    }
    
    // Clear session on unauthorized unless explicitly told not to
    if (response.status === 401 && !data.preserveSession) {
      sessionService.clearSession();
    }
    
    throw new Error(data.message || 'API request failed');
  }
  
  return data;
};

export const api = {
  get: async (endpoint, options = {}) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
          ...options.headers
        }
      });
      
      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  post: async (endpoint, data) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId
        },
        body: JSON.stringify(data)
      });
      
      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  put: async (endpoint, data) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId
        },
        body: JSON.stringify(data)
      });
      
      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  delete: async (endpoint, payload) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId
        },
        body: JSON.stringify(payload ? { [`${endpoint.split('/').pop()}`]: payload } : {})
      });
      
      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  }
};