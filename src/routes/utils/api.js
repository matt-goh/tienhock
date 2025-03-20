// src/routes/utils/api.js
import { sessionService } from "../../services/SessionService.ts";
import { API_BASE_URL } from "../../configs/config.js";

const handleResponse = async (response) => {
  const data = await response.json();
  return data;
};

const getCompanyPrefix = () => {
  const path = window.location.pathname;
  if (path.startsWith("/jellypolly")) {
    return "/jellypolly";
  } else if (path.startsWith("/greentarget")) {
    return "/greentarget";
  }
  return "";
};

// Mapping of route path to the payload key expected by backend
const IRREGULAR_PLURALS = {
  nationalities: "nationalitys", // Match backend expectation of ${entityName}s
};

export const api = {
  get: async (endpoint, options = {}) => {
    const sessionId = sessionService.getSessionId();
    const companyPrefix = getCompanyPrefix();
    try {
      const response = await fetch(
        `${API_BASE_URL}${companyPrefix}${endpoint}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
            ...options.headers,
          },
        }
      );

      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  post: async (endpoint, data) => {
    const sessionId = sessionService.getSessionId();
    const companyPrefix = getCompanyPrefix();
    try {
      const response = await fetch(
        `${API_BASE_URL}${companyPrefix}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
          body: JSON.stringify(data),
        }
      );

      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  put: async (endpoint, data) => {
    const sessionId = sessionService.getSessionId();
    const companyPrefix = getCompanyPrefix();
    try {
      const response = await fetch(
        `${API_BASE_URL}${companyPrefix}${endpoint}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
          body: JSON.stringify(data),
        }
      );

      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  delete: async (endpoint, payload) => {
    const sessionId = sessionService.getSessionId();
    const companyPrefix = getCompanyPrefix();
    try {
      // Get the last part of the endpoint (e.g., 'job-details' from '/api/job-details')
      const routeName = endpoint.split("/").pop() || "";

      // Special case for job-details endpoint
      const finalPayload =
        routeName === "job-details"
          ? { jobDetailIds: payload } // Wrap the IDs array in the expected format
          : { [IRREGULAR_PLURALS[routeName] || `${routeName}`]: payload };

      const response = await fetch(
        `${API_BASE_URL}${companyPrefix}${endpoint}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
          body: JSON.stringify(finalPayload),
        }
      );

      return handleResponse(response);
    } catch (error) {
      throw error;
    }
  },
};
