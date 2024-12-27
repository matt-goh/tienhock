// routes/sessions.js
import { Router } from "express";
import { pool } from "../../server.js";

const router = Router();

// Error handling wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Register/check session
router.post("/sessions/check", asyncHandler(async (req, res) => {
  const { sessionId, staffId = null, deviceInfo = {} } = req.body;

  const query = `
    INSERT INTO active_sessions (session_id, staff_id, device_info)
    VALUES ($1, $2, $3)
    ON CONFLICT (session_id) 
    DO UPDATE SET 
      staff_id = EXCLUDED.staff_id,
      device_info = EXCLUDED.device_info,
      last_active = CURRENT_TIMESTAMP,
      status = 'active'
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [sessionId, staffId, deviceInfo]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Session check failed:", error);
    res.status(500).json({ error: "Failed to check session" });
  }
}));

// Get active sessions with their latest events
router.get("/sessions/active", asyncHandler(async (req, res) => {
  const query = `
    WITH session_info AS (
      SELECT 
        a.*,
        e.id as last_event_id,
        e.event_type as last_event_type,
        e.created_at as last_event_time,
        s.name as staff_name,
        s.job as staff_job
      FROM active_sessions a
      LEFT JOIN session_events e ON a.session_id = e.session_id
      LEFT JOIN staffs s ON a.staff_id = s.id
      WHERE a.last_active > CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND a.status = 'active'
      ORDER BY e.created_at DESC
    )
    SELECT DISTINCT ON (session_id)
      session_id,
      staff_id,
      staff_name,
      staff_job,
      device_info,
      last_active,
      status,
      metadata,
      last_event_id,
      last_event_type,
      last_event_time
    FROM session_info
    ORDER BY session_id, last_event_time DESC
  `;

  try {
    const result = await pool.query(query);
    res.json({
      sessions: result.rows.map(row => ({
        ...row,
        staff_job: row.staff_job ? JSON.parse(row.staff_job) : null,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to get active sessions:", error);
    res.status(500).json({ error: "Failed to get active sessions" });
  }
}));

// Session heartbeat/keep-alive
router.post("/sessions/:sessionId/heartbeat", asyncHandler(async (req, res) => {
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

// Switch profile
router.post("/sessions/:sessionId/switch-profile", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { staffId, deviceInfo } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update session with new staff ID
    const sessionQuery = `
      UPDATE active_sessions 
      SET 
        staff_id = $1,
        last_active = CURRENT_TIMESTAMP,
        device_info = $3,
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{last_profile_switch}',
          to_jsonb(CURRENT_TIMESTAMP)
        )
      WHERE session_id = $2 AND status = 'active'
      RETURNING *
    `;

    const sessionResult = await client.query(sessionQuery, [
      staffId,
      sessionId,
      deviceInfo,
    ]);

    if (sessionResult.rows.length === 0) {
      throw new Error("Session not found or inactive");
    }

    // Get staff details
    const staffQuery = `
      SELECT 
        s.id, 
        s.name, 
        s.job
      FROM 
        staffs s
      WHERE 
        s.id = $1 
        AND s.job ? 'OFFICE'
        AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
    `;

    const staffResult = await client.query(staffQuery, [staffId]);

    if (staffResult.rows.length === 0) {
      throw new Error("Staff not found or not authorized");
    }

    // Record the profile switch event
    const eventQuery = `
      INSERT INTO session_events (session_id, event_type, metadata)
      VALUES ($1, 'PROFILE_SWITCH', $2)
    `;

    await client.query(eventQuery, [
      sessionId,
      {
        previous_staff_id: sessionResult.rows[0].staff_id,
        new_staff_id: staffId,
        timestamp: new Date().toISOString(),
      },
    ]);

    await client.query("COMMIT");

    const staff = {
      ...staffResult.rows[0],
      job: typeof staffResult.rows[0].job === "string"
        ? JSON.parse(staffResult.rows[0].job)
        : staffResult.rows[0].job,
    };

    res.json({
      session: sessionResult.rows[0],
      staff,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error switching profile:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to switch profile",
    });
  } finally {
    client.release();
  }
}));

// Get session events (for polling)
router.get("/sessions/events", asyncHandler(async (req, res) => {
  const { lastEventId = 0, limit = 100 } = req.query;

  const query = `
    WITH recent_events AS (
      SELECT 
        e.*,
        s.name as staff_name,
        s.job as staff_job
      FROM session_events e
      LEFT JOIN active_sessions a ON e.session_id = a.session_id
      LEFT JOIN staffs s ON a.staff_id = s.id
      WHERE e.id > $1
      ORDER BY e.id ASC
      LIMIT $2
    )
    SELECT 
      e.*,
      json_build_object(
        'name', e.staff_name,
        'job', CASE 
          WHEN e.staff_job IS NOT NULL THEN 
            CASE 
              WHEN json_typeof(e.staff_job::json) = 'string' 
              THEN e.staff_job::json::text 
              ELSE e.staff_job 
            END
          ELSE NULL 
        END
      ) as staff_info
    FROM recent_events e
  `;

  try {
    const result = await pool.query(query, [lastEventId, limit]);
    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch session events:", error);
    res.status(500).json({ error: "Failed to fetch session events" });
  }
}));

// End session
router.delete("/sessions/:sessionId", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const query = `
      UPDATE active_sessions 
      SET 
        status = 'ended',
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{end_time}',
          to_jsonb(CURRENT_TIMESTAMP)
        )
      WHERE session_id = $1 AND status = 'active'
      RETURNING *
    `;

    const result = await client.query(query, [sessionId]);

    if (result.rows.length === 0) {
      throw new Error("Session not found or already ended");
    }

    // Record the session end event
    const eventQuery = `
      INSERT INTO session_events (session_id, event_type, metadata)
      VALUES ($1, 'SESSION_END', $2)
    `;

    await client.query(eventQuery, [
      sessionId,
      {
        end_time: new Date().toISOString(),
        reason: "USER_INITIATED",
      },
    ]);

    await client.query("COMMIT");

    res.json({
      message: "Session ended successfully",
      session: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to end session:", error);
    res.status(
      error instanceof Error && error.message.includes("not found") ? 404 : 500
    ).json({
      error: error instanceof Error ? error.message : "Failed to end session",
    });
  } finally {
    client.release();
  }
}));

export default router;