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
    const query = `
      SELECT 
        s.id, 
        s.name, 
        s.ic_no as "icNo", 
        s.telephone_no as "telephoneNo",
        COALESCE(
          (SELECT array_agg(DISTINCT j.name) 
           FROM jobs j 
           WHERE j.id::text = ANY(SELECT jsonb_array_elements_text(s.job::jsonb))),
          ARRAY[]::text[]
        ) as job,
        COALESCE(
          (SELECT array_agg(DISTINCT l.name) 
           FROM locations l 
           WHERE l.id::text = ANY(SELECT jsonb_array_elements_text(s.location::jsonb))),
          ARRAY[]::text[]
        ) as location
      FROM 
        staffs s
    `;
    
    const result = await pool.query(query);
    
    const staffs = result.rows.map(staff => ({
      ...staff,
      job: staff.job || [],
      location: staff.location || []
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
    dateResigned
  } = req.body;

  try {
    const query = `
      UPDATE staffs
      SET name = $1, telephone_no = $2, email = $3, gender = $4, nationality = $5, 
          birthdate = $6, address = $7, job = $8, location = $9, date_joined = $10, 
          ic_no = $11, bank_account_number = $12, epf_no = $13, income_tax_no = $14, 
          socso_no = $15, document = $16, payment_type = $17, payment_preference = $18, 
          race = $19, agama = $20, date_resigned = $21
      WHERE id = $22
      RETURNING *
    `;

    const values = [
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

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    res.json({ message: 'Staff member updated successfully', staff: result.rows[0] });
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