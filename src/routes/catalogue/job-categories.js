// src/routes/job-categories.js
import { Router } from 'express';

export default function(pool) {
  const router = Router();

  // Helper function to verify section exists
  async function verifySectionExists(section) {
    const query = 'SELECT name FROM sections WHERE name = $1';
    const result = await pool.query(query, [section]);
    return result.rows.length > 0;
  }

  // Get all job categories
  router.get('/', async (req, res) => {
    try {
      const query = 'SELECT * FROM job_categories';
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching job categories:', error);
      res.status(500).json({ 
        message: 'Error fetching job categories', 
        error: error.message 
      });
    }
  });

  // Create a new job category
  router.post('/', async (req, res) => {
    const { id, category, section, gaji, ikut, jv } = req.body;

    if (!id.trim()) {
      return res.status(400).json({ message: 'Job category ID cannot be empty' });
    }

    try {
      // Check if the section exists
      const sectionExists = await verifySectionExists(section);
      if (!sectionExists) {
        return res.status(400).json({ message: 'Invalid section' });
      }

      const checkDuplicateQuery = 'SELECT id FROM job_categories WHERE id = $1';
      const checkResult = await pool.query(checkDuplicateQuery, [id]);
      
      if (checkResult.rows.length > 0) {
        return res.status(400).json({ message: 'A job category with this ID already exists' });
      }

      const query = `
        INSERT INTO job_categories (id, category, section, gaji, ikut, jv)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const values = [id, category, section, gaji, ikut, jv];

      const result = await pool.query(query, values);
      res.status(201).json({ 
        message: 'Job category created successfully', 
        jobCategory: result.rows[0] 
      });
    } catch (error) {
      console.error('Error creating job category:', error);
      res.status(500).json({ 
        message: 'Error creating job category', 
        error: error.message 
      });
    }
  });

  // Delete job categories (batch delete)
  router.delete('/', async (req, res) => {
    const { jobCategoryIds } = req.body;

    if (!Array.isArray(jobCategoryIds) || jobCategoryIds.length === 0) {
      return res.status(400).json({ message: 'Invalid job category IDs provided' });
    }

    try {
      const query = 'DELETE FROM job_categories WHERE id = ANY($1) RETURNING id';
      const result = await pool.query(query, [jobCategoryIds]);

      const deletedIds = result.rows.map(row => row.id);
      res.status(200).json({ 
        message: 'Job categories deleted successfully', 
        deletedJobCategoryIds: deletedIds 
      });
    } catch (error) {
      console.error('Error deleting job categories:', error);
      res.status(500).json({ 
        message: 'Error deleting job categories', 
        error: error.message 
      });
    }
  });

  // Batch update/insert job categories
  router.post('/batch', async (req, res) => {
    const { jobCategories } = req.body;

    if (!Array.isArray(jobCategories)) {
      return res.status(400).json({ message: 'Invalid input: jobCategories must be an array' });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const processedJobCategories = [];

        for (const jobCategory of jobCategories) {
          const { id, category, section, gaji, ikut, jv } = jobCategory;
          
          // Verify section exists if provided
          if (section) {
            const sectionExists = await verifySectionExists(section);
            if (!sectionExists) {
              throw new Error(`Invalid section: ${section}`);
            }
          }
          
          const upsertQuery = `
            INSERT INTO job_categories (id, category, section, gaji, ikut, jv)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE
            SET category = EXCLUDED.category,
                section = EXCLUDED.section,
                gaji = EXCLUDED.gaji,
                ikut = EXCLUDED.ikut,
                jv = EXCLUDED.jv
            RETURNING *
          `;
          const upsertValues = [
            id, 
            category || "", 
            section || "", 
            gaji || "", 
            ikut || "", 
            jv || ""
          ];
          const result = await client.query(upsertQuery, upsertValues);
          processedJobCategories.push(result.rows[0]);
        }

        await client.query('COMMIT');
        res.json({ 
          message: 'Job categories processed successfully', 
          jobCategories: processedJobCategories
        });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database error:', error);
        res.status(500).json({ 
          message: 'An error occurred while processing job categories',
          error: error.message 
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Server error:', error);
      res.status(500).json({ message: 'An unexpected error occurred', error: error.message });
    }
  });

  // Update a job category
  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { category, section, gaji, ikut, jv } = req.body;

    try {
      // Verify section exists if being updated
      if (section) {
        const sectionExists = await verifySectionExists(section);
        if (!sectionExists) {
          return res.status(400).json({ message: 'Invalid section' });
        }
      }

      const query = `
        UPDATE job_categories
        SET category = $1, section = $2, gaji = $3, ikut = $4, jv = $5
        WHERE id = $6
        RETURNING *
      `;

      const values = [category, section, gaji, ikut, jv, id];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Job category not found' });
      }

      res.json({
        message: 'Job category updated successfully',
        jobCategory: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating job category:', error);
      res.status(500).json({
        message: 'Error updating job category',
        error: error.message
      });
    }
  });

  return router;
}