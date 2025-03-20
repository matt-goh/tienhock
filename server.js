// server.js
import setupRoutes from "./src/routes/index.js";
import pkgBodyParser from "body-parser";
import express from "express";
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
import { schemaMiddleware } from "./src/middleware/schema-middleware.js";

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
  if (
    pool.pool.maintenanceMode &&
    !req.path.startsWith("/api/backup") &&
    req.method !== "OPTIONS"
  ) {
    return res.status(503).json({
      error: "Service temporarily unavailable",
      message:
        "System maintenance in progress. Please try again in a few moments.",
    });
  }
  next();
});
app.use(schemaMiddleware(pool));

// conditional CORS configuration based on environment
const corsConfig =
  process.env.NODE_ENV === "production"
    ? { origin: false } // In production, Nginx handles CORS
    : {
        // In development, Express handles CORS
        origin: ["http://localhost:3000"],
        methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "x-session-id",
          "api-key",
        ],
        credentials: true,
      };

app.use(cors(corsConfig));
app.use(json({ limit: "50mb" }));

// IMPORTANT: Serve static files but with API route precedence
app.use(
  express.static(path.join(__dirname, "build"), {
    index: false, // Don't serve index.html for directory requests
  })
);

// Setup company-prefixed API routes
// 1. TienHock routes (no prefix)
setupRoutes(app, pool);

// 2. Handle company-prefixed routes
// This is critical - we need explicit handling for each company
app.use(
  "/jellypolly/api",
  (req, res, next) => {
    // Store company schema info on request
    req.companySchema = "jellypolly";
    // Rewrite URL to remove company prefix for route matching
    req.url = req.url.replace(/^\/jellypolly\/api/, "");
    next();
  },
  setupRoutes
);

app.use(
  "/greentarget/api",
  (req, res, next) => {
    req.companySchema = "greentarget";
    req.url = req.url.replace(/^\/greentarget\/api/, "");
    next();
  },
  setupRoutes
);

// AFTER API routes, catch-all for React routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// Start server
app.listen(port, "0.0.0.0", () => {
  const displayHost =
    NODE_ENV === "development"
      ? "localhost:5001 (development mode)"
      : `${SERVER_HOST || "0.0.0.0"}:${port}`;

  console.log(`Server running on https://${displayHost}`);
  console.log(`Server environment: ${NODE_ENV}`);
  console.log(
    `MyInvois URL, ID & Secret accessed: ${MYINVOIS_API_BASE_URL}...`
  );
});

// Enhanced graceful shutdown
const shutdownGracefully = async (signal) => {
  console.log(
    `${signal} signal received. Closing HTTP server and database pool...`
  );

  try {
    // Give active queries a chance to complete
    if (pool.pool.maintenanceMode) {
      console.log("Pool is in maintenance mode, waiting additional time...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    await pool.end();
    console.log("Database pool closed.");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
process.on("SIGINT", () => shutdownGracefully("SIGINT"));
