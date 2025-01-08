const ALLOWED_API_KEY = 'foodmaker';

export const authMiddleware = (pool) => async (req, res, next) => {
  // Skip auth check for backup routes and OPTIONS requests
  if (req.path.startsWith('/api/backup') || req.method === 'OPTIONS') {
    return next();
  }

  // Check if system is in maintenance mode
  if (pool.pool.maintenanceMode) {
    return res.status(200).json({
      status: 'maintenance',
      message: 'System is currently undergoing maintenance.',
      maintenance: true,
      preserveSession: true
    });
  }

  const sessionId = req.headers['x-session-id'];
  const apiKey = req.headers['api-key'];

  if (!sessionId && !apiKey) {
    return res.status(401).json({ message: 'No session ID or API key provided' });
  }

  try {
    // API Key validation
    if (apiKey) {
      if (apiKey !== ALLOWED_API_KEY) {
        return res.status(401).json({ message: 'Invalid API key' });
      }
      req.apiKey = apiKey;
      return next();
    }

    // Session validation
    try {
      // First, check if the database is accessible
      try {
        await pool.query('SELECT 1');
      } catch (error) {
        console.log('Database connectivity check failed:', error);
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'System maintenance in progress. Please try again in a few moments.',
          maintenance: true,
          preserveSession: true
        });
      }

      const sessionQuery = `
        SELECT 
          s.*,
          st.name as staff_name,
          st.job as staff_job 
        FROM active_sessions s
        LEFT JOIN staffs st ON s.staff_id = st.id
        WHERE s.session_id = $1 
          AND s.status = 'active'
          AND s.last_active > NOW() - INTERVAL '7 days'
      `;

      const sessionResult = await pool.query(sessionQuery, [sessionId]);

      if (sessionResult.rows.length === 0) {
        // Check if we're in maintenance mode
        if (pool.pool.maintenanceMode) {
          console.log('Auth middleware: System in maintenance mode');
          return res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'System maintenance in progress. Please try again in a few moments.',
            maintenance: true,
            preserveSession: true,
            phase: 'AUTH_CHECK'
          });
        }
        
        // Not in maintenance mode, session is actually invalid
        return res.status(401).json({ 
          message: 'Session expired or invalid',
          maintenance: false,
          requireLogin: true
        });
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
      // Special handling for database maintenance errors
      if (error.code === '42P01' || // relation does not exist
          error.code === '08006' || // connection lost
          error.code === '57P01' || // database unavailable
          error.code === 'ECONNREFUSED') {
        console.log('Database unavailable - likely during restore process:', error);
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'System maintenance in progress. Please try again in a few moments.',
          maintenance: true,
          preserveSession: true
        });
      }
      throw error; // Re-throw for general error handling
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Authentication failed',
      maintenance: false,
      preserveSession: false
    });
  }
};