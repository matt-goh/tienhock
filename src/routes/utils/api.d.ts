// Type definitions for api.js
export interface ApiOptions {
  headers?: Record<string, string>;
}

export interface ApiError extends Error {
  status: number;
  data: any;
}

export const api: {
  get: <T = any>(endpoint: string, options?: ApiOptions) => Promise<T>;
  post: <T = any>(endpoint: string, data?: any) => Promise<T>;
  put: <T = any>(endpoint: string, data?: any) => Promise<T>;
  delete: <T = any>(endpoint: string, payload?: any) => Promise<T>;
};
