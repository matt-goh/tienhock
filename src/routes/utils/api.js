// src/routes/utils/api.js
import { sessionService } from "../../services/SessionService.ts";
import { API_BASE_URL } from "../../configs/config.js";

const handleResponse = async (response) => {
  const data = await response.json();

  // Check if response status is not in the 2xx range
  if (!response.ok) {
    // Create an error with the response data
    const error = new Error(data.message || "API request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

// Mapping of route path to the payload key expected by backend
const IRREGULAR_PLURALS = {
  nationalities: "nationalitys", // Match backend expectation of ${entityName}s
  agama: "agamas", // agama -> agamas for delete endpoint
};

export const api = {
  get: async (endpoint, options = {}) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        cache: "no-store",
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

  patch: async (endpoint, data) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "PATCH",
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

  uploadRaw: async (endpoint, file, contentType) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": contentType || file.type || "application/octet-stream",
          "x-session-id": sessionId,
        },
        body: file,
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_error) {
        data = null;
      }

      if (!response.ok) {
        const error = new Error(
          data?.message || response.statusText || "API request failed"
        );
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  },

  downloadBlob: async (endpoint) => {
    const sessionId = sessionService.getSessionId();
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        cache: "no-store",
        headers: {
          "x-session-id": sessionId,
        },
      });

      if (!response.ok) {
        let message = "API request failed";
        try {
          const data = await response.json();
          message = data.message || message;
        } catch (_error) {
          message = response.statusText || message;
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      return response.blob();
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
