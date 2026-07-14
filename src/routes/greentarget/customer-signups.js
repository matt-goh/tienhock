// src/routes/greentarget/customer-signups.js
// Public Green Target customer registration form + authenticated staff review queue.
// Only the root POST stays unauthenticated for greentarget.tienhock.com.
import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import GTEInvoiceApiClientFactory from "../../utils/greenTarget/einvoice/GTEInvoiceApiClientFactory.js";

const PAYMENT_METHODS = ["cash", "online", "qr"];
const MAX_SIGNUP_LOCATIONS = 20;
const ID_TYPES = ["BRN", "NRIC", "PASSPORT", "ARMY"];
const GT_STATE_CODE = "12";
const PAYMENT_LABELS = {
  cash: "Tunai",
  online: "Online Transfer",
  qr: "QR",
};

// Tiny in-memory rate limiter for the public submit endpoint (no external dependency).
// Single Node process in production; the map resets on restart, which is acceptable.
const RATE_LIMIT_MAX = 5; // submissions
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes
const submissionsByIp = new Map();

// Periodic sweep so the map does not grow unbounded.
const sweep = setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of submissionsByIp.entries()) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) submissionsByIp.delete(ip);
    else submissionsByIp.set(ip, recent);
  }
}, RATE_LIMIT_WINDOW_MS);
sweep.unref();

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "";
};

const isRateLimited = (ip) => {
  if (!ip) return false;
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  const timestamps = (submissionsByIp.get(ip) || []).filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    submissionsByIp.set(ip, timestamps);
    return true;
  }
  timestamps.push(Date.now());
  submissionsByIp.set(ip, timestamps);
  return false;
};

/**
 * @param {unknown} value
 * @returns {{ site: string, address: string }[]}
 */
const normalizeLocations = (value) => {
  if (!Array.isArray(value)) return [];

  return value.map((location) => ({
    site: String(location?.site || "").trim(),
    address: String(location?.address || "").trim(),
  }));
};

