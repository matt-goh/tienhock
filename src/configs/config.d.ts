// Type declarations for config.js

export const API_BASE_URL: string;
export const NODE_ENV: string;
export const SERVER_PORT: string;
export const SERVER_HOST: string;

export const DB_USER: string;
export const DB_HOST: string;
export const DB_NAME: string;
export const DB_PASSWORD: string;
export const DB_PORT: string;

export const MYINVOIS_API_BASE_URL: string;
export const MYINVOIS_CLIENT_ID: string;
export const MYINVOIS_CLIENT_SECRET: string;

export const MYINVOIS_GT_CLIENT_ID: string;
export const MYINVOIS_GT_CLIENT_SECRET: string;

export const MYINVOIS_JP_CLIENT_ID: string;
export const MYINVOIS_JP_CLIENT_SECRET: string;

// AWS S3 Backup Configuration
export const AWS_ACCESS_KEY_ID: string;
export const AWS_SECRET_ACCESS_KEY: string;
export const AWS_REGION: string;
export const S3_BUCKET_NAME: string;

// Helper to check if S3 backup is configured
export function isS3BackupEnabled(): boolean;
