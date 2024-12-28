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
    SELECT DISTINCT ON (a.session_id)
      a.session_id,
      a.staff_id,
      a.device_info,
      a.last_active,
      a.status,
      a.metadata,
      s.name as staff_name,
      s.job as staff_job,
      e.id as last_event_id,
      e.event_type as last_event_type,
      e.created_at as last_event_time
    FROM active_sessions a
    LEFT JOIN staffs s ON a.staff_id = s.id
    LEFT JOIN session_events e ON a.session_id = e.session_id
    WHERE a.status = 'active'
      AND a.last_active > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    ORDER BY a.session_id, e.created_at DESC
  `;

  try {
    const result = await pool.query(query);
    
    const sessions = result.rows.map(row => ({
      sessionId: row.session_id,
      staffId: row.staff_id,
      staffName: row.staff_name || null,
      deviceInfo: row.device_info || {
        deviceType: 'Unknown',
        userAgent: 'Unknown Device'
      },
      lastActive: row.last_active,
      status: row.status,
      metadata: row.metadata || {},
      lastEvent: row.last_event_id ? {
        id: row.last_event_id,
        type: row.last_event_type,
        time: row.last_event_time
      } : null
    }));

    // Log the response for debugging
    console.log('Sending sessions:', JSON.stringify(sessions, null, 2));

    res.json({
      sessions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to get active sessions:", error);
    // Include error details in response for debugging
    res.status(500).json({ 
      error: "Failed to get active sessions",
      details: error.message,
      hint: error.hint,
      position: error.position
    });
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
      INSERT INTO session_events (session_id, event_type, data)
      VALUES ($1, 'PROFILE_SWITCH', $2)
    `;

    await client.query(eventQuery, [
      sessionId,
      {
        previous_staff_id: sessionResult.rows[0].staff_id,
        new_staff_id: staffId,
        device_info: deviceInfo,
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
              WHEN jsonb_typeof(e.staff_job) = 'string' 
              THEN e.staff_job #>> '{}'  -- Extract as text
              ELSE e.staff_job::text     -- Convert jsonb to text
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

// Add this route to sessions.js
router.get("/session-state/:sessionId", asyncHandler(async (req, res) => {
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

    // Format staff data if it exists
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
        status: session.status,
        deviceInfo: session.device_info
      }
    });
  } catch (error) {
    console.error("Failed to get session state:", error);
    res.status(500).json({ error: "Failed to get session state" });
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