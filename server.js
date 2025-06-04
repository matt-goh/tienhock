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
import {
  checkAndProcessDueConsolidations,
  scheduleNextMonthConsolidation,
} from "./src/utils/invoice/autoConsolidation.js";

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
  "0 8 * * *", // Run daily at 8 AM
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
    timezone: "Asia/Kuala_Lumpur", // Set your desired timezone
  }
);

// --- Auto-consolidation scheduler ---
console.log(
  `[${new Date().toISOString()}] Setting up auto-consolidation cron job for 3:10 PM daily (Asia/Kuala_Lumpur timezone)`
);

const consolidationJob = cron.schedule(
  "25 15 * * *", // Run at 3:10 PM every day
  async () => {
    console.log(
      `[${new Date().toISOString()}] Auto-consolidation cron job triggered`
    );
    try {
      // Check if any consolidations are due today
      await checkAndProcessDueConsolidations(pool);

      // Schedule next month's consolidation if we're at month-end
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // If today is the last day of the month, schedule next month's consolidation
      if (now.getMonth() !== tomorrow.getMonth()) {
        console.log(
          `[${new Date().toISOString()}] End of month detected, scheduling next month's consolidation`
        );
        await scheduleNextMonthConsolidation(pool);
      }

      console.log(
        `[${new Date().toISOString()}] Auto-consolidation job completed successfully`
      );
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in auto-consolidation job:`,
        error
      );
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Kuala_Lumpur",
  }
);

// Log cron job status
console.log(
  `[${new Date().toISOString()}] Auto-consolidation cron job scheduled: ${
    consolidationJob.scheduled
  }`
);

// Add manual trigger endpoint for testing
app.get("/api/admin/test-consolidation", async (req, res) => {
  try {
    console.log(
      `[${new Date().toISOString()}] Manual consolidation test triggered`
    );

    // Log current server time in different timezones
    const now = new Date();
    console.log(`Server UTC time: ${now.toISOString()}`);
    console.log(`Server local time: ${now.toString()}`);
    console.log(
      `Malaysia time: ${now.toLocaleString("en-US", {
        timeZone: "Asia/Kuala_Lumpur",
      })}`
    );

    await checkAndProcessDueConsolidations(pool);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (now.getMonth() !== tomorrow.getMonth()) {
      await scheduleNextMonthConsolidation(pool);
    }

    res.json({
      message: "Consolidation test completed successfully",
      serverTime: {
        utc: now.toISOString(),
        local: now.toString(),
        malaysia: now.toLocaleString("en-US", {
          timeZone: "Asia/Kuala_Lumpur",
        }),
      },
    });
  } catch (error) {
    console.error("Manual consolidation test failed:", error);
    res.status(500).json({
      error: "Consolidation test failed",
      details: error.message,
    });
  }
});

// Add cron status endpoint
app.get("/api/admin/cron-status", (req, res) => {
  const now = new Date();
  res.json({
    consolidationJob: {
      scheduled: consolidationJob.scheduled,
      running: consolidationJob.running,
    },
    serverTime: {
      utc: now.toISOString(),
      local: now.toString(),
      malaysia: now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }),
    },
    nextRun: "Daily at 3:10 PM Malaysia time",
  });
});

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
