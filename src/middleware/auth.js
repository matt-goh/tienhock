import { createHash, timingSafeEqual } from "node:crypto";
import { NODE_ENV } from "../configs/config.js";

const MOBILE_API_KEY_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const MOBILE_API_KEY_MIN_LENGTH = 8;
const MOBILE_API_KEY_MAX_LENGTH = 128;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,255}$/;
const MOBILE_API_KEY_HASH = process.env.MOBILE_API_KEY_SHA256?.trim() || "";
const mobileApiKeyDigest = MOBILE_API_KEY_HASH_PATTERN.test(MOBILE_API_KEY_HASH)
  ? Buffer.from(MOBILE_API_KEY_HASH, "hex")
  : null;

const MOBILE_API_ROUTES = new Set([
  "GET /api/staffs/get-salesmen",
  "GET /api/invoices/ids",
  "GET /api/customers/get-customers",
  "GET /api/products",
  "GET /api/customer-products/all",
  "POST /api/invoices/submit-invoices",
  "POST /api/einvoice/submit",
]);
const MOBILE_INVOICE_DELETE_PATH = /^\/api\/invoices\/[a-zA-Z0-9_-]{1,64}$/;
const MIN_SESSION_UPDATE_INTERVAL = 10 * 60 * 1000;

if (NODE_ENV === "production" && !mobileApiKeyDigest) {
  throw new Error(
    "MOBILE_API_KEY_SHA256 must be configured as a 64-character SHA-256 digest"
  );
}

/**
 * @typedef {Object} AuthPool
 * @property {{ maintenanceMode?: boolean }} pool
 * @property {(queryText: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>} query
 */

/**
 * Read exactly one non-empty HTTP header value.
 *
 * @param {import("express").Request} req
 * @param {string} headerName
 * @param {number} maxLength
 * @returns {{ present: boolean, valid: boolean, value: string | null }}
 */
function readSingleHeader(req, headerName, maxLength) {
  const rawValue = req.headers[headerName];
  if (rawValue === undefined) {
    return { present: false, valid: true, value: null };
  }

  const matchingRawHeaders = Array.isArray(req.rawHeaders)
    ? req.rawHeaders.filter(
        (value, index) =>
          index % 2 === 0 && value.toLowerCase() === headerName.toLowerCase()
      ).length
    : 1;

  if (
    matchingRawHeaders !== 1 ||
    typeof rawValue !== "string" ||
    rawValue.length === 0 ||
    rawValue.length > maxLength ||
    rawValue !== rawValue.trim() ||
    rawValue.includes(",")
  ) {
    return { present: true, valid: false, value: null };
  }

  return { present: true, valid: true, value: rawValue };
}

/**
 * @param {string} apiKey
 * @returns {boolean}
 */
function isValidMobileApiKey(apiKey) {
  if (
    !mobileApiKeyDigest ||
    apiKey.length < MOBILE_API_KEY_MIN_LENGTH ||
    apiKey.length > MOBILE_API_KEY_MAX_LENGTH
  ) {
    return false;
  }

  const candidateDigest = createHash("sha256").update(apiKey, "utf8").digest();
  return timingSafeEqual(candidateDigest, mobileApiKeyDigest);
}

/**
 * @param {import("express").Request} req
 * @param {string} requestPath
 * @returns {boolean}
 */
function isAllowedMobileApiRequest(req, requestPath) {
  const canonicalRequestPath =
    requestPath.length > 1 && requestPath.endsWith("/")
      ? requestPath.slice(0, -1)
      : requestPath;
  const routeKey = `${req.method} ${canonicalRequestPath}`;
  const isAllowedRoute =
    MOBILE_API_ROUTES.has(routeKey) ||
    (req.method === "DELETE" &&
      MOBILE_INVOICE_DELETE_PATH.test(canonicalRequestPath));

  if (!isAllowedRoute) {
    return false;
  }

  const queryEntries = Object.entries(req.query || {});
  if (queryEntries.length === 0) {
    return true;
  }

  if (canonicalRequestPath === "/api/customer-products/all") {
    const [queryName, customerId] = queryEntries[0] || [];
    return (
      queryEntries.length === 1 &&
      queryName === "customerId" &&
      typeof customerId === "string" &&
      customerId.length > 0 &&
      customerId.length <= 128 &&
      customerId === customerId.trim() &&
      !/[\u0000-\u001f\u007f]/.test(customerId)
    );
  }

  // The salesman app downloads its product catalogue with the supported
  // read-only filters. Permit only the injection-safe `all` / `includeInactive`
  // flags (both are used as bare booleans by the products route). `type` stays
  // blocked because products.js interpolates it directly into SQL.
  if (canonicalRequestPath === "/api/products") {
    return (
      queryEntries.length >= 1 &&
      queryEntries.length <= 2 &&
      queryEntries.every(([key, value]) => {
        if (key === "all") {
          return value === "" || value === "true" || value === "false";
        }
        if (key === "includeInactive") {
          return value === "true" || value === "false";
        }
        return false;
      })
    );
  }

  const supportsMinimalResponse =
    canonicalRequestPath === "/api/invoices/submit-invoices" ||
    canonicalRequestPath === "/api/einvoice/submit";

  return (
    supportsMinimalResponse &&
    queryEntries.length === 1 &&
    queryEntries[0][0] === "fields" &&
    queryEntries[0][1] === "minimal"
  );
}

