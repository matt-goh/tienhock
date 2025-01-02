// src/routes/auth/auth.js
import bcrypt from 'bcryptjs'
import express from 'express'

export default function authRouter(pool) {
  const router = express.Router();

  // Login endpoint
  router.post('/login', async (req, res) => {
    const { ic_no, password } = req.body;
    
    try {
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
  
      const isValidPassword = await bcrypt.compare(password, staff.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Incorrect password' });
      }
  
      // End existing sessions and create new one in a single transaction
      const sessionId = req.body.sessionId || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await pool.query('BEGIN');
      try {
        // End existing sessions
        await pool.query(
          'UPDATE active_sessions SET status = $1 WHERE staff_id = $2 AND status = $3',
          ['ended', staff.id, 'active']
        );
    
        // Create new session
        await pool.query(
          'INSERT INTO active_sessions (session_id, staff_id, last_active) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [sessionId, staff.id]
        );
        
        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
  
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