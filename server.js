// server.js
import express from 'express';
import pkg from 'body-parser';
import pkg2 from 'pg';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import EInvoiceApiClient from './EInvoiceApiClient.js';

dotenv.config();

const { json } = pkg;
const { Pool } = pkg2;
const app = express();
const port = process.env.PORT || 5000;

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

// Check for duplicate staff ID
async function checkDuplicateStaffId(id) {
  const query = 'SELECT * FROM staffs WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows.length > 0;
}

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

// STAFF SERVER ENDPOINTS
app.get('/api/staffs', async (req, res) => {
  try {
    const { salesmenOnly } = req.query;
    
    let query = `
      SELECT 
        s.id, 
        s.name, 
        s.ic_no as "icNo", 
        s.telephone_no as "telephoneNo",
        s.date_resigned as "dateResigned",
        s.nationality,
        s.gender,
        s.race,
        s.job,
        s.location
      FROM 
        staffs s
    `;
    
    if (salesmenOnly === 'true') {
      query += ` WHERE s.job::jsonb ? 'SALESMAN'`;
    }
    
    const result = await pool.query(query);
    
    const staffs = result.rows.map(staff => ({
      ...staff,
      job: Array.isArray(staff.job) ? staff.job : [],
      location: Array.isArray(staff.location) ? staff.location : [],
      dateResigned: staff.dateResigned ? staff.dateResigned.toISOString().split('T')[0] : null
    }));

    res.json(staffs);
  } catch (error) {
    console.error('Error fetching staffs:', error);
    res.status(500).json({ message: 'Error fetching staffs', error: error.message });
  }
});

app.post('/api/staffs', async (req, res) => {
  const {
    id,
    name,
    telephoneNo,
    email,
    gender,
    nationality,
    birthdate,
    address,
    job,
    location,
    dateJoined,
    icNo,
    bankAccountNumber,
    epfNo,
    incomeTaxNo,
    socsoNo,
    document,
    paymentType,
    paymentPreference,
    race,
    agama,
    dateResigned
  } = req.body;

  try {
    // Check for duplicate ID
    const isDuplicateId = await checkDuplicateStaffId(id);
    if (isDuplicateId) {
      return res.status(400).json({ message: 'A staff member with this ID already exists' });
    }
    
    const query = `
      INSERT INTO staffs (
        id, name, telephone_no, email, gender, nationality, birthdate, address,
        job, location, date_joined, ic_no, bank_account_number, epf_no,
        income_tax_no, socso_no, document, payment_type, payment_preference,
        race, agama, date_resigned
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `;

    const values = [
      id, 
      name, 
      telephoneNo, 
      email || null, 
      gender, 
      nationality, 
      birthdate ? new Date(birthdate) : null, 
      address,
      JSON.stringify(job), 
      JSON.stringify(location), 
      dateJoined ? new Date(dateJoined) : null, 
      icNo,
      bankAccountNumber, 
      epfNo, 
      incomeTaxNo, 
      socsoNo, 
      document, 
      paymentType,
      paymentPreference, 
      race, 
      agama, 
      dateResigned ? new Date(dateResigned) : null
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Staff member created successfully', staff: result.rows[0] });
  } catch (error) {
    console.error('Error creating staff member:', error);
    res.status(500).json({ message: 'Error creating staff member', error: error.message });
  }
});

// Fetch a single staff member by ID
app.get('/api/staffs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        s.id, 
        s.name, 
        s.ic_no as "icNo", 
        s.telephone_no as "telephoneNo",
        s.email,
        s.gender,
        s.nationality,
        s.birthdate,
        s.address,
        s.date_joined as "dateJoined",
        s.bank_account_number as "bankAccountNumber",
        s.epf_no as "epfNo",
        s.income_tax_no as "incomeTaxNo",
        s.socso_no as "socsoNo",
        s.document,
        s.payment_type as "paymentType",
        s.payment_preference as "paymentPreference",
        s.race,
        s.agama,
        s.date_resigned as "dateResigned",
        s.job,
        s.location
      FROM 
        staffs s
      WHERE
        s.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    const staff = result.rows[0];

    // Format dates
    const formatDate = (date) => date ? new Date(date).toISOString().split('T')[0] : '';
    
    // Convert null values to empty strings and format dates
    const formattedStaff = Object.entries(staff).reduce((acc, [key, value]) => {
      if (key === 'birthdate' || key === 'dateJoined' || key === 'dateResigned') {
        acc[key] = formatDate(value);
      } else if (key === 'job' || key === 'location') {
        acc[key] = Array.isArray(value) ? value : [];
      } else {
        acc[key] = value === null ? '' : value;
      }
      return acc;
    }, {});

    res.json(formattedStaff);
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({ message: 'Error fetching staff member', error: error.message });
  }
});

// Update an existing staff member
app.put('/api/staffs/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    telephoneNo,
    email,
    gender,
    nationality,
    birthdate,
    address,
    job,
    location,
    dateJoined,
    icNo,
    bankAccountNumber,
    epfNo,
    incomeTaxNo,
    socsoNo,
    document,
    paymentType,
    paymentPreference,
    race,
    agama,
    dateResigned,
    newId
  } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let updateId = id;
      if (newId && newId !== id) {
        // Check if the new ID already exists
        const checkIdQuery = 'SELECT id FROM staffs WHERE id = $1';
        const checkIdResult = await client.query(checkIdQuery, [newId]);
        if (checkIdResult.rows.length > 0) {
          throw new Error('A staff member with the new ID already exists');
        }
        updateId = newId;
      }

      const query = `
        UPDATE staffs
        SET id = $1, name = $2, telephone_no = $3, email = $4, gender = $5, nationality = $6, 
            birthdate = $7, address = $8, job = $9, location = $10, date_joined = $11, 
            ic_no = $12, bank_account_number = $13, epf_no = $14, income_tax_no = $15, 
            socso_no = $16, document = $17, payment_type = $18, payment_preference = $19, 
            race = $20, agama = $21, date_resigned = $22
        WHERE id = $23
        RETURNING *
      `;

      const values = [
        updateId, 
        name, 
        telephoneNo, 
        email || null, 
        gender, 
        nationality, 
        birthdate ? new Date(birthdate) : null, 
        address,
        JSON.stringify(job), 
        JSON.stringify(location), 
        dateJoined ? new Date(dateJoined) : null, 
        icNo,
        bankAccountNumber, 
        epfNo, 
        incomeTaxNo, 
        socsoNo, 
        document, 
        paymentType,
        paymentPreference, 
        race, 
        agama, 
        dateResigned ? new Date(dateResigned) : null,
        id
      ];

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Staff member not found');
      }

      await client.query('COMMIT');
      res.json({ message: 'Staff member updated successfully', staff: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating staff member:', error);
    res.status(500).json({ message: 'Error updating staff member', error: error.message });
  }
});

