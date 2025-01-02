// src/utils/api.js
import { sessionService } from '../../services/SessionService.ts';
import { API_BASE_URL } from '../../configs/config.js';

export const api = {
    get: async (endpoint, options = {}) => {
      const sessionId = sessionService.getSessionId();
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
          ...options.headers
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API request failed');
      }
      
      return response.json();
    },
  
    post: async (endpoint, data) => {
      const sessionId = sessionService.getSessionId();
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API request failed');
      }
      
      return response.json();
    },
  
    put: async (endpoint, data) => {
      const sessionId = sessionService.getSessionId();
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API request failed');
      }
      
      return response.json();
    },
  
    delete: async (endpoint, payload) => {
      const sessionId = sessionService.getSessionId();
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId
        },
        body: JSON.stringify(payload ? { [`${endpoint.split('/').pop()}`]: payload } : {})
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API request failed');
      }
      
      return response.json();
    }
  };