/**
 * @param {unknown} lastActive
 * @returns {boolean}
 */
function isSessionActivityStale(lastActive) {
  const lastActiveTime = new Date(
    /** @type {string | number | Date} */ (lastActive)
  ).getTime();
  return (
    !Number.isFinite(lastActiveTime) ||
    Date.now() - lastActiveTime > MIN_SESSION_UPDATE_INTERVAL
  );
}

/**
 * @param {unknown} staffJob
 * @returns {unknown}
 */
function parseStaffJob(staffJob) {
  if (typeof staffJob !== "string") {
    return staffJob;
  }

  try {
    return JSON.parse(staffJob);
  } catch {
    return [];
  }
}

/**
 * Authenticate office sessions and the narrowly scoped salesman mobile client.
 *
 * @param {AuthPool} pool
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<unknown>}
 */
export const authMiddleware = (pool) => async (req, res, next) => {
  const requestPath = req.originalUrl?.split("?")[0] || req.path;
  const hasApiKeyHeader = req.headers["api-key"] !== undefined;
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
    !hasApiKeyHeader &&
    isLoopbackRequest;

  // Routes that intentionally do not require a logged-in office session.
  if (
    (req.method === "GET" && requestPath === "/api/backup/restore/status") ||
    isLocalDevelopmentSqlReplacement ||
    req.method === "OPTIONS"
  ) {
    return next();
  }

  if (pool.pool.maintenanceMode) {
    const statusCode = requestPath.startsWith("/api/backup/") ? 503 : 200;
    return res.status(statusCode).json({
      status: "maintenance",
      message: "System is currently undergoing maintenance.",
      maintenance: true,
      preserveSession: true,
    });
  }

  const apiKeyHeader = readSingleHeader(
    req,
    "api-key",
    MOBILE_API_KEY_MAX_LENGTH
  );
  const sessionHeader = readSingleHeader(req, "x-session-id", 255);

  if (!apiKeyHeader.valid || !sessionHeader.valid) {
    return res.status(401).json({ message: "Invalid authentication header" });
  }

  if (apiKeyHeader.present && sessionHeader.present) {
    return res
      .status(400)
      .json({ message: "Provide only one authentication method" });
  }

  if (apiKeyHeader.present) {
    if (!mobileApiKeyDigest) {
      return res
        .status(503)
        .json({ message: "Mobile API authentication is unavailable" });
    }

    if (!isValidMobileApiKey(/** @type {string} */ (apiKeyHeader.value))) {
      return res.status(401).json({ message: "Invalid API key" });
    }

    if (!isAllowedMobileApiRequest(req, requestPath)) {
      return res
        .status(403)
        .json({ message: "API key is not authorized for this request" });
    }

    // Downstream routes only need to know which authentication mode was used.
    // Never retain the bearer credential on the request object.
    req.apiKey = true;
    return next();
  }

  const sessionId = sessionHeader.value;
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return res.status(401).json({ message: "Valid session ID required" });
  }

  const isSessionInitialization =
    req.method === "POST" && requestPath === "/api/sessions/initialize";

  try {
    try {
      await pool.query("SELECT 1");
    } catch {
      return res.status(503).json({
        error: "Service temporarily unavailable",
        message:
          "System maintenance in progress. Please try again in a few moments.",
        maintenance: true,
        preserveSession: true,
        requireReconnect: true,
      });
    }

    const sessionQuery = `
      SELECT
        s.*,
        st.name as staff_name,
        st.job as staff_job
      FROM active_sessions s
      JOIN staffs st ON st.id = s.staff_id
      WHERE s.session_id = $1
        AND s.staff_id IS NOT NULL
        AND s.status = 'active'
        AND s.last_active > NOW() - INTERVAL '7 days'
        AND st.job ? 'OFFICE'
        AND (st.date_resigned IS NULL OR st.date_resigned > CURRENT_DATE)
    `;

    const sessionResult = await pool.query(sessionQuery, [sessionId]);

    if (sessionResult.rows.length === 0) {
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

      return res.status(401).json({
        message: "Authentication required",
        requireLogin: true,
      });
    }

    const session = sessionResult.rows[0];

    // A restored browser session may refresh itself, but it cannot use the
    // initialization endpoint to switch the session to another staff member.
    if (
      isSessionInitialization &&
      (req.body?.sessionId !== sessionId ||
        typeof req.body?.staffId !== "string" ||
        req.body.staffId !== String(session.staff_id))
    ) {
      return res.status(403).json({ message: "Session identity mismatch" });
    }

    req.session = {
      ...session,
      staff: {
        id: session.staff_id,
        name: session.staff_name,
        job: parseStaffJob(session.staff_job),
      },
    };

    req.staffId = session.staff_id;
    req.user = { id: session.staff_id };

    if (isSessionActivityStale(session.last_active)) {
      await pool.query(
        "UPDATE active_sessions SET last_active = CURRENT_TIMESTAMP WHERE session_id = $1",
        [sessionId]
      );
    }

    return next();
  } catch (error) {
    if (
      error.code === "42P01" ||
      error.code === "08006" ||
      error.code === "57P01" ||
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
    return res.status(500).json({
      message: "Authentication failed",
      maintenance: false,
      preserveSession: false,
      requireReconnect: true,
    });
  }
};
