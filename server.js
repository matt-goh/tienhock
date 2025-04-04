// server.js
import setupRoutes from "./src/routes/index.js";
import pkgBodyParser from "body-parser";
import express from "express";
import cron from "node-cron";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import {
  NODE_ENV,
  SERVER_HOST,
  MYINVOIS_API_BASE_URL,
} from "./src/configs/config.js";
import { fileURLToPath } from "url";
import { createDatabasePool } from "./src/routes/utils/db-pool.js";
import { updateInvoiceStatuses } from "./src/utils/invoice/invoiceStatusUpdater.js";

dotenv.config();

const { json } = pkgBodyParser;
const app = express();
const port = 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create enhanced PostgreSQL pool
export const pool = createDatabasePool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware to handle database maintenance mode
app.use(async (req, res, next) => {
  // Check if the pool object itself exists and has the maintenanceMode property
  if (
    pool &&
    pool.pool.maintenanceMode &&
    !req.path.startsWith("/api/backup") && // Allow backup routes
    req.method !== "OPTIONS" // Allow CORS preflight
  ) {
    // Log maintenance mode activation
    // console.log(`Maintenance mode active. Request blocked: ${req.method} ${req.path}`);
    return res.status(503).json({
      error: "Service temporarily unavailable",
      message:
        "System maintenance in progress. Please try again in a few moments.",
    });
  }
  next();
});

// conditional CORS configuration based on environment
const corsConfig =
  process.env.NODE_ENV === "production"
    ? { origin: false } // In production, Nginx likely handles CORS
    : {
        // In development, Express handles CORS
        origin: ["http://localhost:3000", "http://localhost:5000"], // Allow frontend and potentially backend itself
        methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "x-session-id",
          "api-key",
        ],
        credentials: true, // Allow credentials (cookies, authorization headers, etc.)
      };

app.use(cors(corsConfig));
app.use(json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" })); // Handle form data

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, "build")));

// Setup all routes (Pass the pool)
setupRoutes(app, pool); // Pass the pool instance here

// --- Scheduled Job for Invoice Status Updates ---
// Runs every day at 8:00 AM Kuala Lumpur time (adjust as needed)
console.log("Setting up daily invoice status update job...");
cron.schedule(
  "0 8 * * *",
  async () => {
    console.log(
      `[${new Date().toISOString()}] Running daily invoice status update job...`
    );
    try {
      // The updater function now imports and uses the pool directly
      await updateInvoiceStatuses();
    } catch (error) {
      // Error is already logged within updateInvoiceStatuses
      console.error(
        `[${new Date().toISOString()}] Critical error during invoice status update job execution:`,
        error
      );
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Kuala_Lumpur", // Set your desired timezone
  }
);
console.log("Daily invoice status update job scheduled for 8:00 AM KLT.");

// Handle react routing (Catch-all for client-side routing)
// This should generally be AFTER your API routes
app.get("*", (req, res) => {
  // Avoid sending index.html for API-like paths that weren't matched
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/greentarget/api/")
  ) {
    return res.status(404).json({ message: "API endpoint not found" });
  }
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// Start server
const server = app.listen(port, "0.0.0.0", () => {
  // Use SERVER_HOST from config if available, otherwise '0.0.0.0'
  const displayHost =
    NODE_ENV === "development"
      ? `localhost:${port}`
      : `${SERVER_HOST || "0.0.0.0"}:${port}`;

  console.log(`🚀Server running on http://${displayHost}`);
  console.log(`Environment: ${NODE_ENV}`);
  if (MYINVOIS_API_BASE_URL) {
    console.log(`MyInvois API: ${MYINVOIS_API_BASE_URL}`);
  } else {
    console.warn("MyInvois API URL not configured.");
  }
});

// Enhanced graceful shutdown
const shutdownGracefully = async (signal) => {
  console.log(`\n${signal} signal received.`);
  console.log("Closing HTTP server...");

  server.close(async () => {
    console.log("HTTP server closed.");
    console.log("Closing database pool...");
    try {
      // Give active queries a chance to complete gracefully
      // The pool.end() method waits for acquired clients to be returned.
      await pool.end();
      console.log("Database pool closed successfully.");
      process.exit(0); // Exit cleanly
    } catch (error) {
      console.error("Error closing database pool:", error);
      process.exit(1); // Exit with error code
    }
  });

  // Force shutdown if server closing takes too long
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 10000); // 10 seconds timeout
};

process.on("SIGTERM", () => shutdownGracefully("SIGTERM")); // e.g., kill
process.on("SIGINT", () => shutdownGracefully("SIGINT")); // e.g., Ctrl+C
