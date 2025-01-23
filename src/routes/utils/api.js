// src/routes/utils/api.js
import { sessionService } from "../../services/SessionService.ts";
import { API_BASE_URL } from "../../configs/config.js";

const handleResponse = async (response) => {
  const data = await response.json();

  return data;
};

// Mapping of route path to the payload key expected by backend
const IRREGULAR_PLURALS = {
  nationalities: "nationalitys", // Match backend expectation of ${entityName}s
};

export const api = {
  get: async (endpoint, options = {}) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
          ...options.headers,
        },
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
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(data),
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
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(data),
      });

      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  delete: async (endpoint, payload) => {
    const sessionId = sessionService.getSessionId();
    try {
      // Get the last part of the endpoint (e.g., 'job-details' from '/api/job-details')
      const routeName = endpoint.split("/").pop() || "";

      // Special case for job-details endpoint
      const finalPayload =
        routeName === "job-details"
          ? { jobDetailIds: payload } // Wrap the IDs array in the expected format
          : { [IRREGULAR_PLURALS[routeName] || `${routeName}`]: payload };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(finalPayload),
      });

      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },
};
