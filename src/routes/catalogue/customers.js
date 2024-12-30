// src/routes/customers.js
import { Router } from 'express';

export default function(pool) {
  const router = Router();

  // Get all customers
  router.get('/', async (req, res) => {
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
  router.post('/', async (req, res) => {
    const { id, name, closeness, salesman, tin_number } = req.body;

    try {
      const query = `
        INSERT INTO customers (id, name, closeness, salesman, tin_number)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      
      const values = [id, name, closeness, salesman, tin_number];

      const result = await pool.query(query, values);
      res.status(201).json({ 
        message: 'Customer created successfully', 
        customer: result.rows[0] 
      });
    } catch (error) {
      if (error.code === '23505') { // unique_violation error code
        return res.status(400).json({ message: 'A customer with this ID already exists' });
      }
      console.error('Error creating customer:', error);
      res.status(500).json({ message: 'Error creating customer', error: error.message });
    }
  });

  // Update a customer
  router.put('/:id', async (req, res) => {
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

      res.json({ 
        message: 'Customer updated successfully', 
        customer: result.rows[0] 
      });
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ message: 'Error updating customer', error: error.message });
    }
  });

  // Delete customers (batch delete)
  router.delete('/', async (req, res) => {
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
  router.post('/batch', async (req, res) => {
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

  // Get customers for combobox
  router.get('/combobox', async (req, res) => {
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
      res.status(500).json({ 
        message: 'Error fetching customers for combobox', 
        error: error.message 
      });
    }
  });

  return router;
}