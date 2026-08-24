import { NODE_ENV } from "../configs/config.js";

const ALLOWED_API_KEY = "REMOVED_SECRET";

// Store last update times for session activity (more memory efficient than a regular object)
const sessionLastUpdated = new WeakMap();
// Minimum time between session updates (10 minutes in milliseconds)
const MIN_SESSION_UPDATE_INTERVAL = 10 * 60 * 1000;

export const authMiddleware = (pool) => async (req, res, next) => {
  const requestPath = req.originalUrl?.split("?")[0] || req.path;
  const apiKey = req.headers["api-key"];
  const remoteAddress = req.socket?.remoteAddress;
  const isLoopbackRequest =
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1";
  // The development login page has no validated session yet. Keep its one
  // destructive shortcut local-only and leave API-key requests on the normal
  // authentication path so the backup route can reject them explicitly.
  const isLocalDevelopmentSqlReplacement =
    NODE_ENV === "development" &&
    (process.platform === "win32" || process.platform === "darwin") &&
    req.method === "POST" &&
    requestPath === "/api/backup/upload-sql" &&
    !apiKey &&
    isLoopbackRequest;

  // STEP 1: Routes that always bypass auth check
  if (
    (req.method === "GET" && requestPath === "/api/backup/restore/status") ||
    isLocalDevelopmentSqlReplacement ||
    req.method === "OPTIONS" ||
    req.path === "/api/sessions/initialize" ||
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/check-ic"
  ) {
    return next();
  }

  // STEP 2: Check for maintenance mode
  if (pool.pool.maintenanceMode) {
    const statusCode = requestPath.startsWith("/api/backup/") ? 503 : 200;
    return res.status(statusCode).json({
      status: "maintenance",
      message: "System is currently undergoing maintenance.",
      maintenance: true,
      preserveSession: true,
    });
  }

  // STEP 3: Get auth credentials (session ID or API key)
  const sessionId = req.headers["x-session-id"];

  if (!sessionId && !apiKey) {
    return res
      .status(401)
      .json({ message: "No session ID or API key provided" });
  }

  // STEP 4: Handle API Key auth
  if (apiKey) {
    if (apiKey !== ALLOWED_API_KEY) {
      return res.status(401).json({ message: "Invalid API key" });
    }
    req.apiKey = apiKey;
    return next();
  }

  // STEP 5: Additional routes that are allowed with any session ID (even if new)
  if (
    req.path === "/api/sessions/state" ||
    req.path.startsWith("/api/sessions/state/")
  ) {
    // Let the session state endpoint handle validation itself
    return next();
  }

  // STEP 6: Session validation (for all other routes)
  try {
    // Check if database is accessible
    try {
      await pool.query("SELECT 1");
    } catch (error) {
      return res.status(503).json({
        error: "Service temporarily unavailable",
        message:
          "System maintenance in progress. Please try again in a few moments.",
        maintenance: true,
        preserveSession: true,
        requireReconnect: true,
      });
    }

    // Query session info
    const sessionQuery = `
      SELECT 
        s.*,
        st.name as staff_name,
        st.job as staff_job 
      FROM active_sessions s
      LEFT JOIN staffs st ON st.id = s.staff_id
      WHERE s.session_id = $1 
        AND s.status = 'active'
        AND s.last_active > NOW() - INTERVAL '7 days'
    `;

    const sessionResult = await pool.query(sessionQuery, [sessionId]);

    if (sessionResult.rows.length === 0) {
      // No valid session - check for maintenance mode
      if (pool.pool.maintenanceMode) {
        return res.status(503).json({
          error: "Service temporarily unavailable",
          message:
            "System maintenance in progress. Please try again in a few moments.",
          maintenance: true,
          preserveSession: true,
          phase: "AUTH_CHECK",
        });
      }

      // Not in maintenance - return login required but with a friendlier message for login page
      return res.status(401).json({
        message: "Authentication required",
        requireLogin: true,
      });
    }

    // Get session data
    const session = sessionResult.rows[0];

    // Set session in request
    req.session = {
      ...session,
      staff: session.staff_id
        ? {
            id: session.staff_id,
            name: session.staff_name,
            job:
              typeof session.staff_job === "string"
                ? JSON.parse(session.staff_job)
                : session.staff_job,
          }
        : null,
    };

    // Expose the authenticated staff id for audit columns (created_by /
    // updated_by / posted_by / cancelled_by) from the same session source.
    req.staffId = session.staff_id || null;
    req.user = session.staff_id ? { id: session.staff_id } : null;

    // Check if we need to update the timestamp (throttled)
    const shouldUpdateTimestamp = isUpdateNeeded(sessionId);

    if (shouldUpdateTimestamp) {
      await pool.query(
        "UPDATE active_sessions SET last_active = CURRENT_TIMESTAMP WHERE session_id = $1",
        [sessionId]
      );

      recordUpdateTime(sessionId);
    }

    next();
  } catch (error) {
    // Handle database errors
    if (
      error.code === "42P01" || // relation does not exist
      error.code === "08006" || // connection lost
      error.code === "57P01" || // database unavailable
      error.code === "ECONNREFUSED"
    ) {
      return res.status(503).json({
        error: "Service temporarily unavailable",
        message:
          "System maintenance in progress. Please try again in a few moments.",
        maintenance: true,
        preserveSession: true,
        requireReconnect: true,
      });
    }

    console.error("Auth middleware error:", error);
    res.status(500).json({
      message: "Authentication failed",
      maintenance: false,
      preserveSession: false,
      requireReconnect: true,
    });
  }
};

// Helper function to store session ID objects as keys for WeakMap
const sessionIdCache = new Map();

// Check if an update is needed based on time elapsed
function isUpdateNeeded(sessionId) {
  // Get the cached key object for this sessionId
  let keyObj = sessionIdCache.get(sessionId);
  if (!keyObj) {
    keyObj = { id: sessionId };
    sessionIdCache.set(sessionId, keyObj);
  }

  const lastUpdate = sessionLastUpdated.get(keyObj) || 0;
  const now = Date.now();

  // If enough time has passed since the last update, an update is needed
  return now - lastUpdate > MIN_SESSION_UPDATE_INTERVAL;
}

// Record the time of the update
function recordUpdateTime(sessionId) {
  const keyObj = sessionIdCache.get(sessionId);
  if (keyObj) {
    sessionLastUpdated.set(keyObj, Date.now());
  }
}
