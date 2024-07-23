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
      section: job.section ? job.section.split(', ') : [],
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
    // First, delete associated records in the job_products table
    await pool.query('DELETE FROM job_products WHERE job_id = $1', [id]);

    // Then, delete the job
    const query = 'DELETE FROM jobs WHERE id = $1';
    await pool.query(query, [id]);
    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ message: 'Error deleting job', error: error.message });
  }
});

// Fetch all products for job catalogue
app.get('/api/jobs/:jobId/products', async (req, res) => {
  const { jobId } = req.params;

  try {
    const query = `
      SELECT p.* 
      FROM products p
      JOIN job_products jp ON p.id = jp.product_id
      WHERE jp.job_id = $1
    `;
    const result = await pool.query(query, [jobId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products for job:', error);
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// Delete association from job_products table
app.delete('/api/job_products', async (req, res) => {
  const { jobId, productId } = req.body;

  try {
    const query = 'DELETE FROM job_products WHERE job_id = $1 AND product_id = $2';
    await pool.query(query, [jobId, productId]);
    res.status(200).json({ message: 'Association removed successfully' });
  } catch (error) {
    console.error('Error removing job-product association:', error);
    res.status(500).json({ message: 'Error removing association', error: error.message });
  }
});

// Delete a product
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // First, remove any associations in the job_products table
    await pool.query('DELETE FROM job_products WHERE product_id = $1', [id]);

    // Then, delete the product itself
    const query = 'DELETE FROM products WHERE id = $1';
    await pool.query(query, [id]);
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Error deleting product', error: error.message });
  }
});

// Product count endpoint
app.get('/api/jobs/:jobId/products/count', async (req, res) => {
  const { jobId } = req.params;

  try {
    const query = `
      SELECT COUNT(*) 
      FROM job_products
      WHERE job_id = $1
    `;
    const result = await pool.query(query, [jobId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error counting products for job:', error);
    res.status(500).json({ message: 'Error counting products', error: error.message });
  }
});

// Update a job
app.put('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const { name, section } = req.body;

  try {
    const query = `
      UPDATE jobs
      SET name = $1, section = $2
      WHERE id = $3
      RETURNING *
    `;
    
    const values = [
      name, 
      Array.isArray(section) ? section.join(', ') : section,
      id
    ];

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json({ message: 'Job updated successfully', job: result.rows[0] });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ message: 'Error updating job', error: error.message });
  }
});

// Update a product
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, amount, remark } = req.body;

  try {
    const query = `
      UPDATE products
      SET name = $1, amount = $2, remark = $3
      WHERE id = $4
      RETURNING *
    `;
    
    const values = [name, amount, remark, id];

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ message: 'Product updated successfully', product: result.rows[0] });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Error updating product', error: error.message });
  }
});