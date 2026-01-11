// src/routes/greentarget/driver-trips.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get driver trips for a specific year/month
  router.get("/", async (req, res) => {
    const { year, month, driver_id } = req.query;

    try {
      let query = `
        SELECT
          dt.*,
          s.name as driver_name
        FROM greentarget.driver_trips dt
        LEFT JOIN public.staffs s ON dt.driver_id = s.id
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;

      if (year) {
        query += ` AND dt.year = $${paramCount++}`;
        values.push(parseInt(year));
      }
      if (month) {
        query += ` AND dt.month = $${paramCount++}`;
        values.push(parseInt(month));
      }
      if (driver_id) {
        query += ` AND dt.driver_id = $${paramCount++}`;
        values.push(driver_id);
      }

      query += ` ORDER BY s.name, dt.year DESC, dt.month DESC`;

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching driver trips:", error);
      res.status(500).json({
        message: "Error fetching driver trips",
        error: error.message,
      });
    }
  });

  // Auto-calculate trips from rentals
  router.get("/auto-calculate", async (req, res) => {
    const { year, month, driver_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "year and month are required",
      });
    }

    try {
      // Calculate first and last day of the month
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay}`;

      // Query completed rentals (those with date_picked)
      let query = `
        SELECT
          r.driver,
          s.name as driver_name,
          COUNT(*) as trip_count,
          array_agg(r.rental_id ORDER BY r.date_placed) as rental_ids
        FROM greentarget.rentals r
        LEFT JOIN public.staffs s ON r.driver = s.id
        WHERE r.date_picked IS NOT NULL
          AND r.date_placed >= $1
          AND r.date_placed <= $2
      `;
      const values = [startDate, endDate];
      let paramCount = 3;

      if (driver_id) {
        query += ` AND r.driver = $${paramCount++}`;
        values.push(driver_id);
      }

      query += ` GROUP BY r.driver, s.name ORDER BY s.name`;

      const result = await pool.query(query, values);

      res.json({
        year: parseInt(year),
        month: parseInt(month),
        drivers: result.rows.map((row) => ({
          driver_id: row.driver,
          driver_name: row.driver_name,
          trip_count: parseInt(row.trip_count),
          rental_ids: row.rental_ids,
        })),
      });
    } catch (error) {
      console.error("Error auto-calculating driver trips:", error);
      res.status(500).json({
        message: "Error auto-calculating driver trips",
        error: error.message,
      });
    }
  });

  // Calculate detailed payroll breakdown based on rules
  router.get("/calculate-payroll", async (req, res) => {
    const { year, month, driver_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "year and month are required",
      });
    }

    try {
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay}`;

      // Get default invoice amount from settings
      const settingsResult = await pool.query(
        `SELECT setting_value FROM greentarget.payroll_settings WHERE setting_key = 'default_invoice_amount'`
      );
      const defaultInvoiceAmount = settingsResult.rows.length > 0
        ? parseFloat(settingsResult.rows[0].setting_value)
        : 200;

      // Query completed rentals with invoice amounts
      let query = `
        SELECT
          r.rental_id,
          r.date_placed,
          r.date_picked,
          r.driver,
          r.pickup_destination,
          pd.name as pickup_destination_name,
          c.name as customer_name,
          COALESCE(
            (SELECT SUM(i.total_excluding_tax)
             FROM greentarget.invoice_rentals ir
             JOIN greentarget.invoices i ON ir.invoice_id = i.invoice_id
             WHERE ir.rental_id = r.rental_id AND i.invoice_status != 'Cancelled'),
            NULL
          ) as invoice_amount,
          EXISTS(
            SELECT 1 FROM greentarget.invoice_rentals ir
            JOIN greentarget.invoices i ON ir.invoice_id = i.invoice_id
            WHERE ir.rental_id = r.rental_id AND i.invoice_status != 'Cancelled'
          ) as has_invoice,
          s.name as driver_name
        FROM greentarget.rentals r
        LEFT JOIN public.staffs s ON r.driver = s.id
        LEFT JOIN greentarget.customers c ON r.customer_id = c.customer_id
        LEFT JOIN greentarget.pickup_destinations pd ON r.pickup_destination = pd.code
        WHERE r.date_picked IS NOT NULL
          AND r.date_placed >= $1
          AND r.date_placed <= $2
      `;
      const values = [startDate, endDate];
      let paramCount = 3;

      if (driver_id) {
        query += ` AND r.driver = $${paramCount++}`;
        values.push(driver_id);
      }

      query += ` ORDER BY r.driver, r.date_placed`;

      const rentalsResult = await pool.query(query, values);

      // Get all active payroll rules
      const rulesResult = await pool.query(
        `SELECT * FROM greentarget.payroll_rules WHERE is_active = true ORDER BY rule_type, priority DESC`
      );
      const rules = rulesResult.rows;

      // Get all rental addons for these rentals
      const rentalIds = rentalsResult.rows.map((r) => r.rental_id);
      let addonsMap = {};
      if (rentalIds.length > 0) {
        const addonsResult = await pool.query(
          `SELECT ra.*, pc.description as pay_code_description, ap.display_name
           FROM greentarget.rental_addons ra
           JOIN pay_codes pc ON ra.pay_code_id = pc.id
           LEFT JOIN greentarget.addon_paycodes ap ON ra.pay_code_id = ap.pay_code_id
           WHERE ra.rental_id = ANY($1)`,
          [rentalIds]
        );
        addonsResult.rows.forEach((addon) => {
          if (!addonsMap[addon.rental_id]) {
            addonsMap[addon.rental_id] = [];
          }
          addonsMap[addon.rental_id].push(addon);
        });
      }

      // Get pay codes info for the rules
      const payCodeIds = [...new Set(rules.map((r) => r.pay_code_id))];
      const payCodesResult = await pool.query(
        `SELECT id, description, rate_biasa FROM pay_codes WHERE id = ANY($1)`,
        [payCodeIds]
      );
      const payCodesMap = {};
      payCodesResult.rows.forEach((pc) => {
        payCodesMap[pc.id] = pc;
      });

      // Process each rental and apply rules
      const processedRentals = [];
      const driverSummaries = {};

      for (const rental of rentalsResult.rows) {
        const invoiceAmount = rental.invoice_amount !== null
          ? parseFloat(rental.invoice_amount)
          : defaultInvoiceAmount;

        // Find matching PLACEMENT rule
        let placementRule = null;
        for (const rule of rules.filter((r) => r.rule_type === "PLACEMENT")) {
          if (evaluateCondition(invoiceAmount, rule.condition_operator, parseFloat(rule.condition_value))) {
            placementRule = rule;
            break;
          }
        }

        // Find matching PICKUP rule (only if pickup_destination is set)
        let pickupRule = null;
        if (rental.pickup_destination) {
          for (const rule of rules.filter((r) => r.rule_type === "PICKUP")) {
            const primaryMatch = evaluateCondition(
              rental.pickup_destination,
              rule.condition_operator,
              rule.condition_value
            );

            let secondaryMatch = true;
            if (rule.secondary_condition_field && rule.secondary_condition_operator) {
              if (rule.secondary_condition_field === "invoice_amount") {
                secondaryMatch = evaluateCondition(
                  invoiceAmount,
                  rule.secondary_condition_operator,
                  parseFloat(rule.secondary_condition_value)
                );
              }
            }

            if (primaryMatch && secondaryMatch) {
              pickupRule = rule;
              break;
            }
          }
        }

        // Build payroll items for this rental
        const payrollItems = [];

        if (placementRule) {
          const payCode = payCodesMap[placementRule.pay_code_id];
          payrollItems.push({
            type: "PLACEMENT",
            pay_code_id: placementRule.pay_code_id,
            pay_code_description: payCode?.description || placementRule.pay_code_id,
            rate: payCode?.rate_biasa || 0,
            quantity: 1,
            amount: payCode?.rate_biasa || 0,
            rule_description: placementRule.description,
          });
        }

        if (pickupRule) {
          const payCode = payCodesMap[pickupRule.pay_code_id];
          payrollItems.push({
            type: "PICKUP",
            pay_code_id: pickupRule.pay_code_id,
            pay_code_description: payCode?.description || pickupRule.pay_code_id,
            rate: payCode?.rate_biasa || 0,
            quantity: 1,
            amount: payCode?.rate_biasa || 0,
            rule_description: pickupRule.description,
          });
        }

        // Add rental addons
        const addons = addonsMap[rental.rental_id] || [];
        for (const addon of addons) {
          payrollItems.push({
            type: "ADDON",
            pay_code_id: addon.pay_code_id,
            pay_code_description: addon.display_name || addon.pay_code_description,
            rate: parseFloat(addon.amount),
            quantity: parseFloat(addon.quantity),
            amount: parseFloat(addon.amount) * parseFloat(addon.quantity),
            notes: addon.notes,
          });
        }

        const rentalTotal = payrollItems.reduce((sum, item) => sum + item.amount, 0);

        processedRentals.push({
          rental_id: rental.rental_id,
          date_placed: rental.date_placed,
          date_picked: rental.date_picked,
          customer_name: rental.customer_name,
          driver_id: rental.driver,
          driver_name: rental.driver_name,
          pickup_destination: rental.pickup_destination,
          pickup_destination_name: rental.pickup_destination_name,
          invoice_amount: invoiceAmount,
          has_invoice: rental.has_invoice,
          payroll_items: payrollItems,
          total: rentalTotal,
        });

        // Aggregate by driver
        if (!driverSummaries[rental.driver]) {
          driverSummaries[rental.driver] = {
            driver_id: rental.driver,
            driver_name: rental.driver_name,
            rental_count: 0,
            total_amount: 0,
            placement_count: 0,
            pickup_count: 0,
            addon_count: 0,
            no_invoice_count: 0,
          };
        }

        driverSummaries[rental.driver].rental_count++;
        driverSummaries[rental.driver].total_amount += rentalTotal;
        if (placementRule) driverSummaries[rental.driver].placement_count++;
        if (pickupRule) driverSummaries[rental.driver].pickup_count++;
        driverSummaries[rental.driver].addon_count += addons.length;
        if (!rental.has_invoice) driverSummaries[rental.driver].no_invoice_count++;
      }

      res.json({
        year: parseInt(year),
        month: parseInt(month),
        default_invoice_amount: defaultInvoiceAmount,
        rentals: processedRentals,
        driver_summaries: Object.values(driverSummaries),
      });
    } catch (error) {
      console.error("Error calculating payroll breakdown:", error);
      res.status(500).json({
        message: "Error calculating payroll breakdown",
        error: error.message,
      });
    }
  });

  // Get rental details for a driver in a specific month
  router.get("/rentals", async (req, res) => {
    const { year, month, driver_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "year and month are required",
      });
    }

    try {
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay}`;

      let query = `
        SELECT
          r.rental_id,
          r.date_placed,
          r.date_picked,
          r.driver,
          r.customer_id,
          c.name as customer_name,
          r.location_id,
          l.address as location_address,
          r.tong_no,
          r.pickup_destination
        FROM greentarget.rentals r
        LEFT JOIN greentarget.customers c ON r.customer_id = c.customer_id
        LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
        WHERE r.date_placed >= $1 AND r.date_placed <= $2
      `;
      const values = [startDate, endDate];
      let paramCount = 3;

      if (driver_id) {
        query += ` AND r.driver = $${paramCount++}`;
        values.push(driver_id);
      }

      query += ` ORDER BY r.date_placed DESC`;

      const result = await pool.query(query, values);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching rental details:", error);
      res.status(500).json({
        message: "Error fetching rental details",
        error: error.message,
      });
    }
  });

  // Save or update driver trips
  router.post("/", async (req, res) => {
    const { driver_id, year, month, trip_count, completed_rental_ids, auto_calculated, notes } = req.body;

    if (!driver_id || !year || !month) {
      return res.status(400).json({
        message: "driver_id, year, and month are required",
      });
    }

    try {
      // Check if record exists
      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.driver_trips
         WHERE driver_id = $1 AND year = $2 AND month = $3`,
        [driver_id, year, month]
      );

      let result;
      if (existingCheck.rows.length > 0) {
        // Update existing
        result = await pool.query(
          `UPDATE greentarget.driver_trips
           SET trip_count = $1, completed_rental_ids = $2, auto_calculated = $3,
               notes = $4, updated_at = CURRENT_TIMESTAMP
           WHERE driver_id = $5 AND year = $6 AND month = $7
           RETURNING *`,
          [
            trip_count || 0,
            completed_rental_ids || [],
            auto_calculated !== false,
            notes || null,
            driver_id,
            year,
            month,
          ]
        );
        res.json({
          message: "Driver trips updated successfully",
          trip: result.rows[0],
        });
      } else {
        // Insert new
        result = await pool.query(
          `INSERT INTO greentarget.driver_trips
           (driver_id, year, month, trip_count, completed_rental_ids, auto_calculated, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            driver_id,
            year,
            month,
            trip_count || 0,
            completed_rental_ids || [],
            auto_calculated !== false,
            notes || null,
          ]
        );
        res.status(201).json({
          message: "Driver trips created successfully",
          trip: result.rows[0],
        });
      }
    } catch (error) {
      console.error("Error saving driver trips:", error);
      res.status(500).json({
        message: "Error saving driver trips",
        error: error.message,
      });
    }
  });

  // Bulk save driver trips (for auto-calculation of all drivers)
  router.post("/bulk", async (req, res) => {
    const { year, month, drivers } = req.body;

    if (!year || !month || !drivers || !Array.isArray(drivers)) {
      return res.status(400).json({
        message: "year, month, and drivers array are required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const results = [];

      for (const driver of drivers) {
        const { driver_id, trip_count, completed_rental_ids } = driver;

        // Check if record exists
        const existingCheck = await client.query(
          `SELECT id FROM greentarget.driver_trips
           WHERE driver_id = $1 AND year = $2 AND month = $3`,
          [driver_id, year, month]
        );

        let result;
        if (existingCheck.rows.length > 0) {
          result = await client.query(
            `UPDATE greentarget.driver_trips
             SET trip_count = $1, completed_rental_ids = $2, auto_calculated = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE driver_id = $3 AND year = $4 AND month = $5
             RETURNING *`,
            [trip_count || 0, completed_rental_ids || [], driver_id, year, month]
          );
        } else {
          result = await client.query(
            `INSERT INTO greentarget.driver_trips
             (driver_id, year, month, trip_count, completed_rental_ids, auto_calculated)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING *`,
            [driver_id, year, month, trip_count || 0, completed_rental_ids || []]
          );
        }
        results.push(result.rows[0]);
      }

      await client.query("COMMIT");

      res.json({
        message: "Driver trips saved successfully",
        count: results.length,
        trips: results,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error bulk saving driver trips:", error);
      res.status(500).json({
        message: "Error bulk saving driver trips",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete driver trip record
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `DELETE FROM greentarget.driver_trips WHERE id = $1 RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Driver trip record not found" });
      }

      res.json({
        message: "Driver trip record deleted successfully",
        trip: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting driver trip:", error);
      res.status(500).json({
        message: "Error deleting driver trip",
        error: error.message,
      });
    }
  });

  return router;
}

// Helper function to evaluate conditions
function evaluateCondition(value, operator, targetValue) {
  switch (operator) {
    case "=":
      return (
        value === targetValue ||
        (typeof value === "string" &&
          typeof targetValue === "string" &&
          value.toUpperCase() === targetValue.toUpperCase())
      );
    case ">":
      return value > targetValue;
    case "<":
      return value < targetValue;
    case ">=":
      return value >= targetValue;
    case "<=":
      return value <= targetValue;
    case "ANY":
      return true;
    default:
      return false;
  }
}