export default function (pool, myInvoisConfig) {
  const router = Router();
  const requireStaffSession = authMiddleware(pool);
  const apiClient = myInvoisConfig
    ? GTEInvoiceApiClientFactory.getInstance(myInvoisConfig)
    : null;

  // Public: submit a signup request
  router.post("/", async (req, res) => {
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return res.status(429).json({
        message: "Too many submissions. Please try again later.",
      });
    }

    const name = String(req.body.name || "").trim();
    const id_number = String(req.body.id_number || "").trim();
    const phone_number = String(req.body.phone_number || "").trim();
    const payment_method = String(req.body.payment_method || "").trim();
    if (
      !Array.isArray(req.body.locations) ||
      req.body.locations.length === 0 ||
      req.body.locations.length > MAX_SIGNUP_LOCATIONS
    ) {
      return res.status(400).json({
        message: `Provide between 1 and ${MAX_SIGNUP_LOCATIONS} locations`,
      });
    }
    if (
      req.body.locations.some(
        (location) =>
          typeof location !== "object" ||
          location === null ||
          Array.isArray(location) ||
          typeof location.site !== "string" ||
          typeof location.address !== "string"
      )
    ) {
      return res.status(400).json({
        message: "Every location must contain a text site and address",
      });
    }
    const locations = normalizeLocations(req.body.locations);
    const einvoice_requested = req.body.einvoice_requested === true;
    // Cached forms from before this field was separated still send only id_number.
    const rawEinvoiceIdNumber = Object.prototype.hasOwnProperty.call(
      req.body,
      "einvoice_id_number"
    )
      ? req.body.einvoice_id_number
      : req.body.id_number;
    const einvoice_id_number = String(rawEinvoiceIdNumber || "").trim();
    const tin_number = String(req.body.tin_number || "").trim();
    const id_type = String(req.body.id_type || "").trim().toUpperCase();
    const email = String(req.body.email || "").trim();

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!id_number) {
      return res.status(400).json({ message: "IC or company number is required" });
    }
    if (!phone_number) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    if (locations.length === 0) {
      return res.status(400).json({ message: "At least one location is required" });
    }
    if (locations.some((location) => !location.site || !location.address)) {
      return res.status(400).json({
        message: "A site and address are required for every location",
      });
    }
    if (!PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ message: "A valid payment method is required" });
    }
    if (
      name.length > 255 ||
      id_number.length > 50 ||
      einvoice_id_number.length > 50 ||
      phone_number.length > 20 ||
      locations.some(
        (location) => location.site.length > 100 || location.address.length > 255
      ) ||
      tin_number.length > 20 ||
      email.length > 255
    ) {
      return res.status(400).json({ message: "One or more fields exceed the maximum length" });
    }

    let einvoiceValidatedAt = null;
    if (einvoice_requested) {
      if (!ID_TYPES.includes(id_type) || !einvoice_id_number || !tin_number) {
        return res.status(400).json({
          code: "EINVOICE_FIELDS_REQUIRED",
          message: "Complete the e-Invoice ID Type, ID Number and TIN",
        });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          code: "INVALID_EMAIL",
          message: "Enter a valid e-mail address",
        });
      }
      if (!apiClient) {
        return res.status(503).json({
          code: "EINVOICE_VALIDATION_UNAVAILABLE",
          message: "e-Invoice validation is temporarily unavailable",
        });
      }

      try {
        await apiClient.makeApiCall(
          "GET",
          `/api/v1.0/taxpayer/validate/${encodeURIComponent(
            tin_number
          )}?idType=${encodeURIComponent(id_type)}&idValue=${encodeURIComponent(
            einvoice_id_number
          )}`
        );
        einvoiceValidatedAt = new Date();
      } catch (error) {
        const status = Number(error?.status || 500);
        const isInvalidIdentity = status === 400 || status === 404;
        return res.status(isInvalidIdentity ? 422 : 503).json({
          code: isInvalidIdentity
            ? "EINVOICE_IDENTITY_INVALID"
            : "EINVOICE_VALIDATION_UNAVAILABLE",
          message: isInvalidIdentity
            ? "The TIN and identity number could not be verified"
            : "e-Invoice validation is temporarily unavailable",
        });
      }
    }

    try {
      const result = await pool.query(
        `INSERT INTO greentarget.customer_signups
           (name, id_number, phone_number, address, payment_method, submitted_ip,
            locations, einvoice_requested, einvoice_id_number, tin_number, id_type,
            email, state, einvoice_validated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14)
         RETURNING signup_id`,
        [
          name,
          id_number,
          phone_number,
          locations[0].address,
          payment_method,
          ip || null,
          JSON.stringify(locations),
          einvoice_requested,
          einvoice_requested ? einvoice_id_number : null,
          einvoice_requested ? tin_number : null,
          einvoice_requested ? id_type : null,
          einvoice_requested && email ? email : null,
          einvoice_requested ? GT_STATE_CODE : null,
          einvoiceValidatedAt,
        ]
      );

      res.status(201).json({
        message: "Signup submitted successfully",
        signup_id: result.rows[0].signup_id,
      });
    } catch (error) {
      console.error("Error creating Green Target customer signup:", error);
      res.status(500).json({
        message: "Error submitting signup",
        error: error.message,
      });
    }
  });

  // Staff: list signups (optional status filter)
  router.get("/", requireStaffSession, async (req, res) => {
    const { status } = req.query;
    try {
      let query = `
        SELECT signup_id, name, id_number, phone_number, address, locations,
               einvoice_requested,
               payment_method, status, customer_id,
               submitted_at, processed_at, processed_by
        FROM greentarget.customer_signups
      `;
      const params = [];
      if (status) {
        query += " WHERE status = $1";
        params.push(status);
      }
      query += " ORDER BY submitted_at DESC";

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target customer signups:", error);
      res.status(500).json({
        message: "Error fetching signups",
        error: error.message,
      });
    }
  });

  // Staff: convert a pending signup into a real customer (+ location for the address)
  router.post("/:id/convert", requireStaffSession, async (req, res) => {
    const { id } = req.params;
    const staffId = req.session?.staff_id || null;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const signupResult = await client.query(
        `SELECT * FROM greentarget.customer_signups WHERE signup_id = $1 FOR UPDATE`,
        [id]
      );

      if (signupResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Signup not found" });
      }

      const signup = signupResult.rows[0];
      if (signup.status !== "pending") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "This signup has already been processed",
        });
      }

      const paymentLabel = PAYMENT_LABELS[signup.payment_method] || signup.payment_method;
      const additionalInfo = `Kaedah pembayaran: ${paymentLabel} (borang pendaftaran awam)`;

      if (
        signup.einvoice_requested &&
        (!signup.tin_number ||
          !signup.id_type ||
          !signup.einvoice_id_number ||
          !signup.einvoice_validated_at)
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "The signup's e-Invoice details are incomplete or unverified",
        });
      }

      const customerResult = await client.query(
        `INSERT INTO greentarget.customers
           (name, phone_number, id_number, tin_number, id_type, email, state,
            additional_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          signup.name,
          signup.phone_number || null,
          signup.einvoice_requested
            ? signup.einvoice_id_number
            : signup.id_number || null,
          signup.einvoice_requested ? signup.tin_number : null,
          signup.einvoice_requested ? signup.id_type : null,
          signup.einvoice_requested ? signup.email || null : null,
          GT_STATE_CODE,
          additionalInfo,
        ]
      );

      const customer = customerResult.rows[0];

      const signupLocations = normalizeLocations(signup.locations);
      if (signupLocations.length === 0 && signup.address) {
        signupLocations.push({ site: "", address: String(signup.address).trim() });
      }

      for (const location of signupLocations) {
        if (!location.address) continue;
        await client.query(
          `INSERT INTO greentarget.locations
             (customer_id, site, address, phone_number)
           VALUES ($1, $2, $3, $4)`,
          [
            customer.customer_id,
            location.site || null,
            location.address,
            signup.phone_number || null,
          ]
        );
      }

      await client.query(
        `UPDATE greentarget.customer_signups
         SET status = 'processed', processed_at = NOW(), processed_by = $1, customer_id = $2
         WHERE signup_id = $3`,
        [staffId, customer.customer_id, id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        message: "Customer created successfully",
        customer,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error converting Green Target customer signup:", error);
      res.status(500).json({
        message: "Error converting signup",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Staff: update signup status (reject / restore to pending)
  router.patch("/:id", requireStaffSession, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      const result = await pool.query(
        `UPDATE greentarget.customer_signups
         SET status = $1
         WHERE signup_id = $2
           AND status IS DISTINCT FROM 'processed'
         RETURNING signup_id, status`,
        [status, id]
      );

      if (result.rows.length === 0) {
        const existing = await pool.query(
          `SELECT status
             FROM greentarget.customer_signups
            WHERE signup_id = $1`,
          [id]
        );
        if (existing.rows.length === 0) {
          return res.status(404).json({ message: "Signup not found" });
        }
        return res.status(409).json({
          message: "Cannot change the status of a processed signup",
        });
      }

      res.json({
        message: "Signup updated successfully",
        signup: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating Green Target customer signup:", error);
      res.status(500).json({
        message: "Error updating signup",
        error: error.message,
      });
    }
  });

  // Staff: permanently delete a rejected signup only
  router.delete("/:id", requireStaffSession, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `DELETE FROM greentarget.customer_signups
         WHERE signup_id = $1
           AND status = 'rejected'
         RETURNING signup_id`,
        [id]
      );

      if (result.rows.length === 0) {
        const existing = await pool.query(
          `SELECT status
           FROM greentarget.customer_signups
           WHERE signup_id = $1`,
          [id]
        );

        if (existing.rows.length === 0) {
          return res.status(404).json({ message: "Signup not found" });
        }

        return res.status(409).json({
          message: "Only rejected signup requests can be deleted",
        });
      }

      res.json({ message: "Rejected signup deleted successfully" });
    } catch (error) {
      console.error("Error deleting Green Target customer signup:", error);
      res.status(500).json({
        message: "Error deleting signup",
        error: error.message,
      });
    }
  });

  return router;
}
