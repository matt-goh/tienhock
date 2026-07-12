// src/routes/greentarget/customer-signups.js
// Public (unauthenticated) Green Target customer registration form + staff review queue.
// The public POST is served on greentarget.tienhock.com; all other GT routes are
// already unauthenticated at the Express layer, so staff endpoints live here too.
import { Router } from "express";

const PAYMENT_METHODS = ["cash", "online", "qr"];
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

export default function (pool) {
  const router = Router();

  // Public: submit a signup request
  router.post("/", async (req, res) => {
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return res.status(429).json({
        message: "Too many submissions. Please try again later.",
      });
    }

    const name = (req.body.name || "").trim();
    const id_number = (req.body.id_number || "").trim();
    const phone_number = (req.body.phone_number || "").trim();
    const address = (req.body.address || "").trim();
    const payment_method = (req.body.payment_method || "").trim();

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ message: "A valid payment method is required" });
    }
    if (name.length > 255 || id_number.length > 50 || phone_number.length > 30 || address.length > 500) {
      return res.status(400).json({ message: "One or more fields exceed the maximum length" });
    }

    try {
      const result = await pool.query(
        `INSERT INTO greentarget.customer_signups
           (name, id_number, phone_number, address, payment_method, submitted_ip)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING signup_id`,
        [
          name,
          id_number || null,
          phone_number || null,
          address || null,
          payment_method,
          ip || null,
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
  router.get("/", async (req, res) => {
    const { status } = req.query;
    try {
      let query = `
        SELECT signup_id, name, id_number, phone_number, address,
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
  router.post("/:id/convert", async (req, res) => {
    const { id } = req.params;
    const { staffId } = req.body;
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

      const customerResult = await client.query(
        `INSERT INTO greentarget.customers
           (name, phone_number, id_number, state, additional_info)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          signup.name,
          signup.phone_number || null,
          signup.id_number || null,
          "12",
          additionalInfo,
        ]
      );

      const customer = customerResult.rows[0];

      if (signup.address) {
        await client.query(
          `INSERT INTO greentarget.locations (customer_id, address, phone_number)
           VALUES ($1, $2, $3)`,
          [customer.customer_id, signup.address, signup.phone_number || null]
        );
      }

      await client.query(
        `UPDATE greentarget.customer_signups
         SET status = 'processed', processed_at = NOW(), processed_by = $1, customer_id = $2
         WHERE signup_id = $3`,
        [staffId || null, customer.customer_id, id]
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
  router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      const existing = await pool.query(
        `SELECT status FROM greentarget.customer_signups WHERE signup_id = $1`,
        [id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Signup not found" });
      }
      if (existing.rows[0].status === "processed") {
        return res.status(409).json({
          message: "Cannot change the status of a processed signup",
        });
      }

      const result = await pool.query(
        `UPDATE greentarget.customer_signups
         SET status = $1
         WHERE signup_id = $2
         RETURNING *`,
        [status, id]
      );

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

  return router;
}
