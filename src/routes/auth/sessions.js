// routes/sessions.js
import { Router } from "express";

export default function(pool) {
  const router = Router();

  // Set up session cleanup interval
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  setInterval(async () => {
    try {
      await pool.query('SELECT cleanup_old_sessions($1)', [24]); // 24 hours max age
      console.log('Cleaned up old sessions');
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
    }
  }, CLEANUP_INTERVAL);

  // Error handling wrapper
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  // Register session
  router.post("/register", asyncHandler(async (req, res) => {
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
  }));

  // Get active sessions
  router.get("/active", asyncHandler(async (req, res) => {
    const query = `
      SELECT 
        a.session_id,
        a.staff_id,
        a.last_active,
        a.status,
        s.name as staff_name,
        s.job as staff_job
      FROM active_sessions a
      LEFT JOIN staffs s ON a.staff_id = s.id
      WHERE a.status = 'active'
        AND a.last_active > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `;

    try {
      const result = await pool.query(query);
      
      const sessions = result.rows.map(row => ({
        sessionId: row.session_id,
        staffId: row.staff_id,
        staffName: row.staff_name || null,
        lastActive: row.last_active,
        status: row.status,
        job: typeof row.staff_job === 'string' 
          ? JSON.parse(row.staff_job)
          : row.staff_job
      }));

      res.json({
        sessions,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to get active sessions:", error);
      res.status(500).json({ error: "Failed to get active sessions" });
    }
  }));

  // Session heartbeat
  router.post("/:sessionId/heartbeat", asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const query = `
      UPDATE active_sessions 
      SET last_active = CURRENT_TIMESTAMP
      WHERE session_id = $1 AND status = 'active'
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [sessionId]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Session not found or inactive" });
      } else {
        res.json(result.rows[0]);
      }
    } catch (error) {
      console.error("Failed to update session activity:", error);
      res.status(500).json({ error: "Failed to update session activity" });
    }
  }));

  // Check session
  router.post("/check", asyncHandler(async (req, res) => {
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
      console.error("Session check failed:", error);
      res.status(500).json({ error: "Failed to check session" });
    }
  }));

  // Get session state
  router.get("/state/:sessionId", asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const query = `
      SELECT 
        a.*,
        s.id as staff_id,
        s.name as staff_name,
        s.job as staff_job
      FROM active_sessions a
      LEFT JOIN staffs s ON a.staff_id = s.id
      WHERE a.session_id = $1 
        AND a.status = 'active'
        AND a.last_active > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `;

    try {
      const result = await pool.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        res.json({
          hasActiveProfile: false,
          staff: null
        });
        return;
      }

      const session = result.rows[0];
      const hasActiveProfile = !!session.staff_id;

      const staff = hasActiveProfile ? {
        id: session.staff_id,
        name: session.staff_name,
        job: typeof session.staff_job === 'string' 
          ? JSON.parse(session.staff_job)
          : session.staff_job
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
  }));

  // End session
  router.delete("/:sessionId", asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    try {
      const query = `
        UPDATE active_sessions 
        SET status = 'ended'
        WHERE session_id = $1 AND status = 'active'
        RETURNING *
      `;

      const result = await pool.query(query, [sessionId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: "Session not found or already ended" 
        });
      }

      res.json({
        message: "Session ended successfully",
        session: result.rows[0]
      });
    } catch (error) {
      console.error("Failed to end session:", error);
      res.status(500).json({ 
        error: "Failed to end session" 
      });
    }
  }));

  return router;
}