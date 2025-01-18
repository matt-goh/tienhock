// src/routes/customers.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all customers
  router.get("/", async (req, res) => {
    try {
      const query = "SELECT * FROM customers ORDER BY name";
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res
        .status(500)
        .json({ message: "Error fetching customers", error: error.message });
    }
  });

  // Get customers for combobox
  router.get("/combobox", async (req, res) => {
    const { salesman = "", search = "", page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    try {
      // Base query for search across all data
      let searchQuery = `
        SELECT id, name
        FROM customers
        WHERE 1=1
      `;

      const searchValues = [];
      let valueIndex = 1;

      // Add salesman filter if provided
      if (salesman && salesman !== "All Salesmen") {
        searchQuery += ` AND salesman = $${valueIndex}`;
        searchValues.push(salesman);
        valueIndex++;
      }

      // Add search filter if provided
      if (search) {
        searchQuery += ` AND (LOWER(name) LIKE $${valueIndex} OR LOWER(id) LIKE $${valueIndex})`;
        searchValues.push(`%${search.toLowerCase()}%`);
        valueIndex++;
      }

      searchQuery += ` ORDER BY name`;

      // Add pagination only for the final results
      if (limit) {
        searchQuery += ` LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
        searchValues.push(Number(limit), offset);
      }

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) 
        FROM customers 
        WHERE 1=1
        ${salesman && salesman !== "All Salesmen" ? " AND salesman = $1" : ""}
        ${
          search
            ? ` AND (LOWER(name) LIKE $${
                salesman ? "2" : "1"
              } OR LOWER(id) LIKE $${salesman ? "2" : "1"})`
            : ""
        }
      `;

      const countValues = [];
      if (salesman && salesman !== "All Salesmen") countValues.push(salesman);
      if (search) countValues.push(`%${search.toLowerCase()}%`);

      const [searchResults, countResults] = await Promise.all([
        pool.query(searchQuery, searchValues),
        pool.query(countQuery, countValues),
      ]);

      const totalCount = parseInt(countResults.rows[0].count);
      const totalPages = Math.ceil(totalCount / Number(limit));

      res.json({
        customers: searchResults.rows,
        totalCount,
        totalPages,
        currentPage: Number(page),
      });
    } catch (error) {
      console.error("Error fetching customers for combobox:", error);
      res.status(500).json({
        message: "Error fetching customers for combobox",
        error: error.message,
      });
    }
  });

  // Create a new customer
  router.post("/", async (req, res) => {
    const {
      id,
      name,
      closeness,
      salesman,
      tin_number,
      phone_number,
      email,
      address,
      city,
      id_number,
    } = req.body;

    try {
      const query = `
        INSERT INTO customers (
          id, 
          name, 
          closeness, 
          salesman, 
          tin_number,
          phone_number,
          email,
          address,
          city,
          id_number
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        id,
        name,
        closeness,
        salesman,
        tin_number,
        phone_number,
        email,
        address,
        city,
        id_number,
      ];

      const result = await pool.query(query, values);
      res.status(201).json({
        message: "Customer created successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        // unique_violation error code
        return res
          .status(400)
          .json({ message: "A customer with this ID already exists" });
      }
      console.error("Error creating customer:", error);
      res
        .status(500)
        .json({ message: "Error creating customer", error: error.message });
    }
  });

  // Delete customers (batch delete)
  router.delete("/", async (req, res) => {
    // Extract customerIds from the request body
    const customerIds = Array.isArray(req.body.customers)
      ? req.body.customers
      : [req.body.customers];

    if (!customerIds || customerIds.length === 0) {
      return res.status(400).json({ message: "Invalid customer IDs provided" });
    }

    try {
      const query = "DELETE FROM customers WHERE id = ANY($1) RETURNING id";
      const result = await pool.query(query, [customerIds]);

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "No customers found with the provided IDs" });
      }

      const deletedIds = result.rows.map((row) => row.id);
      res.json({
        message: "Customers deleted successfully",
        deletedCustomerIds: deletedIds,
      });
    } catch (error) {
      console.error("Error deleting customers:", error);
      res
        .status(500)
        .json({ message: "Error deleting customers", error: error.message });
    }
  });

  // Batch update/insert customers
  router.post("/batch", async (req, res) => {
    const { customers } = req.body;

    if (!Array.isArray(customers)) {
      return res
        .status(400)
        .json({ message: "Invalid input: customers must be an array" });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const processedCustomers = [];

        for (const customer of customers) {
          const {
            id,
            name,
            closeness,
            salesman,
            tin_number,
            phone_number,
            email,
            address,
            city,
            id_number,
          } = customer;

          const upsertQuery = `
            INSERT INTO customers (
              id, 
              name, 
              closeness, 
              salesman, 
              tin_number,
              phone_number,
              email,
              address,
              city,
              id_number
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE
            SET 
              name = EXCLUDED.name,
              closeness = EXCLUDED.closeness,
              salesman = EXCLUDED.salesman,
              tin_number = EXCLUDED.tin_number,
              phone_number = EXCLUDED.phone_number,
              email = EXCLUDED.email,
              address = EXCLUDED.address,
              city = EXCLUDED.city,
              id_number = EXCLUDED.id_number
            RETURNING *
          `;
          const upsertValues = [
            id,
            name,
            closeness,
            salesman,
            tin_number,
            phone_number,
            email,
            address,
            city,
            id_number,
          ];
          const result = await client.query(upsertQuery, upsertValues);
          processedCustomers.push(result.rows[0]);
        }

        await client.query("COMMIT");
        res.json({
          message: "Customers processed successfully",
          customers: processedCustomers,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error processing customers:", error);
      res
        .status(500)
        .json({ message: "Error processing customers", error: error.message });
    }
  });

  // Get customer by ID
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = "SELECT * FROM customers WHERE id = $1";
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching customer:", error);
      res
        .status(500)
        .json({ message: "Error fetching customer", error: error.message });
    }
  });

  // Update a customer
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      name,
      closeness,
      salesman,
      tin_number,
      phone_number,
      email,
      address,
      city,
      id_number,
    } = req.body;

    try {
      const query = `
        UPDATE customers
        SET 
          name = $1, 
          closeness = $2, 
          salesman = $3, 
          tin_number = $4,
          phone_number = $5,
          email = $6,
          address = $7,
          city = $8,
          id_number = $9
        WHERE id = $10
        RETURNING *
      `;

      const values = [
        name,
        closeness,
        salesman,
        tin_number,
        phone_number,
        email,
        address,
        city,
        id_number,
        id,
      ];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json({
        message: "Customer updated successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating customer:", error);
      res
        .status(500)
        .json({ message: "Error updating customer", error: error.message });
    }
  });

  return router;
}
