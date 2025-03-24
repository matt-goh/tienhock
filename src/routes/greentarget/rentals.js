// src/routes/greentarget/rentals.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all rentals (with optional filters)
  router.get("/", async (req, res) => {
    const { customer_id, location_id, tong_no, active_only } = req.query;
    
    try {
      let query = `
        SELECT r.*, 
               c.name as customer_name, 
               l.address as location_address,
               d.status as dumpster_status
        FROM greentarget.rentals r
        JOIN greentarget.customers c ON r.customer_id = c.customer_id
        LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
        JOIN greentarget.dumpsters d ON r.tong_no = d.tong_no
        WHERE 1=1
      `;
      
      const queryParams = [];
      let paramCounter = 1;
      
      if (customer_id) {
        query += ` AND r.customer_id = $${paramCounter}`;
        queryParams.push(customer_id);
        paramCounter++;
      }
      
      if (location_id) {
        query += ` AND r.location_id = $${paramCounter}`;
        queryParams.push(location_id);
        paramCounter++;
      }
      
      if (tong_no) {
        query += ` AND r.tong_no = $${paramCounter}`;
        queryParams.push(tong_no);
        paramCounter++;
      }
      
      if (active_only === 'true') {
        query += ` AND r.date_picked IS NULL`;
      }
      
      query += " ORDER BY r.date_placed DESC";
      
      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target rentals:", error);
      res.status(500).json({
        message: "Error fetching rentals",
        error: error.message,
      });
    }
  });

  // Create a new rental
  router.post("/", async (req, res) => {
    const { 
      customer_id, 
      location_id, 
      tong_no, 
      driver, 
      date_placed, 
      remarks 
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      
      // Check if required fields are provided
      if (!customer_id || !tong_no || !driver || !date_placed) {
        throw new Error("Missing required fields: customer_id, tong_no, driver, date_placed");
      }

      // Update dumpster status to 'rented'
      await client.query(
        `UPDATE greentarget.dumpsters SET status = 'Rented' WHERE tong_no = $1`,
        [tong_no]
      );

      // Update customer last_activity_date
      await client.query(
        `UPDATE greentarget.customers SET last_activity_date = CURRENT_DATE WHERE customer_id = $1`,
        [customer_id]
      );

      // Create the rental
      const rentalQuery = `
        INSERT INTO greentarget.rentals (
          customer_id, 
          location_id, 
          tong_no, 
          driver, 
          date_placed, 
          remarks
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const rentalResult = await client.query(rentalQuery, [
        customer_id,
        location_id || null,
        tong_no,
        driver,
        date_placed,
        remarks || null
      ]);

      await client.query('COMMIT');
      
      res.status(201).json({
        message: "Rental created successfully",
        rental: rentalResult.rows[0],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error creating Green Target rental:", error);
      res.status(500).json({
        message: "Error creating rental",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Update rental (primarily for pickup)
  router.put("/:rental_id", async (req, res) => {
    const { rental_id } = req.params;
    const { date_picked, remarks } = req.body;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      
      // Get current rental information
      const currentRentalQuery = `
        SELECT * FROM greentarget.rentals WHERE rental_id = $1
      `;
      const currentRentalResult = await client.query(currentRentalQuery, [rental_id]);
      
      if (currentRentalResult.rows.length === 0) {
        throw new Error(`Rental with ID ${rental_id} not found`);
      }
      
      const currentRental = currentRentalResult.rows[0];
      
      // If setting date_picked and it wasn't set before, update dumpster status
      if (date_picked && !currentRental.date_picked) {
        await client.query(
          `UPDATE greentarget.dumpsters SET status = 'Available' WHERE tong_no = $1`,
          [currentRental.tong_no]
        );
      }
      
      // Update the rental
      const updateRentalQuery = `
        UPDATE greentarget.rentals
        SET 
          date_picked = COALESCE($1, date_picked),
          remarks = COALESCE($2, remarks)
        WHERE rental_id = $3
        RETURNING *
      `;
      
      const updateRentalResult = await client.query(updateRentalQuery, [
        date_picked || null,
        remarks || currentRental.remarks,
        rental_id
      ]);

      await client.query('COMMIT');
      
      res.json({
        message: "Rental updated successfully",
        rental: updateRentalResult.rows[0],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error updating Green Target rental:", error);
      res.status(500).json({
        message: "Error updating rental",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Generate delivery order PDF
  router.get("/:rental_id/delivery-order", async (req, res) => {
    const { rental_id } = req.params;

    try {
      // Get rental details with joined data
      const query = `
        SELECT r.*, 
               c.name as customer_name, 
               l.address as location_address,
               d.status as dumpster_status
        FROM greentarget.rentals r
        JOIN greentarget.customers c ON r.customer_id = c.customer_id
        LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
        JOIN greentarget.dumpsters d ON r.tong_no = d.tong_no
        WHERE r.rental_id = $1
      `;
      
      const result = await pool.query(query, [rental_id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Rental not found" });
      }
      
      const rentalData = result.rows[0];
      
      // Return the data - in a real implementation, you would generate a PDF here
      // For now, we're just returning the data that would be used in the PDF
      res.json({
        message: "Delivery order data retrieved",
        deliveryOrderData: {
          rental_id: rentalData.rental_id,
          do_number: `DO-${rentalData.rental_id}`,
          date: rentalData.date_placed,
          customer: rentalData.customer_name,
          location: rentalData.location_address || "N/A",
          dumpster: rentalData.tong_no,
          driver: rentalData.driver,
          remarks: rentalData.remarks || ""
        }
      });
    } catch (error) {
      console.error("Error generating delivery order:", error);
      res.status(500).json({
        message: "Error generating delivery order",
        error: error.message,
      });
    }
  });

  return router;
}