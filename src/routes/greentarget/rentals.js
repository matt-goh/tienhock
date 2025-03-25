// src/routes/greentarget/rentals.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  const updateExpiredRentals = async (pool) => {
    const client = await pool.connect();
    try {
      const today = new Date().toISOString().split("T")[0];

      // Get all rentals with pickup dates that have passed
      const expiredRentalsQuery = `
        SELECT r.rental_id, r.tong_no
        FROM greentarget.rentals r
        WHERE r.date_picked < $1
      `;

      const expiredRentalsResult = await client.query(expiredRentalsQuery, [
        today,
      ]);

      // For each dumpster, check if there are any active rentals
      const processedDumpsters = new Set();

      for (const rental of expiredRentalsResult.rows) {
        if (!processedDumpsters.has(rental.tong_no)) {
          processedDumpsters.add(rental.tong_no);

          // Check if this dumpster has any active rentals
          const activeRentalsQuery = `
            SELECT COUNT(*) 
            FROM greentarget.rentals 
            WHERE tong_no = $1 
            AND (date_picked IS NULL OR date_picked >= $2)
            AND date_placed <= $2
          `;

          const activeRentalsResult = await client.query(activeRentalsQuery, [
            rental.tong_no,
            today,
          ]);

          // If no active rentals, set dumpster status to Available
          if (parseInt(activeRentalsResult.rows[0].count) === 0) {
            await client.query(
              `UPDATE greentarget.dumpsters SET status = 'Available' WHERE tong_no = $1`,
              [rental.tong_no]
            );
          }
        }
      }
    } catch (error) {
      console.error("Error updating expired rentals:", error);
    } finally {
      client.release();
    }
  };

  // Get all rentals (with optional filters)
  router.get("/", async (req, res) => {
    await updateExpiredRentals(pool);
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

      if (active_only === "true") {
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
    const { customer_id, location_id, tong_no, driver, date_placed, remarks } =
      req.body;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if required fields are provided
      if (!customer_id || !tong_no || !driver || !date_placed) {
        throw new Error(
          "Missing required fields: customer_id, tong_no, driver, date_placed"
        );
      }

      const currentDate = new Date().toISOString().split("T")[0];

      // Check for overlapping rentals
      const overlapQuery = `
        SELECT COUNT(*) 
        FROM greentarget.rentals 
        WHERE tong_no = $1 AND (
          (date_picked IS NULL OR $2 < date_picked) AND
          (date_placed <= $2)
        )
      `;
      const overlapResult = await client.query(overlapQuery, [
        tong_no,
        date_placed,
      ]);
      if (parseInt(overlapResult.rows[0].count) > 0) {
        throw new Error(
          "The selected dumpster is not available for the chosen period"
        );
      }

      // Update dumpster status to 'rented' only if the rental starts today or earlier
      if (date_placed <= currentDate) {
        await client.query(
          `UPDATE greentarget.dumpsters SET status = 'Rented' WHERE tong_no = $1`,
          [tong_no]
        );
      }

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
        remarks || null,
      ]);

      await client.query("COMMIT");

      res.status(201).json({
        message: "Rental created successfully",
        rental: rentalResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Green Target rental:", error);
      res.status(500).json({
        message: "Error creating rental",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Update rental
  router.put("/:rental_id", async (req, res) => {
    const { rental_id } = req.params;
    const { location_id, tong_no, driver, date_placed, date_picked, remarks } =
      req.body;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get current rental information
      const currentRentalQuery = `
        SELECT * FROM greentarget.rentals WHERE rental_id = $1
      `;
      const currentRentalResult = await client.query(currentRentalQuery, [
        rental_id,
      ]);

      if (currentRentalResult.rows.length === 0) {
        throw new Error(`Rental with ID ${rental_id} not found`);
      }

      const currentRental = currentRentalResult.rows[0];
      const currentDate = new Date().toISOString().split("T")[0];

      // Validate dates if provided
      if (date_placed && date_picked && date_placed > date_picked) {
        throw new Error("Placement date cannot be after pickup date");
      }

      const newTongNo = tong_no || currentRental.tong_no;
      const newDatePlaced = date_placed || currentRental.date_placed;
      const newDatePicked =
        date_picked !== undefined ? date_picked : currentRental.date_picked;

      // Handle dumpster changes if tong_no is being updated
      if (tong_no && tong_no !== currentRental.tong_no) {
        // Check if the new dumpster is available for the period
        const overlapQuery = `
          SELECT COUNT(*) 
          FROM greentarget.rentals 
          WHERE tong_no = $1 AND rental_id != $2 AND (
            (date_picked IS NULL OR $3 < date_picked) AND
            (date_placed <= $3)
          )
        `;
        const overlapResult = await client.query(overlapQuery, [
          tong_no,
          rental_id,
          newDatePlaced,
        ]);

        if (parseInt(overlapResult.rows[0].count) > 0) {
          throw new Error(
            `Dumpster ${tong_no} is not available for the chosen period`
          );
        }

        // Check if the new dumpster exists
        const dumpsterQuery = `
          SELECT status FROM greentarget.dumpsters WHERE tong_no = $1
        `;
        const dumpsterResult = await client.query(dumpsterQuery, [tong_no]);

        if (dumpsterResult.rows.length === 0) {
          throw new Error(`Dumpster ${tong_no} not found`);
        }

        // Update the old dumpster to Available if no other active rentals
        const oldRentalsQuery = `
          SELECT COUNT(*) FROM greentarget.rentals 
          WHERE tong_no = $1 AND rental_id != $2 
          AND date_picked IS NULL AND date_placed <= $3
        `;
        const oldRentalsResult = await client.query(oldRentalsQuery, [
          currentRental.tong_no,
          rental_id,
          currentDate,
        ]);

        if (parseInt(oldRentalsResult.rows[0].count) === 0) {
          await client.query(
            `UPDATE greentarget.dumpsters SET status = 'Available' WHERE tong_no = $1`,
            [currentRental.tong_no]
          );
        }

        // Update the new dumpster to Rented if the rental is active now
        if (newDatePlaced <= currentDate && !newDatePicked) {
          await client.query(
            `UPDATE greentarget.dumpsters SET status = 'Rented' WHERE tong_no = $1`,
            [tong_no]
          );
        }
      } else {
        // If setting date_picked and it wasn't set before, check if we should update dumpster status
        if (date_picked && !currentRental.date_picked) {
          // Only update to Available if there are no other active rentals for this dumpster
          // and the pickup date is not in the future
          const today = new Date().toISOString().split("T")[0];

          // Only mark as Available if the pickup date is today or in the past
          if (date_picked <= today) {
            const activeRentalsQuery = `
              SELECT COUNT(*) FROM greentarget.rentals 
              WHERE tong_no = $1 AND rental_id != $2 
              AND (date_picked IS NULL OR date_picked > $3)
              AND date_placed <= $4
            `;
            const activeRentalsResult = await client.query(activeRentalsQuery, [
              currentRental.tong_no,
              rental_id,
              today,
              today,
            ]);

            if (parseInt(activeRentalsResult.rows[0].count) === 0) {
              await client.query(
                `UPDATE greentarget.dumpsters SET status = 'Available' WHERE tong_no = $1`,
                [currentRental.tong_no]
              );
            }
          }
        }
        // If removing a date_picked that was previously set, update dumpster status back to Rented
        else if (
          currentRental.date_picked &&
          date_picked === null &&
          newDatePlaced <= currentDate
        ) {
          await client.query(
            `UPDATE greentarget.dumpsters SET status = 'Rented' WHERE tong_no = $1`,
            [currentRental.tong_no]
          );
        }
      }

      // Update the rental with all editable fields
      const updateRentalQuery = `
        UPDATE greentarget.rentals
        SET 
          location_id = COALESCE($1, location_id),
          tong_no = COALESCE($2, tong_no),
          driver = COALESCE($3, driver),
          date_placed = COALESCE($4, date_placed),
          date_picked = $5,
          remarks = $6
        WHERE rental_id = $7
        RETURNING *
      `;

      const updateRentalResult = await client.query(updateRentalQuery, [
        location_id || null,
        tong_no || currentRental.tong_no,
        driver || currentRental.driver,
        date_placed || currentRental.date_placed,
        date_picked, // Allow setting to null
        remarks, // Allow setting to null
        rental_id,
      ]);

      await client.query("COMMIT");

      res.json({
        message: "Rental updated successfully",
        rental: updateRentalResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
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
          remarks: rentalData.remarks || "",
        },
      });
    } catch (error) {
      console.error("Error generating delivery order:", error);
      res.status(500).json({
        message: "Error generating delivery order",
        error: error.message,
      });
    }
  });

  // Get rental by ID
  router.get("/:rental_id", async (req, res) => {
    const { rental_id } = req.params;

    try {
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

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching Green Target rental:", error);
      res.status(500).json({
        message: "Error fetching rental",
        error: error.message,
      });
    }
  });

  // Delete a rental
  router.delete("/:rental_id", async (req, res) => {
    const { rental_id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get rental details before deletion
      const rentalQuery =
        "SELECT * FROM greentarget.rentals WHERE rental_id = $1";
      const rentalResult = await client.query(rentalQuery, [rental_id]);

      if (rentalResult.rows.length === 0) {
        return res.status(404).json({ message: "Rental not found" });
      }

      const rental = rentalResult.rows[0];

      // Check if rental is associated with an invoice
      const invoiceQuery =
        "SELECT COUNT(*) FROM greentarget.invoices WHERE rental_id = $1";
      const invoiceResult = await client.query(invoiceQuery, [rental_id]);

      if (parseInt(invoiceResult.rows[0].count) > 0) {
        throw new Error("Cannot delete rental: it has associated invoices");
      }

      // Delete the rental
      const deleteQuery =
        "DELETE FROM greentarget.rentals WHERE rental_id = $1 RETURNING *";
      const deleteResult = await client.query(deleteQuery, [rental_id]);

      // Check if there are any other active rentals for this dumpster
      const currentDate = new Date().toISOString().split("T")[0];
      const activeRentalsQuery = `
      SELECT COUNT(*) FROM greentarget.rentals 
      WHERE tong_no = $1 
      AND rental_id != $2
      AND date_placed <= $3
      AND (date_picked IS NULL OR date_picked >= $3)
    `;
      const activeRentalsResult = await client.query(activeRentalsQuery, [
        rental.tong_no,
        rental_id,
        currentDate,
      ]);

      // If no other active rentals, update dumpster status to Available
      if (parseInt(activeRentalsResult.rows[0].count) === 0) {
        await client.query(
          `UPDATE greentarget.dumpsters SET status = 'Available' WHERE tong_no = $1`,
          [rental.tong_no]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "Rental deleted successfully",
        rental: deleteResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting Green Target rental:", error);
      res.status(500).json({
        message: error.message || "Error deleting rental",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
