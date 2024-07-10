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

app.post('/api/staff', async (req, res) => {
  const {
    id,
    name,
    gender,
    job,
    description,
    payment_type,
  } = req.body;

  try {
    const query = `
      INSERT INTO staff (id, name, gender, job, description, payment_type)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const values = [
      id,
      name,
      gender,
      job,
      description,
      payment_type,
    ];

    await pool.query(query, values);
    res.status(200).json({ message: 'Staff member added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
