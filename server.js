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

// Check for duplicate job name
async function checkDuplicateJobName(name, id = null) {
  const query = id
    ? 'SELECT * FROM jobs WHERE name = $1 AND id != $2'
    : 'SELECT * FROM jobs WHERE name = $1';
  const values = id ? [name, id] : [name];
  const result = await pool.query(query, values);
  return result.rows.length > 0;
}

// Check for duplicate job ID
async function checkDuplicateJobId(id) {
  const query = 'SELECT * FROM jobs WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows.length > 0;
}

// JOBS SERVER ENDPOINTS
app.post('/api/jobs', async (req, res) => {
  const { id, name, section } = req.body;

  try {
    const isDuplicateName = await checkDuplicateJobName(name);
    if (isDuplicateName) {
      return res.status(400).json({ message: 'A job with this name already exists' });
    }

    const isDuplicateId = await checkDuplicateJobId(id);
    if (isDuplicateId) {
      return res.status(400).json({ message: 'A job with this ID already exists' });
    }

    const query = `
      INSERT INTO jobs (id, name, section)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
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

// Update a job
app.put('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const { name, section, newId } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if the job exists
      const existingJobQuery = 'SELECT * FROM jobs WHERE id = $1';
      const existingJobResult = await client.query(existingJobQuery, [id]);
      
      if (existingJobResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Job not found' });
      }

      const existingJob = existingJobResult.rows[0];

      // Only check for duplicate name if the name is being changed
      if (name !== existingJob.name) {
        const isDuplicateName = await checkDuplicateJobName(name, id);
        if (isDuplicateName) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'A job with this name already exists' });
        }
      }

      let updatedId = id;
      if (newId && newId !== id) {
        const isDuplicateId = await checkDuplicateJobId(newId);
        if (isDuplicateId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'A job with this ID already exists' });
        }

        // Drop the foreign key constraint
        await client.query('ALTER TABLE job_products DROP CONSTRAINT job_products_job_id_fkey');

        // Update job ID in jobs table
        await client.query('UPDATE jobs SET id = $1 WHERE id = $2', [newId, id]);

        // Update job ID in job_products table
        await client.query('UPDATE job_products SET job_id = $1 WHERE job_id = $2', [newId, id]);

        // Recreate the foreign key constraint
        await client.query('ALTER TABLE job_products ADD CONSTRAINT job_products_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id)');

        updatedId = newId;
      }

      // Update other job details
      const query = `
        UPDATE jobs
        SET name = $1, section = $2
        WHERE id = $3
        RETURNING *
      `;
      const values = [name, Array.isArray(section) ? section.join(', ') : section, updatedId];

      const result = await client.query(query, values);

      await client.query('COMMIT');
      res.json({ message: 'Job updated successfully', job: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ message: 'Error updating job', error: error.message });
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

// PRODUCTS SERVER ENDPOINTS
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

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const processedProducts = [];

      // Step 1: Process all products
      for (const product of products) {
        const { id, newId, name, amount, remark } = product;
        
        if (newId && newId !== id) {
          // This is an existing product with an ID change
          // First, insert the new product or update if it already exists
          const upsertQuery = `
            INSERT INTO products (id, name, amount, remark)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name, amount = EXCLUDED.amount, remark = EXCLUDED.remark
            RETURNING *
          `;
          const upsertValues = [newId, name, amount, remark];
          const upsertResult = await client.query(upsertQuery, upsertValues);
          
          // Update job_products table to use the new product ID
          await client.query('UPDATE job_products SET product_id = $1 WHERE product_id = $2', [newId, id]);
          
          // Now, delete the old product
          await client.query('DELETE FROM products WHERE id = $1', [id]);
          
          processedProducts.push(upsertResult.rows[0]);
        } else {
          // This is an existing product without ID change or a new product
          const upsertQuery = `
            INSERT INTO products (id, name, amount, remark)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name, amount = EXCLUDED.amount, remark = EXCLUDED.remark
            RETURNING *
          `;
          const upsertValues = [id, name, amount, remark];
          const result = await client.query(upsertQuery, upsertValues);
          processedProducts.push(result.rows[0]);
        }
      }

      // Step 2: Update job_products table
      if (jobId) {
        const currentProductIds = processedProducts.map(p => p.id);
        await client.query('DELETE FROM job_products WHERE job_id = $1 AND product_id != ALL($2)', [jobId, currentProductIds]);

        for (const product of processedProducts) {
          await client.query('INSERT INTO job_products (job_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [jobId, product.id]);
        }
      }

      // Step 3: Remove orphaned products
      const orphanedProductsQuery = `
        DELETE FROM products
        WHERE id NOT IN (SELECT DISTINCT product_id FROM job_products)
        AND id != ALL($1)
      `;
      await client.query(orphanedProductsQuery, [processedProducts.map(p => p.id)]);

      await client.query('COMMIT');
      res.json({ 
        message: 'Products processed successfully', 
        products: processedProducts
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

// Fetch all products with associated job_name
app.get('/api/products', async (req, res) => {
  try {
    const query = `
      SELECT p.*, j.name as job_name
      FROM products p
      LEFT JOIN job_products jp ON p.id = jp.product_id
      LEFT JOIN jobs j ON jp.job_id = j.id
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// SECTION SERVER ENDPOINTS
app.post('/api/sections', async (req, res) => {
  const { id, name } = req.body;

  try {
    const query = `
      INSERT INTO sections (id, name)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const values = [id, name];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Section created successfully', section: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // unique_violation error code
      return res.status(400).json({ message: 'A section with this ID already exists' });
    }
    console.error('Error inserting section:', error);
    res.status(500).json({ message: 'Error creating section', error: error.message });
  }
});

// Get all sections
app.get('/api/sections', async (req, res) => {
  try {
    const query = 'SELECT * FROM sections';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ message: 'Error fetching sections', error: error.message });
  }
});

// Delete sections
app.delete('/api/sections', async (req, res) => {
  const { sectionIds } = req.body;

  if (!Array.isArray(sectionIds) || sectionIds.length === 0) {
    return res.status(400).json({ message: 'Invalid section IDs provided' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete the sections
      const deleteSectionsQuery = 'DELETE FROM sections WHERE id = ANY($1::text[]) RETURNING id';
      const result = await client.query(deleteSectionsQuery, [sectionIds]);

      await client.query('COMMIT');

      const deletedIds = result.rows.map(row => row.id);
      res.status(200).json({ 
        message: 'Sections deleted successfully', 
        deletedSectionIds: deletedIds 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting sections:', error);
    res.status(500).json({ message: 'Error deleting sections', error: error.message });
  }
});

// Batch update/insert sections
app.post('/api/sections/batch', async (req, res) => {
  const { sections } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const processedSections = [];

      // Step 1: Process all sections
      for (const section of sections) {
        const { id, newId, name } = section;
        
        if (newId && newId !== id) {
          // This is an existing section with an ID change
          // First, insert the new section or update if it already exists
          const upsertQuery = `
            INSERT INTO sections (id, name)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name
            RETURNING *
          `;
          const upsertValues = [newId, name];
          const upsertResult = await client.query(upsertQuery, upsertValues);
          
          // Now, delete the old section
          await client.query('DELETE FROM sections WHERE id = $1', [id]);
          
          processedSections.push(upsertResult.rows[0]);
        } else {
          // This is an existing section without ID change or a new section
          const upsertQuery = `
            INSERT INTO sections (id, name)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name
            RETURNING *
          `;
          const upsertValues = [id, name];
          const result = await client.query(upsertQuery, upsertValues);
          processedSections.push(result.rows[0]);
        }
      }

      await client.query('COMMIT');
      res.json({ 
        message: 'Sections processed successfully', 
        sections: processedSections
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing sections:', error);
    res.status(500).json({ message: 'Error processing sections', error: error.message });
  }
});