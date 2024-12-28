// server.js
import express from 'express';
import pkgBodyParser from 'body-parser';
import pkgPg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { 
  NODE_ENV,
  SERVER_HOST,
} from './src/configs/config.js';
import router from './src/routes/sessions.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { json } = pkgBodyParser;
const { Pool } = pkgPg;
const app = express();
const port = 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'build')));

// MyInvois API Configuration
const MYINVOIS_API_BASE_URL = 'https://preprod-api.myinvois.hasil.gov.my';
const MYINVOIS_CLIENT_ID = 'b0037953-93e3-4e8d-92b3-99efb15afe33';
const MYINVOIS_CLIENT_SECRET = '1e612d39-da8d-42cc-b949-bcd04d9d3fab';

// PostgreSQL connection
export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Set up session cleanup interval
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
setInterval(async () => {
  try {
    await pool.query('SELECT cleanup_old_sessions($1)', [24]); // 24 hours max age
    console.log('Cleaned up old sessions');
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
  }
}, CLEANUP_INTERVAL);

// Add this before your other middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,UPDATE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
  next();
});

// Use middleware
app.use(cors());
app.use(json());
app.use('/api', router);

// Start server
app.listen(port, '0.0.0.0', () => {
  const displayHost = NODE_ENV === 'development'
    ? 'localhost:5001 (development mode)'
    : `${SERVER_HOST || '0.0.0.0'}:${port}`;
    
  console.log(`Server running on https://${displayHost}`);
  console.log(`Server environment: ${NODE_ENV}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Closing HTTP server and database pool...');
  
  try {
    await pool.end();
    console.log('Database pool closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received. Closing HTTP server and database pool...');
  
  try {
    await pool.end();
    console.log('Database pool closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Session Management Endpoints
app.post('/api/sessions/register', async (req, res) => {
  const { sessionId, staffId = null, deviceInfo = {} } = req.body;

  try {
    const query = `
      INSERT INTO active_sessions (session_id, staff_id, device_info)
      VALUES ($1, $2, $3)
      ON CONFLICT (session_id) 
      DO UPDATE SET
        staff_id = EXCLUDED.staff_id,
        device_info = EXCLUDED.device_info,
        last_active = CURRENT_TIMESTAMP,
        status = 'active'
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId, staffId, deviceInfo]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error registering session:', error);
    res.status(500).json({ error: 'Failed to register session' });
  }
});

