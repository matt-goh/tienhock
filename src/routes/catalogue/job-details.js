// src/routes/job-details.js
import { Router } from 'express';

export default function(pool) {
  const router = Router();

  // Get all job details with associated job names
  router.get('/', async (req, res) => {
    try {
      const query = `
        SELECT jd.*, j.name as job_name
        FROM job_details jd
        LEFT JOIN jobs_job_details jjd ON jd.id = jjd.job_detail_id
        LEFT JOIN jobs j ON jjd.job_id = j.id
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching job details:', error);
      res.status(500).json({ message: 'Error fetching job details', error: error.message });
    }
  });

  // Delete multiple job details
  router.delete('/', async (req, res) => {
    const { jobDetailIds } = req.body;

    if (!Array.isArray(jobDetailIds) || jobDetailIds.length === 0) {
      return res.status(400).json({ message: 'Invalid job detail IDs provided' });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Remove associations in the jobs_job_details table
        const removeAssociationsQuery = 'DELETE FROM jobs_job_details WHERE job_detail_id = ANY($1)';
        await client.query(removeAssociationsQuery, [jobDetailIds]);

        // Delete the job details
        const deleteJobDetailsQuery = 'DELETE FROM job_details WHERE id = ANY($1) RETURNING id';
        const result = await client.query(deleteJobDetailsQuery, [jobDetailIds]);

        await client.query('COMMIT');

        const deletedIds = result.rows.map(row => row.id);
        res.status(200).json({ 
          message: 'Job details deleted successfully', 
          deletedJobDetailIds: deletedIds 
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deleting job details:', error);
      res.status(500).json({ message: 'Error deleting job details', error: error.message });
    }
  });

  // Batch update/insert job details
  router.post('/batch', async (req, res) => {
    const { jobId, jobDetails } = req.body;

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete all existing job details for this job
        await client.query('DELETE FROM jobs_job_details WHERE job_id = $1', [jobId]);
        await client.query('DELETE FROM job_details WHERE id NOT IN (SELECT job_detail_id FROM jobs_job_details)');

        // Insert or update all job details
        for (const jobDetail of jobDetails) {
          const { id, description, amount, remark, type } = jobDetail;
          
          const upsertQuery = `
            INSERT INTO job_details (id, description, amount, remark, type)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET description = EXCLUDED.description, 
                amount = EXCLUDED.amount, 
                remark = EXCLUDED.remark, 
                type = EXCLUDED.type
            RETURNING *
          `;

          const upsertValues = [
            id || `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
            description, 
            amount, 
            remark, 
            type
          ];
          const result = await client.query(upsertQuery, upsertValues);
          
          // Link job detail to job
          await client.query(
            'INSERT INTO jobs_job_details (job_id, job_detail_id) VALUES ($1, $2)', 
            [jobId, result.rows[0].id]
          );
        }

        // Fetch all job details for this job
        const fetchQuery = `
          SELECT jd.* 
          FROM job_details jd
          JOIN jobs_job_details jjd ON jd.id = jjd.job_detail_id
          WHERE jjd.job_id = $1
        `;
        const fetchResult = await client.query(fetchQuery, [jobId]);

        await client.query('COMMIT');
        res.json({ 
          message: 'Job details processed successfully', 
          jobDetails: fetchResult.rows
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error processing job details:', error);
      res.status(500).json({ message: 'Error processing job details', error: error.message });
    }
  });

  // Update a single job detail
  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { description, amount, remark } = req.body;

    try {
      const query = `
        UPDATE job_details
        SET description = $1, amount = $2, remark = $3
        WHERE id = $4
        RETURNING *
      `;
      
      const values = [description, amount, remark, id];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Job detail not found' });
      }

      res.json({ 
        message: 'Job detail updated successfully', 
        jobDetail: result.rows[0] 
      });
    } catch (error) {
      console.error('Error updating job detail:', error);
      res.status(500).json({ message: 'Error updating job detail', error: error.message });
    }
  });

  return router;
}