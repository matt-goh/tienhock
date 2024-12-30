// src/routes/profile.js
import { Router } from 'express';

export default function(pool) {
  const router = Router();

  // Get office staff for profile switching
  router.get('/staffs/office', async (req, res) => {
    try {
      const query = `
        SELECT 
          s.id,
          s.name,
          s.job
        FROM 
          staffs s
        WHERE 
          s.job::jsonb ? 'OFFICE'
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
        ORDER BY 
          s.name
      `;
      
      const result = await pool.query(query);
      
      if (!result.rows) {
        return res.status(404).json({ message: 'No office staff found' });
      }

      // Fix: Properly parse the job field if it's a JSON string
      const staffs = result.rows.map(staff => ({
        ...staff,
        job: typeof staff.job === 'string' ? JSON.parse(staff.job) : 
             Array.isArray(staff.job) ? staff.job : 
             typeof staff.job === 'object' ? staff.job : []
      }));

      res.json(staffs);
    } catch (error) {
      console.error('Error fetching office staff:', error);
      res.status(500).json({ 
        message: 'Error fetching office staff', 
        error: error.message 
      });
    }
  });

  // Switch profile
  router.post('/switch-profile', async (req, res) => {
    const { staffId, sessionId, deviceInfo } = req.body;

    try {
      // Verify the staff exists and is an office staff
      const staffQuery = `
        SELECT 
          s.id, 
          s.name, 
          s.job
        FROM 
          staffs s
        WHERE 
          s.id = $1 
          AND s.job::jsonb ? 'OFFICE'
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
      `;
      
      const result = await pool.query(staffQuery, [staffId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Staff not found or not authorized' });
      }

      // Update the session with new staff ID
      const sessionQuery = `
        UPDATE active_sessions
        SET staff_id = $1,
            device_info = $2,
            last_active = CURRENT_TIMESTAMP
        WHERE session_id = $3
        RETURNING *
      `;

      await pool.query(sessionQuery, [staffId, deviceInfo, sessionId]);

      // Fix: Properly parse the job field
      const staff = {
        ...result.rows[0],
        job: typeof result.rows[0].job === 'string' ? JSON.parse(result.rows[0].job) : 
             Array.isArray(result.rows[0].job) ? result.rows[0].job :
             typeof result.rows[0].job === 'object' ? result.rows[0].job : []
      };

      res.json({
        message: 'Profile switched successfully',
        staff
      });
    } catch (error) {
      console.error('Error switching profile:', error);
      res.status(500).json({ 
        message: 'Error switching profile', 
        error: error.message 
      });
    }
  });

  return router;
}