app.delete('/api/staffs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = 'DELETE FROM staffs WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    res.json({ message: 'Staff member deleted successfully', staff: result.rows[0] });
  } catch (error) {
    console.error('Error deleting staff member:', error);
    res.status(500).json({ message: 'Error deleting staff member', error: error.message });
  }
});

// Customer Catalogue Endpoints
// Get all customers
app.get('/api/customers', async (req, res) => {
  try {
    const query = 'SELECT * FROM customers';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Error fetching customers', error: error.message });
  }
});

// Create a new customer
app.post('/api/customers', async (req, res) => {
  const { id, name, closeness, salesman, tin_number } = req.body;

  try {
    const query = `
      INSERT INTO customers (id, name, closeness, salesman, tin_number)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [id, name, closeness, salesman, tin_number];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Customer created successfully', customer: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // unique_violation error code
      return res.status(400).json({ message: 'A customer with this ID already exists' });
    }
    console.error('Error creating customer:', error);
    res.status(500).json({ message: 'Error creating customer', error: error.message });
  }
});

// Update a customer
app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, closeness, salesman, tin_number } = req.body;

  try {
    const query = `
      UPDATE customers
      SET name = $1, closeness = $2, salesman = $3, tin_number = $4
      WHERE id = $5
      RETURNING *
    `;
    
    const values = [name, closeness, salesman, tin_number, id];

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({ message: 'Customer updated successfully', customer: result.rows[0] });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Error updating customer', error: error.message });
  }
});

// Delete customers
app.delete('/api/customers', async (req, res) => {
  const { customerIds } = req.body;

  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ message: 'Invalid customer IDs provided' });
  }

  try {
    const query = 'DELETE FROM customers WHERE id = ANY($1) RETURNING id';
    const result = await pool.query(query, [customerIds]);

    const deletedIds = result.rows.map(row => row.id);
    res.status(200).json({ 
      message: 'Customers deleted successfully', 
      deletedCustomerIds: deletedIds 
    });
  } catch (error) {
    console.error('Error deleting customers:', error);
    res.status(500).json({ message: 'Error deleting customers', error: error.message });
  }
});

// Batch update/insert customers
app.post('/api/customers/batch', async (req, res) => {
  const { customers } = req.body;

  if (!Array.isArray(customers)) {
    return res.status(400).json({ message: 'Invalid input: customers must be an array' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const processedCustomers = [];

      for (const customer of customers) {
        const { id, name, closeness, salesman, tin_number } = customer;
        
        const upsertQuery = `
          INSERT INTO customers (id, name, closeness, salesman, tin_number)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              closeness = EXCLUDED.closeness,
              salesman = EXCLUDED.salesman,
              tin_number = EXCLUDED.tin_number
          RETURNING *
        `;
        const upsertValues = [id, name, closeness, salesman, tin_number];
        const result = await client.query(upsertQuery, upsertValues);
        processedCustomers.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.json({ 
        message: 'Customers processed successfully', 
        customers: processedCustomers
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing customers:', error);
    res.status(500).json({ message: 'Error processing customers', error: error.message });
  }
});

// PRODUCT CATALOGUE SERVER ENDPOINTS
// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const query = 'SELECT * FROM products';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// Create a new product
app.post('/api/products', async (req, res) => {
  const { id, description, price_per_unit, type, tax } = req.body;

  try {
    const query = `
      INSERT INTO products (id, description, price_per_unit, type, tax)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [id, description, price_per_unit, type, tax];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Product created successfully', product: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // unique_violation error code
      return res.status(400).json({ message: 'A product with this ID already exists' });
    }
    console.error('Error creating product:', error);
    res.status(500).json({ message: 'Error creating product', error: error.message });
  }
});

// Delete products
app.delete('/api/products', async (req, res) => {
  const { products } = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'Invalid product IDs provided' });
  }

  try {
    const query = 'DELETE FROM products WHERE id = ANY($1) RETURNING id';
    const result = await pool.query(query, [products]);

    const deletedIds = result.rows.map(row => row.id);
    res.status(200).json({ 
      message: 'Products deleted successfully', 
      deletedProductIds: deletedIds 
    });
  } catch (error) {
    console.error('Error deleting products:', error);
    res.status(500).json({ message: 'Error deleting products', error: error.message });
  }
});

