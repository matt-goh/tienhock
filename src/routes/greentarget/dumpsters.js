// src/routes/greentarget/dumpsters.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all dumpsters (with optional status filter)
  router.get("/", async (req, res) => {
    const { status } = req.query;

    try {
      let query = "SELECT * FROM greentarget.dumpsters";
      const queryParams = [];

      if (status) {
        query += " WHERE status = $1";
        queryParams.push(status);
      }

      query += " ORDER BY tong_no";

      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target dumpsters:", error);
      res.status(500).json({
        message: "Error fetching dumpsters",
        error: error.message,
      });
    }
  });

  // Create a new dumpster
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

      // Modified overlap check to allow same-day transitions
      // This checks for conflicts but allows a new rental to start on the same day
      // another rental ends
      const overlapQuery = `
        SELECT r.rental_id, r.date_placed, r.date_picked, c.name as customer_name
        FROM greentarget.rentals r
        JOIN greentarget.customers c ON r.customer_id = c.customer_id
        WHERE r.tong_no = $1 AND (
          (r.date_picked IS NULL AND r.date_placed <= $2) OR
          (r.date_picked IS NOT NULL AND r.date_placed <= $2 AND r.date_picked > $2)
        )
      `;

      const overlapResult = await client.query(overlapQuery, [
        tong_no,
        date_placed,
      ]);

      // If we have any conflicts that are NOT same-day transitions
      if (overlapResult.rows.length > 0) {
        // Check if it's a same-day transition (placement date equals another rental's pickup date)
        const sameDay = overlapResult.rows.some(
          (rental) => rental.date_picked && rental.date_picked === date_placed
        );

        // If it's not a same-day transition, it's a real conflict
        if (!sameDay) {
          const conflictRental = overlapResult.rows[0];
          throw new Error(
            `The selected dumpster is not available for the chosen period. ` +
              (conflictRental.date_picked
                ? `Rented until ${conflictRental.date_picked} by ${conflictRental.customer_name}`
                : `Indefinitely rented by ${conflictRental.customer_name}`)
          );
        }
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

  // Get availability of all dumpsters for a specific date
  router.get("/availability", async (req, res) => {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date parameter is required" });
    }

    try {
      // Start by getting all dumpsters
      const dumpstersQuery =
        "SELECT * FROM greentarget.dumpsters ORDER BY tong_no";
      const dumpstersResult = await pool.query(dumpstersQuery);
      const allDumpsters = dumpstersResult.rows;

      // Get ALL rentals, not just the ones overlapping with the selected date
      // This allows us to build a complete availability timeline
      const rentalsQuery = `
        SELECT r.*, c.name as customer_name
        FROM greentarget.rentals r
        JOIN greentarget.customers c ON r.customer_id = c.customer_id
        ORDER BY r.date_placed
      `;
      const rentalsResult = await pool.query(rentalsQuery);
      const allRentals = rentalsResult.rows;

      // Group rentals by dumpster
      const rentalsByDumpster = {};
      allRentals.forEach((rental) => {
        if (!rentalsByDumpster[rental.tong_no]) {
          rentalsByDumpster[rental.tong_no] = [];
        }
        rentalsByDumpster[rental.tong_no].push(rental);
      });

      // Categorize dumpsters
      const available = [];
      const upcoming = [];
      const unavailable = [];

      allDumpsters.forEach((dumpster) => {
        const tong_no = dumpster.tong_no;
        const dumpsterRentals = rentalsByDumpster[tong_no] || [];

        // If dumpster is under maintenance, it's unavailable
        if (dumpster.status === "Maintenance") {
          unavailable.push({
            ...dumpster,
            reason: "Under maintenance",
          });
          return;
        }

        // Check all rentals for this dumpster to build a timeline
        const currentDate = new Date(date);
        currentDate.setHours(0, 0, 0, 0);

        // Find the rental that overlaps with the selected date, if any
        const currentRental = dumpsterRentals.find((rental) => {
          const startDate = new Date(rental.date_placed);
          const endDate = rental.date_picked
            ? new Date(rental.date_picked)
            : null;

          return (
            startDate <= currentDate && (!endDate || endDate >= currentDate)
          );
        });

        // Find the next rental after the selected date, if any
        const nextRental = dumpsterRentals.find((rental) => {
          const startDate = new Date(rental.date_placed);
          return startDate > currentDate;
        });

        // Is today a transition day? (Current rental ends today and there's no overlap)
        const isSameDayTransition = dumpsterRentals.some((rental) => {
          if (!rental.date_picked) return false;
          const pickupDate = new Date(rental.date_picked);
          pickupDate.setHours(0, 0, 0, 0);
          return pickupDate.getTime() === currentDate.getTime();
        });

        if (currentRental) {
          // If there's a rental for the selected date
          if (!currentRental.date_picked) {
            // Ongoing rental with no end date - completely unavailable
            unavailable.push({
              ...dumpster,
              rental_id: currentRental.rental_id,
              customer: currentRental.customer_name,
              reason: "Has an ongoing rental with no end date",
            });
          } else {
            // Rental with end date - will be available after that date
            const nextAvailableDate = new Date(currentRental.date_picked);

            // Check for future rentals
            const futureRental = dumpsterRentals.find((rental) => {
              const startDate = new Date(rental.date_placed);
              return startDate > nextAvailableDate;
            });

            upcoming.push({
              ...dumpster,
              rental_id: currentRental.rental_id,
              customer: currentRental.customer_name,
              available_after: currentRental.date_picked,
              has_future_rental: !!futureRental,
              next_rental: futureRental
                ? {
                    date: futureRental.date_placed,
                    customer: futureRental.customer_name,
                    rental_id: futureRental.rental_id,
                  }
                : null,
            });
          }
        } else if (isSameDayTransition) {
          // Add to available with special flag
          available.push({
            ...dumpster,
            is_transition_day: true,
            // Find the rental that ends today
            transition_from: dumpsterRentals.find((rental) => {
              if (!rental.date_picked) return false;
              const pickupDate = new Date(rental.date_picked);
              pickupDate.setHours(0, 0, 0, 0);
              return pickupDate.getTime() === currentDate.getTime();
            }),
            // Find the next rental if it exists
            next_rental: nextRental
              ? {
                  date: nextRental.date_placed,
                  customer: nextRental.customer_name,
                  rental_id: nextRental.rental_id,
                }
              : null,
          });
        } else if (nextRental) {
          // No current rental, but has future rentals
          available.push({
            ...dumpster,
            available_until: nextRental.date_placed,
            next_rental: {
              date: nextRental.date_placed,
              customer: nextRental.customer_name,
              rental_id: nextRental.rental_id,
            },
          });
        } else {
          // Completely available with no future rentals
          available.push(dumpster);
        }
      });

      res.json({
        date: date,
        available,
        upcoming,
        unavailable,
      });
    } catch (error) {
      console.error("Error fetching dumpster availability:", error);
      res.status(500).json({
        message: "Error fetching dumpster availability",
        error: error.message,
      });
    }
  });

  // Update a dumpster
  router.put("/:tong_no", async (req, res) => {
    const { tong_no } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    try {
      const query = `
        UPDATE greentarget.dumpsters
        SET status = $1
        WHERE tong_no = $2
        RETURNING *
      `;
      const result = await pool.query(query, [status, tong_no]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Dumpster not found" });
      }

      res.json({
        message: "Dumpster updated successfully",
        dumpster: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating Green Target dumpster:", error);
      res.status(500).json({
        message: "Error updating dumpster",
        error: error.message,
      });
    }
  });

  // Delete a dumpster
  router.delete("/:tong_no", async (req, res) => {
    const { tong_no } = req.params;

    try {
      // First check if the dumpster is in use in any rentals
      const rentalCheck = await pool.query(
        "SELECT COUNT(*) FROM greentarget.rentals WHERE tong_no = $1",
        [tong_no]
      );

      if (parseInt(rentalCheck.rows[0].count) > 0) {
        return res.status(400).json({
          message:
            "Cannot delete dumpster: it is being used in one or more rentals",
        });
      }

      const query =
        "DELETE FROM greentarget.dumpsters WHERE tong_no = $1 RETURNING *";
      const result = await pool.query(query, [tong_no]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Dumpster not found" });
      }

      res.json({
        message: "Dumpster deleted successfully",
        dumpster: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting Green Target dumpster:", error);
      res.status(500).json({
        message: "Error deleting dumpster",
        error: error.message,
      });
    }
  });

  return router;
}