app.get('/api/sessions/active', async (req, res) => {
  try {
    const query = `
      WITH session_info AS (
        SELECT 
          a.*,
          e.id as last_event_id,
          e.event_type as last_event_type,
          e.created_at as last_event_time
        FROM active_sessions a
        LEFT JOIN session_events e ON a.session_id = e.session_id
        WHERE a.last_active > CURRENT_TIMESTAMP - INTERVAL '24 hours'
          AND a.status = 'active'
        ORDER BY e.created_at DESC
        LIMIT 1
      )
      SELECT DISTINCT ON (session_id)
        session_id,
        staff_id,
        device_info,
        last_active,
        status,
        metadata,
        last_event_id,
        last_event_type,
        last_event_time
      FROM session_info
      ORDER BY session_id, last_event_time DESC
    `;
    
    const result = await pool.query(query);
    res.json({
      sessions: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

app.post('/api/sessions/:sessionId/heartbeat', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const query = `
      UPDATE active_sessions 
      SET last_active = CURRENT_TIMESTAMP
      WHERE session_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error updating session activity:', error);
    res.status(500).json({ error: 'Failed to update session activity' });
  }
});

// Profile switching endpoint
app.post('/api/sessions/:sessionId/switch-profile', async (req, res) => {
  const { sessionId } = req.params;
  const { staffId } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update session with new staff ID
    const sessionQuery = `
      UPDATE active_sessions 
      SET 
        staff_id = $1,
        last_active = CURRENT_TIMESTAMP,
        metadata = jsonb_set(
          metadata, 
          '{last_profile_switch}',
          to_jsonb(CURRENT_TIMESTAMP)
        )
      WHERE session_id = $2
      RETURNING *
    `;
    
    const sessionResult = await client.query(sessionQuery, [staffId, sessionId]);
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found');
    }

    // Get staff details
    const staffQuery = `
      SELECT 
        s.id, 
        s.name, 
        s.job
      FROM 
        staffs s
      WHERE 
        s.id = $1 
        AND s.job ? 'OFFICE'
        AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
    `;
    
    const staffResult = await client.query(staffQuery, [staffId]);
    
    if (staffResult.rows.length === 0) {
      throw new Error('Staff not found or not authorized');
    }

    await client.query('COMMIT');

    const staff = {
      ...staffResult.rows[0],
      job: typeof staffResult.rows[0].job === 'string' 
        ? JSON.parse(staffResult.rows[0].job)
        : staffResult.rows[0].job
    };
    
    res.json({
      session: sessionResult.rows[0],
      staff
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error switching profile:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get session events for polling
app.get('/api/sessions/events', async (req, res) => {
  const { lastEventId = 0 } = req.query;
  
  try {
    const query = `
      SELECT * FROM session_events
      WHERE id > $1
      ORDER BY id ASC
      LIMIT 100
    `;
    
    const result = await pool.query(query, [lastEventId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching session events:', error);
    res.status(500).json({ error: 'Failed to fetch session events' });
  }
});

app.get('/api/current-staff/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Get the session from database instead of memory
    const sessionQuery = `
      SELECT staff_id 
      FROM active_sessions 
      WHERE session_id = $1 AND status = 'active'
    `;
    const sessionResult = await pool.query(sessionQuery, [sessionId]);

    if (!sessionResult.rows.length || !sessionResult.rows[0].staff_id) {
      return res.status(404).json({ 
        message: 'No active staff found for this session',
        sessionId 
      });
    }

    // Rest of your existing code...
  } catch (error) {
    console.error('Error fetching current staff:', error);
    res.status(500).json({ message: 'Error fetching current staff', error: error.message });
  }
});

// End session
app.delete('/api/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const query = `
      UPDATE active_sessions 
      SET 
        status = 'ended',
        metadata = jsonb_set(
          metadata, 
          '{end_time}',
          to_jsonb(CURRENT_TIMESTAMP)
        )
      WHERE session_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
    } else {
      res.json({ message: 'Session ended successfully', session: result.rows[0] });
    }
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

app.get('/api/staffs/office', async (req, res) => {
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

app.post('/api/switch-profile', async (req, res) => {
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

    const session = sessions.get(sessionId);
    if (session) {
      session.staffId = staffId;
      session.deviceInfo = deviceInfo;
      
      broadcastActiveSessions();
    }

    // Fix: Properly parse the job field if it's a JSON string
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
    res.status(500).json({ message: 'Error switching profile', error: error.message });
  }
});

// Get bookmarks for a staff member
app.get('/api/bookmarks/:staffId', async (req, res) => {
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
    res.status(500).json({ message: 'Error fetching bookmarks', error: error.message });
  }
});

// Add a bookmark
app.post('/api/bookmarks', async (req, res) => {
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
    res.status(500).json({ message: 'Error creating bookmark', error: error.message });
  }
});

// Remove a bookmark
app.delete('/api/bookmarks/:staffId/:name', async (req, res) => {
  const { staffId, name } = req.params;
  
  try {
    const query = 'DELETE FROM bookmarks WHERE staff_id = $1 AND name = $2 RETURNING *';
    const result = await pool.query(query, [staffId, name]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Bookmark not found' });
    }
    
    res.json({ message: 'Bookmark removed successfully', bookmark: result.rows[0] });
  } catch (error) {
    console.error('Error removing bookmark:', error);
    res.status(500).json({ message: 'Error removing bookmark', error: error.message });
  }
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
    const { salesmen, customers, startDate, endDate, invoiceType } = req.query;
    
    let invoiceQuery = `
      SELECT 
        i.id, i.invoiceno, i.orderno, i.date, i.type, 
        i.customer, c.name as customername, 
        i.salesman, i.totalamount, i.time
      FROM 
        invoices i
      LEFT JOIN 
        customers c ON i.customer = c.id
      WHERE 1=1
    `;

    const queryParams = [];
    let paramCounter = 1;

    if (salesmen) {
      const salesmenArray = salesmen.split(',');
      invoiceQuery += ` AND i.salesman = ANY($${paramCounter})`;
      queryParams.push(salesmenArray);
      paramCounter++;
    }

    if (customers) {
      const customersArray = customers.split(',');
      invoiceQuery += ` AND i.customer = ANY($${paramCounter})`;
      queryParams.push(customersArray);
      paramCounter++;
    }

    if (startDate && endDate) {
      invoiceQuery += ` AND i.date BETWEEN $${paramCounter} AND $${paramCounter + 1}`;
      queryParams.push(startDate, endDate);
      paramCounter += 2;
    }

    if (invoiceType) {
      invoiceQuery += ` AND i.type = $${paramCounter}`;
      queryParams.push(invoiceType);
      paramCounter++;
    }

    const invoiceResult = await pool.query(invoiceQuery, queryParams);

    if (invoiceResult.rows.length === 0) {
      return res.json([]);  // Return an empty array if no invoices found
    }

    const orderDetailsQuery = `
      SELECT 
      od.invoiceid, 
      od.code,
      CASE 
        WHEN od.isless OR od.istax THEN od.productname  -- Use the stored productname for special rows
        ELSE p.description  -- Use product description for normal products
      END as productname,
      od.qty, 
      od.price, 
      od.total, 
      od.isfoc, 
      od.isreturned,
      od.istotal, 
      od.issubtotal, 
      od.isless, 
      od.istax
    FROM 
      order_details od
    LEFT JOIN 
      products p ON od.code = p.id
    WHERE
      od.invoiceid = ANY($1)
    `;
    const orderDetailsResult = await pool.query(orderDetailsQuery, [invoiceResult.rows.map(inv => inv.id)]);

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
            productname: detail.productname,
            qty: detail.qty,
            price: detail.price,
            total: detail.total,
            isfoc: detail.isfoc,
            isreturned: detail.isreturned,
            istotal: detail.istotal,
            issubtotal: detail.issubtotal,
            isless: detail.isless,
            istax: detail.istax
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

    // Store the original id (which is the old invoiceno) before potentially changing it
    const originalId = processedInvoice.id;

    // Update the id to the new invoiceno
    processedInvoice.id = processedInvoice.invoiceno;

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
      // Check if the invoice with the original id exists
      const checkOriginalInvoiceQuery = 'SELECT id FROM Invoices WHERE id = $1';
      const checkOriginalInvoiceResult = await client.query(checkOriginalInvoiceQuery, [originalId]);

      if (checkOriginalInvoiceResult.rows.length > 0 && originalId !== processedInvoice.id) {
        // The invoice exists and the invoice number has changed
        // Delete the old invoice and its details
        await client.query('DELETE FROM order_details WHERE invoiceId = $1', [originalId]);
        await client.query('DELETE FROM Invoices WHERE id = $1', [originalId]);
      }

      // Now, either insert a new invoice or update the existing one
      const upsertInvoiceQuery = `
        INSERT INTO Invoices (id, invoiceno, orderno, date, time, type, customer, customername, salesman, totalAmount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET invoiceno = EXCLUDED.invoiceno,
            orderno = EXCLUDED.orderno,
            date = EXCLUDED.date,
            time = EXCLUDED.time,
            type = EXCLUDED.type,
            customer = EXCLUDED.customer,
            customername = EXCLUDED.customername,
            salesman = EXCLUDED.salesman,
            totalAmount = EXCLUDED.totalAmount
        RETURNING *
      `;
      const upsertResult = await client.query(upsertInvoiceQuery, [
        processedInvoice.id,
        processedInvoice.invoiceno,
        processedInvoice.invoiceno,
        formattedDate,
        formattedTime,
        processedInvoice.type,
        processedInvoice.customer,
        processedInvoice.customername,
        processedInvoice.salesman,
        sanitizedTotalAmount
      ]);
      savedInvoice = upsertResult.rows[0];

      // Delete existing order details and total rows for the new/updated invoice
      await client.query('DELETE FROM order_details WHERE invoiceId = $1', [savedInvoice.id]);

      // Insert new order details
      for (const detail of processedInvoice.orderDetails) {
        const detailQuery = `
          INSERT INTO order_details (invoiceId, code, productname, qty, price, total, isfoc, isreturned, istotal, issubtotal, isless, istax)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        await client.query(detailQuery, [
          savedInvoice.id,
          detail.code,
          detail.productname,
          detail.qty,
          detail.price,
          detail.total,
          detail.isfoc || false,
          detail.isreturned || false,
          detail.istotal || false,
          detail.issubtotal || false,
          detail.isless || false,
          detail.istax || false
        ]);
      }

      // Fetch order details for the saved invoice
      const orderDetailsQuery = `
        SELECT * FROM order_details WHERE invoiceId = $1
        ORDER BY 
          CASE 
            WHEN istotal = true THEN 1
            WHEN issubtotal = true THEN 2
            WHEN isless = true THEN 3
            WHEN istax = true THEN 4
            WHEN isfoc = true THEN 5
            WHEN isreturned = true THEN 6
            ELSE 0
          END,
          id
      `;
      const orderDetailsResult = await client.query(orderDetailsQuery, [savedInvoice.id]);

      // Cleanup any orphaned total rows
      await cleanupOrphanedTotalRows(client);

      savedInvoice.orderDetails = orderDetailsResult.rows;
    } else {
      // Save to server memory
      // Remove the old invoice if the invoice number has changed
      if (originalId !== processedInvoice.id) {
        uploadedInvoices = uploadedInvoices.filter(inv => inv.id !== originalId);
      }
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

async function cleanupOrphanedTotalRows(client) {
  const query = `
    DELETE FROM order_details
    WHERE (
      istotal = true OR 
      issubtotal = true OR 
      isless = true OR 
      istax = true OR
      isfoc = true OR
      isreturned = true OR
      code = '' OR code IS NULL
    ) AND (
      invoiceId NOT IN (SELECT id FROM invoices)
      OR
      invoiceId IN (
        SELECT invoiceId
        FROM order_details
        GROUP BY invoiceId
        HAVING COUNT(*) = SUM(
          CASE WHEN istotal OR issubtotal OR isless OR istax OR isfoc OR isreturned 
               OR code = '' OR code IS NULL THEN 1 ELSE 0 END
        )
      )
    )
  `;
  await client.query(query);
}

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
          INSERT INTO order_details (invoiceId, code, productname, qty, price, total, isfoc, isreturned, istotal, issubtotal, isless, istax)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        await client.query(detailQuery, [
          insertedInvoice.id,
          detail.code,
          detail.productname,
          detail.qty,
          detail.price,
          detail.total,
          detail.isfoc || false,
          detail.isreturned || false,
          detail.istotal || false,
          detail.issubtotal || false,
          detail.isless || false,
          detail.istax || false
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
          productname: productMap.get(detail.code) || detail.code
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

      // Then delete the remaining order details
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

// e-invoice login endpoint
app.post('/api/einvoice/login', async (req, res) => {
  try {
    console.log('Attempting to connect to:', `${MYINVOIS_API_BASE_URL}/connect/token`);
    const tokenResponse = await apiClient.refreshToken();
    
    if (tokenResponse && tokenResponse.access_token) {
      res.json({ 
        success: true, 
        message: 'Successfully connected to MyInvois API',
        apiEndpoint: `${MYINVOIS_API_BASE_URL}/connect/token`,
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
      apiEndpoint: `${MYINVOIS_API_BASE_URL}/connect/token`,
      error: error.message,
      details: error.response ? error.response.data : null
    });
  }
});

import EInvoiceApiClient from './src/pages/Invois/EInvoiceApiClient.js';
import DocumentSubmissionHandler from './src/pages/Invois/documentSubmissionHandler.js';
import { transformInvoiceToMyInvoisFormat } from './src/pages/Invois/transformInvoiceData.js';

const apiClient = new EInvoiceApiClient(MYINVOIS_API_BASE_URL, MYINVOIS_CLIENT_ID, MYINVOIS_CLIENT_SECRET);
const submissionHandler = new DocumentSubmissionHandler(apiClient);

app.post('/api/einvoice/submit', async (req, res) => {
  try {
    console.log('Starting invoice submission process');
    const { invoiceId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: 'No invoice ID provided for submission'
      });
    }

    try {
      // 1. Fetch invoice data from database
      const invoiceData = await fetchInvoiceFromDb(invoiceId);
      
      // 2. Transform invoice data to MyInvois format
      const transformedInvoice = transformInvoiceToMyInvoisFormat(invoiceData);
      
      // 3. Submit transformed invoice
      const result = await submissionHandler.submitAndPollDocument(transformedInvoice);

      if (result.success) {
        console.log('Invoice submission successful:', JSON.stringify(result, null, 2));
        res.json({
          success: true,
          message: result.message,
          submissionUid: result.submissionUid,
          acceptedDocuments: result.acceptedDocuments
        });
      } else {
        console.error('Invoice submission failed:', JSON.stringify(result, null, 2));
        res.status(400).json({
          success: false,
          message: result.message,
          submissionUid: result.submissionUid,
          rejectedDocuments: result.rejectedDocuments
        });
      }

    } catch (error) {
      console.error('Error in invoice processing:', error);
      throw error; // Propagate to outer catch block for consistent error handling
    }

  } catch (error) {
    console.error('Error submitting invoice:', error);
    let errorMessage = error.message;
    let errorDetails = null;

    if (error.response) {
      console.error('Error response:', JSON.stringify(error.response, null, 2));
      errorMessage = error.response.data?.error?.message || errorMessage;
      errorDetails = error.response.data?.error?.details || null;
    }

    // Check for specific errors
    if (errorMessage.includes('Document hash is not valid')) {
      errorMessage = 'Document hash validation failed. Please ensure the document content is correct and try again.';
    } else if (errorMessage.includes('Hash verification failed')) {
      errorMessage = 'Internal hash verification failed. This may indicate an issue with the hash calculation process.';
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit invoice to MyInvois API', 
      error: errorMessage,
      details: errorDetails
    });
  }
});

async function fetchInvoiceFromDb(invoiceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First fetch the invoice data
    const invoiceQuery = `
      SELECT 
        i.id, 
        i.invoiceno, 
        i.orderno, 
        TO_CHAR(i.date, 'DD/MM/YYYY') as date,
        i.type,
        i.customer,
        i.customername,
        i.salesman,
        i.totalamount as "totalAmount",
        TO_CHAR(i.time, 'HH24:MI') as time
      FROM 
        invoices i
      WHERE 
        i.id = $1
    `;
    
    const invoiceResult = await client.query(invoiceQuery, [invoiceId]);
    
    if (invoiceResult.rows.length === 0) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    // Then fetch the order details for this invoice
    const orderDetailsQuery = `
      SELECT 
        od.code,
        od.productname as "productname",
        od.qty,
        od.price,
        od.total,
        od.isfoc as "isfoc",
        od.isreturned as "isreturned",
        od.istotal as "istotal",
        od.issubtotal as "issubtotal",
        od.isless as "isless",
        od.istax as "istax"
      FROM 
        order_details od
      WHERE 
        od.invoiceid = $1
      ORDER BY 
        CASE 
          WHEN od.istotal = true THEN 4
          WHEN od.issubtotal = true THEN 3
          WHEN od.isless = true THEN 2
          WHEN od.istax = true THEN 1
          ELSE 0 
        END,
        od.id
    `;

    const orderDetailsResult = await client.query(orderDetailsQuery, [invoiceId]);

    await client.query('COMMIT');

    // Combine invoice data with order details
    const invoice = {
      ...invoiceResult.rows[0],
      orderDetails: orderDetailsResult.rows.map(detail => ({
        ...detail,
        qty: Number(detail.qty),
        price: Number(detail.price),
        total: detail.total
      }))
    };

    return invoice;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fetching invoice from database:', error);
    throw error;
  } finally {
    client.release();
  }
}

app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

// Health check endpoint that verifies database connection
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    const dbCheck = await pool.query('SELECT 1');
    
    // Get active sessions count from database
    const sessionsQuery = `
      SELECT COUNT(*) as count 
      FROM active_sessions 
      WHERE status = 'active' 
      AND last_active > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    `;
    const activeSessionsResult = await pool.query(sessionsQuery);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbCheck.rows.length === 1 ? 'healthy' : 'unhealthy',
          connectionPool: {
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount
          },
          activeSessions: Number(activeSessionsResult.rows[0].count)
        },
        server: {
          status: 'healthy',
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage().heapUsed
        }
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});