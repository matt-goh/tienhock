// src/routes/auth/auth.js
import bcrypt from 'bcryptjs'
import express from 'express'

export default function authRouter(pool) {
  const router = express.Router();

  // Login endpoint
  router.post('/login', async (req, res) => {
    const { ic_no, password } = req.body;
    
    try {
      // Verify staff credentials
      const staffQuery = `
        SELECT 
          s.id, 
          s.name, 
          s.password,
          s.ic_no,
          s.job
        FROM staffs s
        WHERE s.ic_no = $1
          AND s.job ? 'OFFICE'
          AND (date_resigned IS NULL OR date_resigned > CURRENT_DATE)
      `;
      
      const staffResult = await pool.query(staffQuery, [ic_no]);
      
      if (staffResult.rows.length === 0) {
        return res.status(401).json({ message: 'IC number not found' });
      }
  
      const staff = staffResult.rows[0];
      
      if (!staff.password) {
        return res.status(401).json({ message: 'Password not set' });
      }
  
      // Compare password
      const isValidPassword = await bcrypt.compare(password, staff.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Incorrect password' });
      }
  
      // First, end any existing active sessions for this staff
      await pool.query(
        'DELETE FROM active_sessions WHERE staff_id = $1 AND status = \'active\'', 
        [staff.id]
      );
  
      // Create session with the frontend-generated session ID
      const sessionId = req.body.sessionId || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
      const sessionQuery = `
        INSERT INTO active_sessions (session_id, staff_id, last_active)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING *
      `;
  
      await pool.query(sessionQuery, [sessionId, staff.id]);
  
      res.json({
        message: 'Login successful',
        sessionId,
        user: {
          id: staff.id,
          name: staff.name,
          ic_no: staff.ic_no,
          job: typeof staff.job === 'string' ? JSON.parse(staff.job) : staff.job
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Error during login' });
    }
  });

  router.get('/validate-session', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    console.log('Validating Session Full Details:', {
      sessionId,
      sessionIdType: typeof sessionId,
      timestamp: new Date().toISOString()
    });
  
    if (!sessionId) {
      return res.status(401).json({ 
        message: 'No session ID provided',
        requireLogin: true 
      });
    }
  
    try {
      // First, try to find the session directly
      const query = `
        SELECT 
          session_id,
          staff_id,
          last_active,
          status
        FROM active_sessions
        WHERE session_id = $1
      `;
      
      const result = await pool.query(query, [sessionId]);
      
      console.log('Session Query Details:', {
        rowCount: result.rows.length,
        session: result.rows[0]
      });
  
      if (result.rows.length > 0) {
        const session = result.rows[0];
        
        // Check if session is active within 7 days
        const lastActiveDate = new Date(session.last_active);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
        if (lastActiveDate > sevenDaysAgo) {
          // If staff_id is null, it's an unregistered session
          if (!session.staff_id) {
            return res.status(401).json({ 
              message: 'Unregistered session',
              requireLogin: true
            });
          }
  
          // Fetch staff details
          const staffQuery = `
            SELECT 
              id, 
              name, 
              ic_no,
              job
            FROM staffs
            WHERE id = $1
          `;
  
          const staffResult = await pool.query(staffQuery, [session.staff_id]);
  
          if (staffResult.rows.length === 0) {
            return res.status(401).json({ 
              message: 'Staff not found',
              requireLogin: true 
            });
          }
  
          const staff = staffResult.rows[0];
  
          // Update last_active to keep session alive
          await pool.query(
            'UPDATE active_sessions SET last_active = CURRENT_TIMESTAMP WHERE session_id = $1',
            [sessionId]
          );
  
          // Format the user data
          const user = {
            id: staff.id,
            name: staff.name,
            ic_no: staff.ic_no,
            job: typeof staff.job === 'string' ? JSON.parse(staff.job) : staff.job
          };
  
          return res.json({ user });
        }
      }
  
      // If no valid session found
      return res.status(401).json({ 
        message: 'Session expired',
        requireLogin: true 
      });
    } catch (error) {
      console.error('Detailed Session Validation Error:', error);
      res.status(500).json({ 
        message: 'Error validating session',
        requireLogin: true 
      });
    }
  });

  // Set/Reset password endpoint
  router.post('/set-password', async (req, res) => {
    const { ic_no, password } = req.body;
    
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const query = `
        UPDATE staffs 
        SET password = $1 
        WHERE ic_no = $2 
        RETURNING id, name, ic_no
      `;
      
      const result = await pool.query(query, [hashedPassword, ic_no]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Staff not found' });
      }
      
      res.json({ 
        message: 'Password updated successfully',
        staff: result.rows[0]
      });
    } catch (error) {
      console.error('Error setting password:', error);
      res.status(500).json({ message: 'Error setting password' });
    }
  });

  router.get('/check-ic/:ic_no', async (req, res) => {
    const { ic_no } = req.params;
  
    try {
      const query = `
        SELECT 
          EXISTS(
            SELECT 1 FROM staffs 
            WHERE ic_no = $1 
            AND job ? 'OFFICE'
            AND (date_resigned IS NULL OR date_resigned > CURRENT_DATE)
          ) as exists,
          (
            SELECT password IS NOT NULL 
            FROM staffs 
            WHERE ic_no = $1
            AND job ? 'OFFICE'
            AND (date_resigned IS NULL OR date_resigned > CURRENT_DATE)
          ) as has_password
      `;
      
      const result = await pool.query(query, [ic_no]);
      res.json({ 
        exists: result.rows[0].exists,
        hasPassword: result.rows[0].has_password || false
      });
    } catch (error) {
      console.error('Error checking IC:', error);
      res.status(500).json({ message: 'Error checking IC number' });
    }
  });

  return router;
}