// Batch update/insert products
app.post('/api/products/batch', async (req, res) => {
  const { products } = req.body;

  if (!Array.isArray(products)) {
    return res.status(400).json({ message: 'Invalid input: products must be an array' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const processedProducts = [];

      for (const product of products) {
        const { id, newId, description, price_per_unit, type, tax } = product;
        
        if (newId && newId !== id) {
          // This is an existing product with an ID change
          const upsertQuery = `
            INSERT INTO products (id, description, price_per_unit, type, tax)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET description = EXCLUDED.description,
                price_per_unit = EXCLUDED.price_per_unit,
                type = EXCLUDED.type,
                tax = EXCLUDED.tax
            RETURNING *
          `;
          const upsertValues = [newId, description, price_per_unit, type, tax];
          const upsertResult = await client.query(upsertQuery, upsertValues);
          
          // Delete the old product
          await client.query('DELETE FROM products WHERE id = $1', [id]);
          
          processedProducts.push(upsertResult.rows[0]);
        } else {
          // This is an existing product without ID change or a new product
          const upsertQuery = `
            INSERT INTO products (id, description, price_per_unit, type, tax)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET description = EXCLUDED.description,
                price_per_unit = EXCLUDED.price_per_unit,
                type = EXCLUDED.type,
                tax = EXCLUDED.tax
            RETURNING *
          `;
          const upsertValues = [id, description, price_per_unit, type, tax];
          const result = await client.query(upsertQuery, upsertValues);
          processedProducts.push(result.rows[0]);
        }
      }

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

// Delete a job and its associated job details
app.delete('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('BEGIN');

    // Delete associated records in the jobs_job_details table
    await pool.query('DELETE FROM jobs_job_details WHERE job_id = $1', [id]);

    // Delete the job
    const deleteJobQuery = 'DELETE FROM jobs WHERE id = $1';
    await pool.query(deleteJobQuery, [id]);

    await pool.query('COMMIT');
    res.status(200).json({ message: 'Job and associated details deleted successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error deleting job:', error);
    res.status(500).json({ message: 'Error deleting job', error: error.message });
  }
});

// Fetch all job details for a specific job
app.get('/api/jobs/:jobId/details', async (req, res) => {
  const { jobId } = req.params;

  try {
    const query = `
      SELECT jd.* 
      FROM job_details jd
      JOIN jobs_job_details jjd ON jd.id = jjd.job_detail_id
      WHERE jjd.job_id = $1
    `;
    const result = await pool.query(query, [jobId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching job details for job:', error);
    res.status(500).json({ message: 'Error fetching job details', error: error.message });
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

        // Update job ID in jobs table
        await client.query('UPDATE jobs SET id = $1 WHERE id = $2', [newId, id]);

        // Update job ID in jobs_job_details table
        await client.query('UPDATE jobs_job_details SET job_id = $1 WHERE job_id = $2', [newId, id]);

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

// Count job details for a job
app.get('/api/jobs/:jobId/details/count', async (req, res) => {
  const { jobId } = req.params;

  try {
    const query = `
      SELECT COUNT(*) 
      FROM jobs_job_details
      WHERE job_id = $1
    `;
    const result = await pool.query(query, [jobId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error counting job details for job:', error);
    res.status(500).json({ message: 'Error counting job details', error: error.message });
  }
});

// JOB DETAILS SERVER ENDPOINTS
// Delete multiple job details
app.delete('/api/job-details', async (req, res) => {
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
app.post('/api/job-details/batch', async (req, res) => {
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

        const upsertValues = [id || `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, description, amount, remark, type];
        const result = await client.query(upsertQuery, upsertValues);
        
        // Link job detail to job
        await client.query('INSERT INTO jobs_job_details (job_id, job_detail_id) VALUES ($1, $2)', [jobId, result.rows[0].id]);
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

// Update a job detail
app.put('/api/job-details/:id', async (req, res) => {
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

    res.json({ message: 'Job detail updated successfully', jobDetail: result.rows[0] });
  } catch (error) {
    console.error('Error updating job detail:', error);
    res.status(500).json({ message: 'Error updating job detail', error: error.message });
  }
});

// Fetch all job details with associated job_name
app.get('/api/job-details', async (req, res) => {
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

// Update the job count endpoint
app.get('/api/jobs/:jobId/details/count', async (req, res) => {
  const { jobId } = req.params;

  try {
    const query = `
      SELECT COUNT(*) 
      FROM jobs_job_details
      WHERE job_id = $1
    `;
    const result = await pool.query(query, [jobId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error counting job details for job:', error);
    res.status(500).json({ message: 'Error counting job details', error: error.message });
  }
});

// TAX SERVER ENDPOINTS
// Create a new tax entry
app.post('/api/taxes', async (req, res) => {
  const { name, rate } = req.body;

  try {
    const query = `
      INSERT INTO taxes (name, rate)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const values = [name, rate];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Tax entry created successfully', tax: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // unique_violation error code
      return res.status(400).json({ message: 'A tax entry with this name already exists' });
    }
    console.error('Error creating tax entry:', error);
    res.status(500).json({ message: 'Error creating tax entry', error: error.message });
  }
});

// Get all tax entries
app.get('/api/taxes', async (req, res) => {
  try {
    const query = 'SELECT * FROM taxes';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tax entries:', error);
    res.status(500).json({ message: 'Error fetching tax entries', error: error.message });
  }
});

// Update a tax entry
app.put('/api/taxes/:name', async (req, res) => {
  const { name } = req.params;
  const { rate } = req.body;

  try {
    const query = `
      UPDATE taxes
      SET rate = $1
      WHERE name = $2
      RETURNING *
    `;
    
    const values = [rate, name];

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tax entry not found' });
    }

    res.json({ message: 'Tax entry updated successfully', tax: result.rows[0] });
  } catch (error) {
    console.error('Error updating tax entry:', error);
    res.status(500).json({ message: 'Error updating tax entry', error: error.message });
  }
});

// Delete a tax entry
app.delete('/api/taxes', async (req, res) => {
  const { taxIds } = req.body;

  if (!Array.isArray(taxIds) || taxIds.length === 0) {
    return res.status(400).json({ message: 'Invalid tax IDs provided' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete the taxes
      const deleteTaxesQuery = 'DELETE FROM taxes WHERE name = ANY($1) RETURNING name';
      const result = await client.query(deleteTaxesQuery, [taxIds]);

      await client.query('COMMIT');

      const deletedNames = result.rows.map(row => row.name);
      res.status(200).json({ 
        message: 'Taxes deleted successfully', 
        deletedTaxNames: deletedNames 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting taxes:', error);
    res.status(500).json({ message: 'Error deleting taxes', error: error.message });
  }
});

// Batch update/insert tax entries
app.post('/api/taxes/batch', async (req, res) => {
  const { taxes } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const processedTaxes = [];

      for (const tax of taxes) {
        const { name, rate } = tax;
        
        const upsertQuery = `
          INSERT INTO taxes (name, rate)
          VALUES ($1, $2)
          ON CONFLICT (name) DO UPDATE
          SET rate = EXCLUDED.rate
          RETURNING *
        `;
        const upsertValues = [name, rate];
        const result = await client.query(upsertQuery, upsertValues);
        processedTaxes.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.json({ 
        message: 'Tax entries processed successfully', 
        taxes: processedTaxes
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing tax entries:', error);
    res.status(500).json({ message: 'Error processing tax entries', error: error.message });
  }
});

// PAGES WITH DOUBLE COLUMNS TABLE SERVER ENDPOINTS
const setupEntityEndpoints = (app, entityName, tableName) => {
  const capitalizedEntity = entityName.charAt(0).toUpperCase() + entityName.slice(1);

  // Create a new entity
  app.post(`/api/${entityName}s`, async (req, res) => {
    const { id, name } = req.body;

    try {
      const query = `
        INSERT INTO ${tableName} (id, name)
        VALUES ($1, $2)
        RETURNING *
      `;
      
      const values = [id, name];

      const result = await pool.query(query, values);
      res.status(201).json({ message: `${capitalizedEntity} created successfully`, [entityName]: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') { // unique_violation error code
        return res.status(400).json({ message: `A ${entityName} with this ID already exists` });
      }
      console.error(`Error inserting ${entityName}:`, error);
      res.status(500).json({ message: `Error creating ${entityName}`, error: error.message });
    }
  });

  // Get all entities
  app.get(`/api/${entityName}s`, async (req, res) => {
    try {
      const query = `SELECT * FROM ${tableName}`;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error(`Error fetching ${entityName}s:`, error);
      res.status(500).json({ message: `Error fetching ${entityName}s`, error: error.message });
    }
  });

  // Delete entities
  app.delete(`/api/${entityName}s`, async (req, res) => {
    const entityIds = req.body[`${entityName}s`];

    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return res.status(400).json({ message: `Invalid ${entityName} IDs provided` });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete the entities
        const deleteQuery = `DELETE FROM ${tableName} WHERE id = ANY($1::text[]) RETURNING id`;
        const result = await client.query(deleteQuery, [entityIds]);

        await client.query('COMMIT');

        const deletedIds = result.rows.map(row => row.id);
        res.status(200).json({ 
          message: `${capitalizedEntity}s deleted successfully`, 
          [`deleted${capitalizedEntity}s`]: deletedIds 
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error deleting ${entityName}s:`, error);
      res.status(500).json({ message: `Error deleting ${entityName}s`, error: error.message });
    }
  });

  // Batch update/insert entities
  app.post(`/api/${entityName}s/batch`, async (req, res) => {
    const entities = req.body[`${entityName}s`];

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const processedEntities = [];

        // Process all entities
        for (const entity of entities) {
          const { id, newId, name } = entity;
          
          if (newId && newId !== id) {
            // This is an existing entity with an ID change
            const upsertQuery = `
              INSERT INTO ${tableName} (id, name)
              VALUES ($1, $2)
              ON CONFLICT (id) DO UPDATE
              SET name = EXCLUDED.name
              RETURNING *
            `;
            const upsertValues = [newId, name];
            const upsertResult = await client.query(upsertQuery, upsertValues);
            
            // Delete the old entity
            await client.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
            
            processedEntities.push(upsertResult.rows[0]);
          } else {
            // This is an existing entity without ID change or a new entity
            const upsertQuery = `
              INSERT INTO ${tableName} (id, name)
              VALUES ($1, $2)
              ON CONFLICT (id) DO UPDATE
              SET name = EXCLUDED.name
              RETURNING *
            `;
            const upsertValues = [id, name];
            const result = await client.query(upsertQuery, upsertValues);
            processedEntities.push(result.rows[0]);
          }
        }

        await client.query('COMMIT');
        res.json({ 
          message: `${capitalizedEntity}s processed successfully`, 
          [`${entityName}s`]: processedEntities
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error processing ${entityName}s:`, error);
      res.status(500).json({ message: `Error processing ${entityName}s`, error: error.message });
    }
  });
};

setupEntityEndpoints(app, 'section', 'sections');
setupEntityEndpoints(app, 'location', 'locations');
setupEntityEndpoints(app, 'bank', 'banks');
setupEntityEndpoints(app, 'nationalitie', 'nationalities');
setupEntityEndpoints(app, 'race', 'races');
setupEntityEndpoints(app, 'agama', 'agama');

app.get('/api/sections', async (req, res) => {
  try {
    const query = 'SELECT name FROM sections';
    const result = await pool.query(query);
    res.json(result.rows.map(row => row.name));
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ message: 'Error fetching sections', error: error.message });
  }
});

// JOB CATEGORIES SERVER ENDPOINTS
// Get all job categories
app.get('/api/job-categories', async (req, res) => {
  try {
    const query = 'SELECT * FROM job_categories';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching job categories:', error);
    res.status(500).json({ message: 'Error fetching job categories', error: error.message });
  }
});

// Create a new job category
app.post('/api/job-categories', async (req, res) => {
  const { id, category, section, gaji, ikut, jv } = req.body;

  if (!id.trim()) {
    return res.status(400).json({ message: 'Job category ID cannot be empty' });
  }

  try {
    // Check if the section exists
    const sectionCheckQuery = 'SELECT name FROM sections WHERE name = $1';
    const sectionCheckResult = await pool.query(sectionCheckQuery, [section]);
    if (sectionCheckResult.rows.length === 0) {
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
    res.status(201).json({ message: 'Job category created successfully', jobCategory: result.rows[0] });
  } catch (error) {
    console.error('Error creating job category:', error);
    res.status(500).json({ message: 'Error creating job category', error: error.message });
  }
});

// Delete job categories
app.delete('/api/job-categories', async (req, res) => {
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
    res.status(500).json({ message: 'Error deleting job categories', error: error.message });
  }
});

// Batch update/insert job categories
app.post('/api/job-categories/batch', async (req, res) => {
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
        const upsertValues = [id, category || "", section || "", gaji || "", ikut || "", jv || ""];
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
      res.status(500).json({ message: 'An error occurred while processing job categories' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'An unexpected error occurred' });
  }
});

// In-memory storage for uploaded invoices
let uploadedInvoices = [];

// Helper function to check if a value is empty or invalid
const isEmptyOrInvalid = (value) => {
  return value === '' || value === null || value === undefined || 
         Number.isNaN(value) || value === '\r' || value === 'NaN';
};

// Helper function to check if a row should be removed
const shouldRemoveRow = (row) => {
  return isEmptyOrInvalid(row.code);
};

// Helper function to sanitize a single order detail
const sanitizeOrderDetail = (detail) => {
  const sanitized = { ...detail };
  for (const key in sanitized) {
    if (isEmptyOrInvalid(sanitized[key])) {
      if (key === 'qty' || key === 'price' || key === 'total' || key === 'discount' || key === 'tax') {
        sanitized[key] = '0'; // Set numeric fields to '0' as a string if invalid
      } else if (key === 'foc' || key === 'returned') {
        sanitized[key] = 0; // Set foc and returned to 0 if invalid
      } else {
        sanitized[key] = ''; // Set other fields to empty string if invalid
      }
    }
  }
  return sanitized;
};

// Helper function to sanitize numeric values
const sanitizeNumeric = (value) => {
  if (typeof value === 'string') {
    // Remove commas and any other non-numeric characters except for the decimal point
    return value.replace(/[^\d.-]/g, '');
  }
  return value;
};

// Endpoint to receive uploaded invoice data
app.post('/api/invoices/upload', (req, res) => {
  const newInvoices = req.body.map(invoice => ({
    ...invoice,
    orderDetails: invoice.orderDetails
      .map(sanitizeOrderDetail)
      .filter(detail => !shouldRemoveRow(detail))
  }));

  if (Array.isArray(newInvoices)) {
    uploadedInvoices = [...uploadedInvoices, ...newInvoices];
    res.json({ message: `${newInvoices.length} invoices uploaded successfully` });
  } else {
    res.status(400).json({ message: 'Invalid data format. Expected an array of invoices.' });
  }
});

// Endpoint to fetch invoices from database
app.get('/api/db/invoices', async (req, res) => {
  try {
    const invoiceQuery = `
      SELECT 
        i.id, i.invoiceno, i.orderno, i.date, i.type, 
        i.customer, c.name as customername, 
        i.salesman, i.totalamount, i.time
      FROM 
        invoices i
      LEFT JOIN 
        customers c ON i.customer = c.id
    `;
    const invoiceResult = await pool.query(invoiceQuery);

    const orderDetailsQuery = `
      SELECT 
        od.invoiceid, od.code, p.description as productname, 
        od.qty, od.price, od.total, od.isfoc, od.isreturned,
        od.istotal, od.issubtotal, od.isless, od.istax
      FROM 
        order_details od
      LEFT JOIN 
        products p ON od.code = p.id
    `;
    const orderDetailsResult = await pool.query(orderDetailsQuery);

    const invoicesWithDetails = invoiceResult.rows.map(invoice => {
      // Handle date conversion
      let formattedDate;
      if (invoice.date instanceof Date) {
        formattedDate = `${invoice.date.getDate().toString().padStart(2, '0')}/${(invoice.date.getMonth() + 1).toString().padStart(2, '0')}/${invoice.date.getFullYear()}`;
      } else if (typeof invoice.date === 'string') {
        // Assuming the date string is in ISO format (YYYY-MM-DD)
        const [year, month, day] = invoice.date.split('T')[0].split('-');
        formattedDate = `${day}/${month}/${year}`;
      } else {
        console.error('Unexpected date format:', invoice.date);
        formattedDate = 'Invalid Date';
      }

      // Handle time conversion
      let formattedTime;
      if (typeof invoice.time === 'string') {
        let [hours, minutes] = invoice.time.split(':');
        hours = parseInt(hours);
        const period = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12 || 12; // Convert 24h to 12h format
        formattedTime = `${hours}:${minutes} ${period}`;
      } else {
        console.error('Unexpected time format:', invoice.time);
        formattedTime = 'Invalid Time';
      }

      return {
        ...invoice,
        date: formattedDate,
        time: formattedTime,
        totalAmount: invoice.totalamount,
        orderDetails: orderDetailsResult.rows
          .filter(detail => detail.invoiceid === invoice.id)
          .map(detail => ({
            code: detail.code,
            productName: detail.productname,
            qty: detail.qty,
            price: detail.price,
            total: detail.total,
            isFoc: detail.isfoc,
            isReturned: detail.isreturned,
            isTotal: detail.istotal,
            isSubtotal: detail.issubtotal,
            isLess: detail.isless,
            isTax: detail.istax
          }))
      };
    });

    res.json(invoicesWithDetails);
  } catch (error) {
    console.error('Error fetching invoices from database:', error);
    res.status(500).json({ message: 'Error fetching invoices', error: error.message });
  }
});

// Endpoint to save edited invoices to the database or server memory
app.post('/api/invoices/submit', async (req, res) => {
  const { saveToDb } = req.query;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoice = req.body;
    const processedInvoice = {
      ...invoice,
      orderDetails: invoice.orderDetails.map(sanitizeOrderDetail)
    };

    // Convert date from DD/MM/YYYY to YYYY-MM-DD
    const [day, month, year] = processedInvoice.date.split('/');
    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    // Convert time from "HH:MM am/pm" to "HH:MM:SS" format
    const [time, period] = processedInvoice.time.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours);
    if (period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period.toLowerCase() === 'am' && hours === 12) {
      hours = 0;
    }
    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`;

    // Sanitize totalAmount
    const sanitizedTotalAmount = sanitizeNumeric(processedInvoice.totalAmount);

    let savedInvoice;

    if (saveToDb === 'true') {
      // Check if the invoice already exists
      const checkInvoiceQuery = 'SELECT id FROM Invoices WHERE id = $1';
      const checkInvoiceResult = await client.query(checkInvoiceQuery, [processedInvoice.id]);

      if (checkInvoiceResult.rows.length > 0) {
        // Update existing invoice
        const updateInvoiceQuery = `
          UPDATE Invoices
          SET invoiceno = $1, orderno = $2, date = $3, time = $4, type = $5,
              customer = $6, customername = $7, salesman = $8, totalAmount = $9
          WHERE id = $10
          RETURNING *
        `;
        const updateResult = await client.query(updateInvoiceQuery, [
          processedInvoice.invoiceno,
          processedInvoice.orderno,
          formattedDate,
          formattedTime,
          processedInvoice.type,
          processedInvoice.customer,
          processedInvoice.customername,
          processedInvoice.salesman,
          sanitizedTotalAmount,
          processedInvoice.id
        ]);
        savedInvoice = updateResult.rows[0];
      } else {
        // Insert new invoice
        const insertInvoiceQuery = `
          INSERT INTO Invoices (id, invoiceno, orderno, date, time, type, customer, customername, salesman, totalAmount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `;
        const insertResult = await client.query(insertInvoiceQuery, [
          processedInvoice.id,
          processedInvoice.invoiceno,
          processedInvoice.orderno,
          formattedDate,
          formattedTime,
          processedInvoice.type,
          processedInvoice.customer,
          processedInvoice.customername,
          processedInvoice.salesman,
          sanitizedTotalAmount
        ]);
        savedInvoice = insertResult.rows[0];
      }

      // Delete existing order details
      await client.query('DELETE FROM order_details WHERE invoiceId = $1', [savedInvoice.id]);

      // Insert new order details
      for (const detail of processedInvoice.orderDetails) {
        const detailQuery = `
          INSERT INTO order_details (invoiceId, code, productName, qty, price, total, isFoc, isReturned, isTotal, isSubtotal, isLess, isTax)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        await client.query(detailQuery, [
          savedInvoice.id,
          detail.code,
          detail.productName,
          detail.qty,
          detail.price,
          detail.total,
          detail.isFoc || false,
          detail.isReturned || false,
          detail.isTotal || false,
          detail.isSubtotal || false,
          detail.isLess || false,
          detail.isTax || false
        ]);
      }

      // Fetch order details for the saved invoice
      const orderDetailsQuery = `
        SELECT * FROM order_details WHERE invoiceId = $1
      `;
      const orderDetailsResult = await client.query(orderDetailsQuery, [savedInvoice.id]);
      savedInvoice.orderDetails = orderDetailsResult.rows;
    } else {
      // Save to server memory
      const existingIndex = uploadedInvoices.findIndex(inv => inv.id === processedInvoice.id);
      if (existingIndex !== -1) {
        uploadedInvoices[existingIndex] = processedInvoice;
      } else {
        uploadedInvoices.push(processedInvoice);
      }
      savedInvoice = processedInvoice;
    }

    await client.query('COMMIT');
    res.status(201).json(savedInvoice);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting invoice:', error);
    res.status(500).json({ message: 'Error submitting invoice', error: error.message });
  } finally {
    client.release();
  }
});

// Endpoint to bulk submit invoices to the database
app.post('/api/invoices/bulk-submit', async (req, res) => {
  const invoices = req.body;

  if (!Array.isArray(invoices) || invoices.length === 0) {
    return res.status(400).json({ message: 'Invalid invoices data provided' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertedInvoices = [];

    for (const invoice of invoices) {
      // Convert date from DD/MM/YYYY to YYYY-MM-DD
      const [day, month, year] = invoice.date.split('/');
      const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      // Convert time from "HH:MM am/pm" to "HH:MM:SS" format
      const [time, period] = invoice.time.split(' ');
      let [hours, minutes] = time.split(':');
      hours = parseInt(hours);
      if (period.toLowerCase() === 'pm' && hours !== 12) {
        hours += 12;
      } else if (period.toLowerCase() === 'am' && hours === 12) {
        hours = 0;
      }
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`;

      // Sanitize totalAmount
      const sanitizedTotalAmount = sanitizeNumeric(invoice.totalAmount);

      // Insert new invoice
      const insertInvoiceQuery = `
        INSERT INTO Invoices (id, invoiceno, orderno, date, time, type, customer, customername, salesman, totalAmount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const invoiceResult = await client.query(insertInvoiceQuery, [
        invoice.invoiceno, // Use invoiceno as the id
        invoice.invoiceno,
        invoice.orderno,
        formattedDate,
        formattedTime,
        invoice.type,
        invoice.customer,
        invoice.customername,
        invoice.salesman,
        sanitizedTotalAmount
      ]);

      const insertedInvoice = invoiceResult.rows[0];

      // Insert order details
      for (const detail of invoice.orderDetails) {
        const detailQuery = `
          INSERT INTO order_details (invoiceId, code, productName, qty, price, total, isFoc, isReturned, isTotal, isSubtotal, isLess, isTax)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        await client.query(detailQuery, [
          insertedInvoice.id,
          detail.code,
          detail.productName,
          detail.qty,
          detail.price,
          detail.total,
          detail.isFoc || false,
          detail.isReturned || false,
          detail.isTotal || false,
          detail.isSubtotal || false,
          detail.isLess || false,
          detail.isTax || false
        ]);
      }

      insertedInvoices.push(insertedInvoice);
    }

    await client.query('COMMIT');
    uploadedInvoices = [];
    
    res.json({ 
      message: `Successfully submitted ${insertedInvoices.length} invoices to the database.`,
      invoices: insertedInvoices
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting invoices:', error);
    res.status(500).json({ message: 'Error submitting invoices', error: error.message });
  } finally {
    client.release();
  }
});

// Endpoint to get all uploaded invoices with customer names and product details
app.get('/api/invoices', async (req, res) => {
  try {
    const customerQuery = 'SELECT id, name FROM customers';
    const customerResult = await pool.query(customerQuery);
    const customerMap = new Map(customerResult.rows.map(row => [row.id, row.name]));

    const productQuery = 'SELECT id, description FROM products';
    const productResult = await pool.query(productQuery);
    const productMap = new Map(productResult.rows.map(row => [row.id, row.description]));

    const invoicesWithDetails = uploadedInvoices.map(invoice => ({
      ...invoice,
      customername: customerMap.get(invoice.customer) || invoice.customer,
      orderDetails: invoice.orderDetails
        .map(detail => ({
          ...sanitizeOrderDetail(detail),
          productName: productMap.get(detail.code) || detail.code
        }))
        .filter(detail => !shouldRemoveRow(detail))
    }));

    res.json(invoicesWithDetails);
  } catch (error) {
    console.error('Error fetching invoices with details:', error);
    res.status(500).json({ message: 'Error fetching invoices', error: error.message });
  }
});

// Delete an invoice from the database
app.delete('/api/db/invoices/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete order details first
      await client.query('DELETE FROM order_details WHERE invoiceId = $1', [id]);

      // Then delete the invoice
      const result = await client.query('DELETE FROM invoices WHERE id = $1 RETURNING *', [id]);

      await client.query('COMMIT');

      if (result.rows.length === 0) {
        res.status(404).json({ message: 'Invoice not found' });
      } else {
        res.status(200).json({ message: 'Invoice deleted successfully', deletedInvoice: result.rows[0] });
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting invoice from database:', error);
    res.status(500).json({ message: 'Error deleting invoice', error: error.message });
  }
});

app.delete('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  const index = uploadedInvoices.findIndex(invoice => invoice.id === id);
  
  if (index !== -1) {
    const deletedInvoice = uploadedInvoices.splice(index, 1)[0];
    res.status(200).json({ message: 'Invoice deleted successfully', deletedInvoice });
  } else {
    res.status(404).json({ message: 'Invoice not found' });
  }
});

app.put('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  const updatedInvoice = req.body;
  
  const index = uploadedInvoices.findIndex(invoice => invoice.id === id);
  
  if (index !== -1) {
    updatedInvoice.orderDetails = updatedInvoice.orderDetails
      .map(sanitizeOrderDetail)
      .filter(detail => !shouldRemoveRow(detail));
    uploadedInvoices[index] = updatedInvoice;
    res.status(200).json(updatedInvoice);
  } else {
    res.status(404).json({ message: 'Invoice not found' });
  }
});

app.post('/api/invoices/clear', (req, res) => {
  uploadedInvoices = []; // Clear the in-memory storage
  res.status(200).json({ message: 'All invoices cleared successfully' });
});

// Check for duplicate invoice number
app.get('/api/invoices/check-duplicate', async (req, res) => {
  const { invoiceNo } = req.query;

  if (!invoiceNo) {
    return res.status(400).json({ message: 'Invoice number is required' });
  }

  try {
    const query = 'SELECT COUNT(*) FROM invoices WHERE invoiceno = $1';
    const result = await pool.query(query, [invoiceNo]);
    const count = parseInt(result.rows[0].count);

    res.json({ isDuplicate: count > 0 });
  } catch (error) {
    console.error('Error checking for duplicate invoice number:', error);
    res.status(500).json({ message: 'Error checking for duplicate invoice number', error: error.message });
  }
});

// Check for duplicate invoice numbers in bulk
app.post('/api/invoices/check-bulk-duplicates', async (req, res) => {
  const { invoiceNumbers } = req.body;

  if (!Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
    return res.status(400).json({ message: 'Invalid invoice numbers provided' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for duplicates in the database
      const dbQuery = `
        SELECT invoiceno
        FROM invoices
        WHERE invoiceno = ANY($1)
      `;
      const dbResult = await client.query(dbQuery, [invoiceNumbers]);

      // Check for duplicates in the provided list itself
      const duplicatesInList = invoiceNumbers.filter((item, index) => invoiceNumbers.indexOf(item) !== index);

      // Combine duplicates from database and list
      const allDuplicates = [...new Set([...dbResult.rows.map(row => row.invoiceno), ...duplicatesInList])];

      await client.query('COMMIT');

      res.json({ duplicates: allDuplicates });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error checking for duplicate invoice numbers:', error);
    res.status(500).json({ message: 'Error checking for duplicate invoice numbers', error: error.message });
  }
});

// Fetch all products (id and description only)
app.get('/api/products/combobox', async (req, res) => {
  try {
    const query = 'SELECT id, description FROM products';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products for combobox:', error);
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// Fetch customers by salesman
app.get('/api/customers/combobox', async (req, res) => {
  const { salesman, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = 'SELECT id, name FROM customers';
    let countQuery = 'SELECT COUNT(*) FROM customers';
    let whereClause = [];
    let values = [];
    let valueIndex = 1;

    if (salesman && salesman !== 'All Salesmen') {
      whereClause.push(`salesman = $${valueIndex}`);
      values.push(salesman);
      valueIndex++;
    }

    if (search) {
      whereClause.push(`(name ILIKE $${valueIndex} OR id ILIKE $${valueIndex})`);
      values.push(`%${search}%`);
      valueIndex++;
    }

    if (whereClause.length > 0) {
      query += ' WHERE ' + whereClause.join(' AND ');
      countQuery += ' WHERE ' + whereClause.join(' AND ');
    }

    query += ` ORDER BY name LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
    values.push(limit, offset);

    const [resultCount, resultData] = await Promise.all([
      pool.query(countQuery, values.slice(0, -2)),
      pool.query(query, values)
    ]);

    const totalCount = parseInt(resultCount.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      customers: resultData.rows,
      totalCount,
      totalPages,
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching customers for combobox:', error);
    res.status(500).json({ message: 'Error fetching customers for combobox', error: error.message });
  }
});

// MyInvois API client initialization
const apiClient = new EInvoiceApiClient(
  process.env.MYINVOIS_API_BASE_URL,
  process.env.MYINVOIS_CLIENT_ID,
  process.env.MYINVOIS_CLIENT_SECRET
);

// e-invoice login endpoint
app.post('/api/einvoice/login', async (req, res) => {
  try {
    console.log('Attempting to connect to:', `${process.env.MYINVOIS_API_BASE_URL}/connect/token`);
    const tokenResponse = await apiClient.refreshToken();
    console.log('E-Invois API Response:', tokenResponse);
    
    if (tokenResponse && tokenResponse.access_token) {
      res.json({ 
        success: true, 
        message: 'Successfully connected to MyInvois API',
        apiEndpoint: `${process.env.MYINVOIS_API_BASE_URL}/connect/token`,
        tokenInfo: {
          accessToken: tokenResponse.access_token,
          expiresIn: tokenResponse.expires_in,
          tokenType: tokenResponse.token_type
        }
      });
    } else {
      throw new Error('Invalid token response from MyInvois API');
    }
  } catch (error) {
    console.error('Error connecting to MyInvois API:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to connect to MyInvois API', 
      apiEndpoint: `${process.env.MYINVOIS_API_BASE_URL}/connect/token`,
      error: error.message,
      details: error.response ? error.response.data : null
    });
  }
});

// Function to generate a dummy invoice
function generateDummyInvoice() {
  const invoiceNumber = `INV-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
  const invoiceDate = new Date().toISOString().split('T')[0];
  const invoiceTime = new Date().toISOString().split('T')[1].split('.')[0] + 'Z';

  return {
    "Invoice": [{
      "ID": [{ "_": invoiceNumber }],
      "IssueDate": [{ "_": invoiceDate }],
      "IssueTime": [{ "_": invoiceTime }],
      "InvoiceTypeCode": [{ "_": "01", "listVersionID": "1.1" }],
      "DocumentCurrencyCode": [{ "_": "MYR" }],
      "TaxCurrencyCode": [{ "_": "MYR" }],
      "AccountingSupplierParty": [{
        "Party": [{
          "PartyName": [{ "Name": [{ "_": "Dummy Supplier Sdn Bhd" }] }],
          "PostalAddress": [{ 
            "StreetName": [{ "_": "123 Main St" }],
            "CityName": [{ "_": "Kuala Lumpur" }],
            "PostalZone": [{ "_": "50000" }],
            "CountrySubentityCode": [{ "_": "14" }],
            "Country": [{ "IdentificationCode": [{ "_": "MYS" }] }]
          }],
          "PartyTaxScheme": [{ "CompanyID": [{ "_": "IG7139779050" }] }],
          "PartyLegalEntity": [{ "RegistrationName": [{ "_": "Dummy Supplier Sdn Bhd" }] }],
          "Contact": [{
            "Telephone": [{ "_": "+60123456789" }],
            "ElectronicMail": [{ "_": "dummy@supplier.com" }]
          }],
          "PartyIdentification": [
            { "ID": [{ "_": "IG7139779050", "schemeID": "TIN" }] },
            { "ID": [{ "_": "202001234567", "schemeID": "BRN" }] },
            { "ID": [{ "_": "A01-2345-67891012", "schemeID": "SST" }] },
            { "ID": [{ "_": "NA", "schemeID": "TTX" }] }
          ],
          "IndustryClassificationCode": [{ "_": "46510", "name": "Wholesale of computer hardware, software and peripherals" }]
        }]
      }],
      "AccountingCustomerParty": [{
        "Party": [{
          "PartyName": [{ "Name": [{ "_": "Dummy Customer Sdn Bhd" }] }],
          "PostalAddress": [{ 
            "StreetName": [{ "_": "456 Side St" }],
            "CityName": [{ "_": "Penang" }],
            "PostalZone": [{ "_": "10000" }],
            "CountrySubentityCode": [{ "_": "07" }],
            "Country": [{ "IdentificationCode": [{ "_": "MYS" }] }]
          }],
          "PartyTaxScheme": [{ "CompanyID": [{ "_": "C2584563200" }] }],
          "PartyLegalEntity": [{ "RegistrationName": [{ "_": "Dummy Customer Sdn Bhd" }] }],
          "Contact": [{
            "Telephone": [{ "_": "+60187654321" }],
            "ElectronicMail": [{ "_": "dummy@customer.com" }]
          }],
          "PartyIdentification": [
            { "ID": [{ "_": "C2584563200", "schemeID": "TIN" }] },
            { "ID": [{ "_": "202009876543", "schemeID": "BRN" }] },
            { "ID": [{ "_": "NA", "schemeID": "SST" }] }
          ]
        }]
      }],
      "InvoiceLine": [{
        "ID": [{ "_": "1" }],
        "InvoicedQuantity": [{ "_": 1, "unitCode": "EA" }],
        "LineExtensionAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
        "Item": [{ 
          "Name": [{ "_": "Dummy Product" }],
          "Description": [{ "_": "High-quality dummy product" }],
          "CommodityClassification": [{ "ItemClassificationCode": [{ "_": "001", "listID": "CLASS" }] }]
        }],
        "Price": [{ "PriceAmount": [{ "_": 1000.00, "currencyID": "MYR" }] }],
        "TaxTotal": [{
          "TaxAmount": [{ "_": 60.00, "currencyID": "MYR" }],
          "TaxSubtotal": [{
            "TaxableAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
            "TaxAmount": [{ "_": 60.00, "currencyID": "MYR" }],
            "TaxCategory": [{
              "ID": [{ "_": "01" }],
              "Percent": [{ "_": 6.00 }],
              "TaxScheme": [{ "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }] }]
            }]
          }]
        }]
      }],
      "TaxTotal": [{
        "TaxAmount": [{ "_": 60.00, "currencyID": "MYR" }],
        "TaxSubtotal": [{
          "TaxableAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
          "TaxAmount": [{ "_": 60.00, "currencyID": "MYR" }],
          "TaxCategory": [{
            "ID": [{ "_": "01" }],
            "TaxScheme": [{ "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }] }]
          }]
        }]
      }],
      "LegalMonetaryTotal": [{
        "LineExtensionAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
        "TaxExclusiveAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
        "TaxInclusiveAmount": [{ "_": 1060.00, "currencyID": "MYR" }],
        "PayableAmount": [{ "_": 1060.00, "currencyID": "MYR" }]
      }]
    }]
  };
}

// e-invoice submit endpoint
app.post('/api/einvoice/submit', async (req, res) => {
  try {
    // Generate a dummy invoice
    const invoice = generateDummyInvoice();
    const invoiceJson = JSON.stringify(invoice);

    console.log('Generated Invoice:', JSON.stringify(invoice, null, 2)); // Log the generated invoice

    // Prepare the document submission
    const documentHash = crypto.createHash('sha256').update(invoiceJson).digest('base64');
    const submission = {
      documents: [{
        format: "JSON",
        document: Buffer.from(invoiceJson).toString('base64'),
        documentHash: documentHash,
        codeNumber: invoice.Invoice[0].ID[0]._
      }]
    };

    console.log('Submission Payload:', JSON.stringify(submission, null, 2)); // Log the submission payload

    // Submit the document using the correct API endpoint
    const response = await apiClient.makeApiCall('POST', '/api/v1.0/documentsubmissions/', submission);

    console.log('MyInvois API Response:', JSON.stringify(response, null, 2)); // Log the full API response

    // Check if the response contains the expected properties
    if (response && response.submissionUID) {
      res.json({
        success: true,
        submissionUID: response.submissionUID,
        acceptedDocuments: response.acceptedDocuments || []
      });
    } else {
      // If the response doesn't contain the expected properties, treat it as an error
      throw new Error('Invalid response from MyInvois API: ' + JSON.stringify(response));
    }
  } catch (error) {
    console.error('Error submitting invoice:', error);
    console.error('Error stack:', error.stack); // Log the full error stack trace
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit invoice to MyInvois API', 
      error: error.message,
      stack: error.stack,
      details: error.response ? error.response.data : null
    });
  }
});