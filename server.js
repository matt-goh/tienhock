// server.js
import express from 'express';
import pkg from 'body-parser';
import pkg2 from 'pg';
import cors from 'cors';

const { json } = pkg;
const { Pool } = pkg2;
const app = express();
const port = 5000;

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'tienhock',
  password: 'foodmaker',
  port: 5432,
});

app.use(cors());
app.use(json());

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.post('/api/jobs', async (req, res) => {
  const { id, name, section } = req.body;

  try {
    const query = `
      INSERT INTO jobs (id, name, section)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    // Join array values into comma-separated strings
    const values = [
      id, 
      name, 
      Array.isArray(section) ? section.join(', ') : section,
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Job created successfully', job: result.rows[0] });
  } catch (error) {
    console.error('Error inserting job:', error);
    res.status(500).json({ message: 'Error creating job', error: error.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const query = 'SELECT * FROM jobs';
    const result = await pool.query(query);
    
    const jobs = result.rows.map(job => ({
      ...job,
      section: job.section.split(', '),
    }));

    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ message: 'Error fetching jobs', error: error.message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = 'DELETE FROM jobs WHERE id = $1';
    await pool.query(query, [id]);
    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ message: 'Error deleting job', error: error.message });
  }
});