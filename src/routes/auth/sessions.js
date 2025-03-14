// routes/sessions.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Set up session cleanup interval
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  setInterval(async () => {
    try {
      await pool.query("SELECT cleanup_old_sessions($1)", [24]);
      console.log("Cleaned up old sessions");
    } catch (error) {
      console.error("Error cleaning up sessions:", error);
    }
  }, CLEANUP_INTERVAL);

  // Validate session header middleware
  const validateSessionHeader = (req, res, next) => {
    const sessionId = req.headers["x-session-id"];
    if (!sessionId) {
      return res.status(401).json({ error: "Session ID header required" });
    }
    req.sessionId = sessionId;
    next();
  };

  // Register session
  router.post("/register", async (req, res) => {
    const { sessionId, staffId = null } = req.body;

    const query = `
      INSERT INTO active_sessions (session_id, staff_id)
      VALUES ($1, $2)
      ON CONFLICT (session_id) 
      DO UPDATE SET
        staff_id = EXCLUDED.staff_id,
        last_active = CURRENT_TIMESTAMP,
        status = 'active'
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [sessionId, staffId]);
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Session registration failed:", error);
      res.status(500).json({ error: "Failed to register session" });
    }
  });

  // Get session state (validate-session, check, and state endpoints)
  router.get("/state/:sessionId", validateSessionHeader, async (req, res) => {
    const { sessionId } = req.params;

    if (sessionId !== req.sessionId) {
      return res.status(401).json({ error: "Session ID mismatch" });
    }

    try {
      const query = `
        WITH updated_session AS (
          UPDATE active_sessions 
          SET last_active = CURRENT_TIMESTAMP
          WHERE session_id = $1 
            AND status = 'active'
            AND last_active > CURRENT_TIMESTAMP - INTERVAL '7 days'
          RETURNING *
        )
        SELECT 
          s.*,
          st.id as staff_id,
          st.name as staff_name,
          st.job as staff_job
        FROM updated_session s
        LEFT JOIN staffs st ON s.staff_id = st.id
      `;

      const result = await pool.query(query, [sessionId]);

      if (result.rows.length === 0) {
        return res.status(401).json({
          message: "Session expired or not found",
          requireLogin: true,
          code: "SESSION_NOT_FOUND",
        });
      }

      const session = result.rows[0];
      const staffData = session.staff_id
        ? {
            id: session.staff_id,
            name: session.staff_name,
            job: Array.isArray(session.staff_job)
              ? session.staff_job
              : typeof session.staff_job === "string"
              ? JSON.parse(session.staff_job)
              : null,
          }
        : null;

      return res.json({
        hasActiveProfile: !!session.staff_id,
        staff: staffData,
        lastActive: session.last_active,
        status: session.status,
      });
    } catch (error) {
      console.error("Session state check failed:", error);
      return res.status(500).json({
        error: "Failed to check session state",
        code: "SERVER_ERROR",
        requireLogin: true,
      });
    }
  });

  // End session
  router.delete("/:sessionId", validateSessionHeader, async (req, res) => {
    const { sessionId } = req.params;
    if (sessionId !== req.sessionId) {
      return res.status(401).json({ error: "Session ID mismatch" });
    }

    try {
      const query = `
        UPDATE active_sessions 
        SET status = 'ended'
        WHERE session_id = $1 AND status = 'active'
        RETURNING *
      `;

      const result = await pool.query(query, [sessionId]);

      if (result.rows.length === 0) {
        // Instead of returning an error, return success with a message
        return res.json({
          message: "Session already ended or not found",
          status: "success",
        });
      }

      res.json({
        message: "Session ended successfully",
        session: result.rows[0],
      });
    } catch (error) {
      console.error("Failed to end session:", error);
      // Return success even on error to avoid client-side problems
      res.status(200).json({
        message: "Session state cleared",
        error: error.message,
        status: "partialSuccess",
      });
    }
  });

  return router;
}
