// src/middleware/auth.js
export const authMiddleware = (pool) => async (req, res, next) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
      return res.status(401).json({ message: 'No session ID provided' });
    }
  
    try {
      const sessionQuery = `
        SELECT 
          s.*,
          st.name as staff_name,
          st.job as staff_job 
        FROM active_sessions s
        LEFT JOIN staffs st ON s.staff_id = st.id
        WHERE s.session_id = $1 
          AND s.status = 'active'
          AND s.last_active > NOW() - INTERVAL '24 hours'
      `;
      
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      
      if (sessionResult.rows.length === 0) {
        return res.status(401).json({ message: 'Session expired or invalid' });
      }
  
      // Update last_active timestamp
      await pool.query(
        'UPDATE active_sessions SET last_active = CURRENT_TIMESTAMP WHERE session_id = $1',
        [sessionId]
      );
  
      const session = sessionResult.rows[0];
      req.session = {
        ...session,
        staff: session.staff_id ? {
          id: session.staff_id,
          name: session.staff_name,
          job: typeof session.staff_job === 'string' ? JSON.parse(session.staff_job) : session.staff_job
        } : null
      };
      
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(401).json({ message: 'Authentication failed' });
    }
  };