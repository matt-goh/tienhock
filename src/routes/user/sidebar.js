// src/routes/sidebar.js
import { Router } from 'express';

export default function(pool) {
  const router = Router();

  // Get bookmarks for a staff member
  router.get('/:staffId', async (req, res) => {
    const { staffId } = req.params;
    
    try {
      const query = `
        SELECT id, name
        FROM bookmarks
        WHERE staff_id = $1
        ORDER BY staff_id DESC
      `;
      const result = await pool.query(query, [staffId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
      res.status(500).json({ 
        message: 'Error fetching bookmarks', 
        error: error.message 
      });
    }
  });

  // Add a bookmark
  router.post('/', async (req, res) => {
    const { staffId, name } = req.body;
    
    try {
      const query = `
        INSERT INTO bookmarks (staff_id, name)
        VALUES ($1, $2)
        RETURNING *
      `;
      const result = await pool.query(query, [staffId, name]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') { // unique violation
        return res.status(400).json({ message: 'This item is already bookmarked' });
      }
      console.error('Error creating bookmark:', error);
      res.status(500).json({ 
        message: 'Error creating bookmark', 
        error: error.message 
      });
    }
  });

  // Remove a bookmark
  router.delete('/:staffId/:name', async (req, res) => {
    const { staffId, name } = req.params;
    
    try {
      const query = 'DELETE FROM bookmarks WHERE staff_id = $1 AND name = $2 RETURNING *';
      const result = await pool.query(query, [staffId, name]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Bookmark not found' });
      }
      
      res.json({ 
        message: 'Bookmark removed successfully', 
        bookmark: result.rows[0] 
      });
    } catch (error) {
      console.error('Error removing bookmark:', error);
      res.status(500).json({ 
        message: 'Error removing bookmark', 
        error: error.message 
      });
    }
  });

  return router;
}