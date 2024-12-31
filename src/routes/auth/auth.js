// src/routes/auth/auth.js
import bcrypt from 'bcrypt';

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

  return router;
}