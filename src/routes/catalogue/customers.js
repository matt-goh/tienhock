// src/routes/catalogue/customers.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get customers infos for front page display
  router.get("/", async (req, res) => {
    try {
      const query = `
        SELECT 
          id,
          name,
          salesman,
          phone_number,
          tin_number,
          id_number
        FROM customers 
        ORDER BY name
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({
        message: "Error fetching customers",
        error: error.message,
      });
    }
  });

  // Get customers with credit data
  router.get("/get-customers", async (req, res) => {
    try {
      const query = `
      SELECT 
        id,
        name,
        id_number,
        tin_number,
        salesman,
        email,
        phone_number,
        address,
        city,
        credit_used,
        credit_limit
      FROM customers 
      ORDER BY name
    `;
      const result = await pool.query(query);

      // Convert money-related fields to numbers
      const customersWithNumberValues = result.rows.map((customer) => ({
        ...customer,
        credit_used:
          customer.credit_used !== null ? Number(customer.credit_used) : null,
        credit_limit:
          customer.credit_limit !== null ? Number(customer.credit_limit) : null,
      }));

      res.json(customersWithNumberValues);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({
        message: "Error fetching customers",
        error: error.message,
      });
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
      state,
      id_number,
      id_type,
      credit_limit,
      credit_used,
    } = req.body;

    // Transform empty strings to null for numeric fields
    const transformedValues = [
      id,
      name,
      closeness,
      salesman,
      tin_number || null,
      phone_number || null,
      email || null,
      address || null,
      city || null,
      state || null,
      id_number || null,
      id_type || null,
      credit_limit || 3000,
      credit_used || 0,
    ];

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
          state,
          id_number,
          id_type,
          credit_limit,
          credit_used
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const result = await pool.query(query, transformedValues);
      res.status(201).json({
        message: "Customer created successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
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

  // Delete a single customer
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // First delete associated customer products
      await client.query(
        "DELETE FROM customer_products WHERE customer_id = $1",
        [id]
      );

      // Then delete the customer
      const query = "DELETE FROM customers WHERE id = $1 RETURNING *";
      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Customer not found" });
      }

      await client.query("COMMIT");
      res.json({
        message: "Customer deleted successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting customer:", error);
      res
        .status(500)
        .json({ message: "Error deleting customer", error: error.message });
    } finally {
      client.release();
    }
  });

  router.post("/names", async (req, res) => {
    const { customerIds } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(200).json({
        message: "No customer IDs found",
      });
    }

    try {
      const query = `
      SELECT id, name 
      FROM customers 
      WHERE id = ANY($1)
    `;
      const result = await pool.query(query, [customerIds]);

      // Transform the result into a key-value map for easier frontend use
      const customerNamesMap = result.rows.reduce((map, row) => {
        map[row.id] = row.name;
        return map;
      }, {});

      res.json(customerNamesMap);
    } catch (error) {
      console.error("Error fetching customer names:", error);
      res.status(500).json({
        message: "Error fetching customer names",
        error: error.message,
      });
    }
  });

  // Get customer details AND their custom products for the form page
  router.get("/:id/details", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN"); // Start transaction

      // Fetch customer details
      const customerQuery = "SELECT * FROM customers WHERE id = $1";
      const customerResult = await client.query(customerQuery, [id]);

      if (customerResult.rows.length === 0) {
        await client.query("ROLLBACK"); // Rollback if customer not found
        return res.status(404).json({ message: "Customer not found" });
      }

      const customerData = customerResult.rows[0];

      // Convert money-related fields in customer data to numbers
      const formattedCustomerData = {
        ...customerData,
        credit_used:
          customerData.credit_used !== null
            ? Number(customerData.credit_used)
            : null,
        credit_limit:
          customerData.credit_limit !== null
            ? Number(customerData.credit_limit)
            : null,
        // Ensure empty strings are handled if needed, though SELECT * usually returns null
        tin_number: customerData.tin_number || "",
        phone_number: customerData.phone_number || "",
        email: customerData.email || "",
        address: customerData.address || "",
        city: customerData.city || "KOTA KINABALU", // Default if needed
        state: customerData.state || "12", // Default if needed
        id_number: customerData.id_number || "",
        id_type: customerData.id_type || "",
      };

      // Fetch associated custom products
      const productsQuery = `
      SELECT 
        cp.id, 
        cp.customer_id, 
        cp.product_id, 
        cp.custom_price, 
        cp.is_available,
        p.description -- Get product description too
      FROM customer_products cp
      JOIN products p ON cp.product_id = p.id
      WHERE cp.customer_id = $1
      ORDER BY p.description -- Or however you want to sort them
    `;
      const productsResult = await client.query(productsQuery, [id]);

      // Convert custom_price to a number for products
      const customProducts = productsResult.rows.map((cp) => ({
        ...cp,
        custom_price: cp.custom_price !== null ? Number(cp.custom_price) : 0, // Default to 0 or handle as needed
        is_available: cp.is_available !== undefined ? cp.is_available : true, // Default to true
      }));

      await client.query("COMMIT"); // Commit transaction

      // Combine results
      res.json({
        customer: formattedCustomerData,
        customProducts: customProducts,
      });
    } catch (error) {
      await client.query("ROLLBACK"); // Rollback on any error
      console.error("Error fetching customer details and products:", error);
      res.status(500).json({
        message: "Error fetching customer details and products",
        error: error.message,
      });
    } finally {
      client.release();
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
      state,
      id_number,
      id_type,
      newId,
      credit_limit,
      credit_used,
    } = req.body;

    // Are we trying to change the ID?
    const isChangingId = newId && newId !== id;

    try {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        if (isChangingId) {
          // 1. Check if new ID already exists
          const checkQuery = "SELECT id FROM customers WHERE id = $1";
          const checkResult = await client.query(checkQuery, [newId]);

          if (checkResult.rows.length > 0) {
            throw new Error(`Customer with ID ${newId} already exists`);
          }

          // 2. Insert new customer with new ID
          const insertQuery = `
            INSERT INTO customers (
              id, name, closeness, salesman, tin_number, phone_number, email, 
              address, city, state, id_number, id_type, credit_limit, credit_used
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            ) RETURNING *
          `;

          const insertValues = [
            newId,
            name,
            closeness,
            salesman,
            tin_number || null,
            phone_number || null,
            email || null,
            address || null,
            city || null,
            state || null,
            id_number || null,
            id_type || null,
            credit_limit || 3000,
            credit_used || 0,
          ];

          const insertResult = await client.query(insertQuery, insertValues);

          // 3. Move all products to new customer ID
          const updateProductsQuery = `
            UPDATE customer_products 
            SET customer_id = $1 
            WHERE customer_id = $2
          `;
          await client.query(updateProductsQuery, [newId, id]);

          // 4. Delete old customer record
          await client.query("DELETE FROM customers WHERE id = $1", [id]);

          await client.query("COMMIT");

          res.json({
            message: "Customer ID changed successfully",
            customer: insertResult.rows[0],
          });
        } else {
          // Regular update without ID change
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
              state = $9,
              id_number = $10,
              id_type = $11,
              credit_limit = $12,
              credit_used = $13
            WHERE id = $14
            RETURNING *
          `;

          const values = [
            name,
            closeness,
            salesman,
            tin_number || null,
            phone_number || null,
            email || null,
            address || null,
            city || null,
            state || null,
            id_number || null,
            id_type || null,
            credit_limit || 0, // Default to 0 if not provided
            credit_used || 0,
            id,
          ];

          const result = await client.query(query, values);

          if (result.rows.length === 0) {
            throw new Error("Customer not found");
          }

          await client.query("COMMIT");

          res.json({
            message: "Customer updated successfully",
            customer: result.rows[0],
          });
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({
        message: "Error updating customer",
        error: error.message,
      });
    }
  });

  return router;
}
