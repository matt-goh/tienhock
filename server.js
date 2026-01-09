// server.js
import setupRoutes from "./src/routes/index.js";
import pkgBodyParser from "body-parser";
import express from "express";
import cron from "node-cron";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createDatabasePool } from "./src/routes/utils/db-pool.js";
import { updateInvoiceStatuses } from "./src/utils/invoice/invoiceStatusUpdater.js";
import { checkAndProcessDueConsolidations } from "./src/utils/invoice/autoConsolidation.js";
import { createAutoBackup, syncLocalToS3, deleteOldS3Backups } from "./src/utils/s3-backup.js";
import { clearInvalidEInvoicesForNonEligibleCustomers } from "./src/routes/sales/invoices/invoices.js";

dotenv.config();

const { json } = pkgBodyParser;
const app = express();
const port = 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create enhanced PostgreSQL pool (defaults match dev Docker config)
export const pool = createDatabasePool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "tienhock",
  password: process.env.DB_PASSWORD || "foodmaker",
  port: process.env.DB_PORT || 5434,
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
    ? { origin: false } // In production, Nginx handles CORS
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
cron.schedule(
  "0 0 * * *", // Run daily at 8 AM Malaysia time (UTC+8, so 00:00 UTC)
  async () => {
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
    timezone: "UTC", // Set your desired timezone
  }
);

// --- Auto-consolidation scheduler ---
cron.schedule(
  "0 0 * * *", // Run daily at 8 AM Malaysia time (UTC+8, so 00:00 UTC)
  async () => {
    try {
      // Check if any consolidations are due today
      await checkAndProcessDueConsolidations(pool);
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in auto-consolidation job:`,
        error
      );
    }
  },
  {
    scheduled: true,
    timezone: "UTC",
  }
);

// --- Daily e-invoice clearing for non-eligible customers ---
cron.schedule(
  "0 0 * * *", // Run daily at 8 AM Malaysia time (UTC+8, so 00:00 UTC)
  async () => {
    try {
      await clearInvalidEInvoicesForNonEligibleCustomers(pool);
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in daily e-invoice clearing job:`,
        error
      );
    }
  },
  {
    scheduled: true,
    timezone: "UTC",
  }
);

// --- Weekly automatic backup ---
cron.schedule(
  "0 3 * * 0", // Run every Sunday at 3:00 AM UTC (11:00 AM Malaysia time)
  async () => {
    console.log(`[${new Date().toISOString()}] Starting weekly automatic backup...`);
    try {
      await createAutoBackup();
      console.log(`[${new Date().toISOString()}] Weekly automatic backup completed`);
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in weekly backup job:`,
        error
      );
    }
  },
  {
    scheduled: true,
    timezone: "UTC",
  }
);

// --- Daily S3 backup sync (safety net) ---
cron.schedule(
  "0 2 * * *", // Run daily at 2:00 AM UTC (10:00 AM Malaysia time)
  async () => {
    console.log(`[${new Date().toISOString()}] Starting daily S3 backup sync...`);
    try {
      const env = process.env.NODE_ENV || "development";
      const backupDir = `/var/backups/postgres/${env}`;

      // Sync local backups to S3
      await syncLocalToS3(backupDir, env);

      // Clean up old S3 backups (3 years = 1095 days)
      await deleteOldS3Backups(env, 1095);

      console.log(`[${new Date().toISOString()}] Daily S3 backup sync completed`);
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in S3 sync job:`,
        error
      );
    }
  },
  {
    scheduled: true,
    timezone: "UTC",
  }
);

// Handle react routing (Catch-all for client-side routing)
// This should generally be AFTER your API routes
app.get("*", (req, res) => {
  // Avoid sending index.html for API-like paths that weren't matched
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/greentarget/api/") ||
    req.path.startsWith("/jellypolly/api/")
  ) {
    return res.status(404).json({ message: "API endpoint not found" });
  }
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// Start server
const server = app.listen(port, "0.0.0.0");

// Enhanced graceful shutdown
const shutdownGracefully = async (signal) => {
  server.close(async () => {
    try {
      // Give active queries a chance to complete gracefully
      // The pool.end() method waits for acquired clients to be returned.
      await pool.end();
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
