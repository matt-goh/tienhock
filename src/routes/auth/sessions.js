// routes/sessions.js
import { Router } from "express";

export default function(pool) {
  const router = Router();

  // Set up session cleanup interval
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  setInterval(async () => {
    try {
      await pool.query('SELECT cleanup_old_sessions($1)', [24]); 
      console.log('Cleaned up old sessions');
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
    }
  }, CLEANUP_INTERVAL);

  // Validate session header middleware
  const validateSessionHeader = (req, res, next) => {
    const sessionId = req.headers['x-session-id'];
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
        st.ic_no,
        st.job as staff_job
      FROM updated_session s
      LEFT JOIN staffs st ON s.staff_id = st.id
    `;

    try {
      const result = await pool.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        return res.status(401).json({ 
          message: "Session expired or not found",
          requireLogin: true 
        });
      }

      const session = result.rows[0];
      const hasActiveProfile = !!session.staff_id;

      const staff = hasActiveProfile ? {
        id: session.staff_id,
        name: session.staff_name,
        ic_no: session.ic_no,
        job: typeof session.staff_job === 'string' ? JSON.parse(session.staff_job) : session.staff_job
      } : null;

      res.json({
        hasActiveProfile,
        staff,
        session: {
          id: session.session_id,
          lastActive: session.last_active,
          status: session.status
        }
      });
    } catch (error) {
      console.error("Failed to get session state:", error);
      res.status(500).json({ error: "Failed to get session state" });
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
        return res.status(404).json({ error: "Session not found or already ended" });
      }

      res.json({
        message: "Session ended successfully",
        session: result.rows[0]
      });
    } catch (error) {
      console.error("Failed to end session:", error);
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  return router;
}