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
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
      `;
      
      const staffResult = await pool.query(staffQuery, [ic_no]);
      
      if (staffResult.rows.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const staff = staffResult.rows[0];
      
      if (!staff.password) {
        return res.status(401).json({ message: 'Password not set' });
      }

      // Compare password
      const isValidPassword = await bcrypt.compare(password, staff.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Create new session
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        deviceType: /Mobile|Android|iPhone/i.test(req.headers['user-agent']) ? 'Mobile' : 'Desktop',
        timestamp: new Date().toISOString()
      };

      const sessionQuery = `
        INSERT INTO active_sessions (session_id, staff_id, device_info)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const sessionResult = await pool.query(sessionQuery, [sessionId, staff.id, deviceInfo]);

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
    
    if (!sessionId) {
      return res.status(401).json({ message: 'No session ID provided' });
    }
  
    try {
      const query = `
        SELECT 
          session_id,
          staff_id,
          last_active,
          status
        FROM active_sessions
        WHERE session_id = $1 
          AND status = 'active'
          AND last_active > NOW() - INTERVAL '24 hours'
      `;
      
      const result = await pool.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        // If no active session found, create a new one
        const newSessionQuery = `
          INSERT INTO active_sessions (session_id, status)
          VALUES ($1, 'active')
          RETURNING *
        `;
        
        const newSessionResult = await pool.query(newSessionQuery, [sessionId]);
        
        return res.status(200).json({ 
          user: null,
          message: 'Unregistered session created',
          sessionId: newSessionResult.rows[0].session_id
        });
      }
  
      const session = result.rows[0];
      
      // If staff_id is null, it's an unregistered session
      if (!session.staff_id) {
        return res.status(200).json({ 
          user: null,
          message: 'Unregistered session exists' 
        });
      }
  
      // If staff_id exists, fetch staff details
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
        return res.status(401).json({ message: 'Staff not found' });
      }
  
      const staff = staffResult.rows[0];
  
      // Keep session alive by updating last_active
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
  
      res.json({ user });
    } catch (error) {
      console.error('Error validating session:', error);
      res.status(500).json({ message: 'Error validating session' });
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

  // In your auth.js routes file
  router.get('/check-ic/:ic_no', async (req, res) => {
    const { ic_no } = req.params;

    try {
      const query = `
        SELECT EXISTS(
          SELECT 1 FROM staffs 
          WHERE ic_no = $1 
          AND job ? 'OFFICE'
          AND (date_resigned IS NULL OR date_resigned > CURRENT_DATE)
        )
      `;
      
      const result = await pool.query(query, [ic_no]);
      res.json({ exists: result.rows[0].exists });
    } catch (error) {
      console.error('Error checking IC:', error);
      res.status(500).json({ message: 'Error checking IC number' });
    }
  });

  return router;
}