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
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
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

// Delete multiple products
app.delete('/api/products', async (req, res) => {
  const { productIds } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ message: 'Invalid product IDs provided' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove associations in the job_products table
      const removeAssociationsQuery = 'DELETE FROM job_products WHERE product_id = ANY($1)';
      await client.query(removeAssociationsQuery, [productIds]);

      // Delete the products
      const deleteProductsQuery = 'DELETE FROM products WHERE id = ANY($1) RETURNING id';
      const result = await client.query(deleteProductsQuery, [productIds]);

      await client.query('COMMIT');

      const deletedIds = result.rows.map(row => row.id);
      res.status(200).json({ 
        message: 'Products deleted successfully', 
        deletedProductIds: deletedIds 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting products:', error);
    res.status(500).json({ message: 'Error deleting products', error: error.message });
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

// Update existing products
app.put('/api/products', async (req, res) => {
  const products = req.body;
  console.log('Received products for update:', products);

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updatedProducts = [];
      for (const product of products) {
        const { id, name, amount, remark } = product;
        console.log(`Updating product: ${id}, ${name}, ${amount}, ${remark}`);
        
        const query = `
          UPDATE products
          SET name = $1, amount = $2, remark = $3
          WHERE id = $4
          RETURNING *
        `;
        const values = [name, amount, remark, id];
        const result = await client.query(query, values);
        
        if (result.rowCount === 0) {
          throw new Error(`Product with id ${id} not found`);
        }
        updatedProducts.push(result.rows[0]);
      }

      await client.query('COMMIT');
      console.log('Products updated successfully:', updatedProducts);
      res.json({ message: 'Products updated successfully', updatedProducts });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating products:', error);
    res.status(500).json({ message: 'Error updating products', error: error.message });
  }
});

// Insert new products
app.post('/api/products', async (req, res) => {
  const products = req.body;
  console.log('Received new products for insertion:', products);

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertedProducts = [];
      for (const product of products) {
        const { name, amount, remark, jobId } = product;
        console.log(`Inserting new product: ${name}, ${amount}, ${remark}, ${jobId}`);
        
        const query = `
          INSERT INTO products (name, amount, remark)
          VALUES ($1, $2, $3)
          RETURNING *
        `;
        const values = [name, amount, remark];
        const result = await client.query(query, values);
        
        const newProduct = result.rows[0];
        
        // Associate the new product with the job
        const associationQuery = `
          INSERT INTO job_products (job_id, product_id)
          VALUES ($1, $2)
        `;
        await client.query(associationQuery, [jobId, newProduct.id]);
        
        insertedProducts.push(newProduct);
      }

      await client.query('COMMIT');
      console.log('New products inserted successfully:', insertedProducts);
      res.status(201).json({ message: 'New products inserted successfully', insertedProducts });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error inserting new products:', error);
    res.status(500).json({ message: 'Error inserting new products', error: error.message });
  }
});

// Batch update/insert products
app.post('/api/products/batch', async (req, res) => {
  const { jobId, products } = req.body;
  console.log('Received products for batch update/insert:', { jobId, products });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const processedProducts = [];
      const jobProducts = [];

      for (const product of products) {
        const { id, name, amount, remark } = product;
        
        if (id && !id.startsWith('new_')) {
          // Update existing product
          console.log(`Updating product: ${id}, ${name}, ${amount}, ${remark}`);
          const updateQuery = `
            UPDATE products
            SET name = $1, amount = $2, remark = $3
            WHERE id = $4
            RETURNING *
          `;
          const updateValues = [name, amount, remark, id];
          const result = await client.query(updateQuery, updateValues);
          
          if (result.rowCount > 0) {
            processedProducts.push(result.rows[0]);
            jobProducts.push({ job_id: jobId, product_id: id });
          } else {
            console.log(`Product with id ${id} not found, inserting as new product`);
            // If update fails, insert as new product
            const insertQuery = `
              INSERT INTO products (id, name, amount, remark)
              VALUES ($1, $2, $3, $4)
              RETURNING *
            `;
            const insertValues = [id, name, amount, remark];
            const insertResult = await client.query(insertQuery, insertValues);
            processedProducts.push(insertResult.rows[0]);
            jobProducts.push({ job_id: jobId, product_id: id });
          }
        } else {
          // Insert new product
          console.log(`Inserting new product: ${name}, ${amount}, ${remark}`);
          const insertQuery = `
            INSERT INTO products (name, amount, remark)
            VALUES ($1, $2, $3)
            RETURNING *
          `;
          const insertValues = [name, amount, remark];
          const result = await client.query(insertQuery, insertValues);
          
          const newProduct = result.rows[0];
          processedProducts.push(newProduct);
          jobProducts.push({ job_id: jobId, product_id: newProduct.id });
        }
      }

      // Clear existing job-product associations and insert new ones
      await client.query('DELETE FROM job_products WHERE job_id = $1', [jobId]);
      for (const jp of jobProducts) {
        await client.query('INSERT INTO job_products (job_id, product_id) VALUES ($1, $2)', [jp.job_id, jp.product_id]);
      }

      await client.query('COMMIT');
      console.log('Products processed successfully:', processedProducts);
      console.log('Job-Product associations:', jobProducts);
      res.json({ 
        message: 'Products processed successfully', 
        products: processedProducts,
        jobProducts: jobProducts
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing products:', error);
    res.status(500).json({ message: 'Error processing products', error: error.message });
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