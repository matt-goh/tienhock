// src/routes/payroll/contribution-rates.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all EPF rates
  router.get("/epf", async (req, res) => {
    try {
      const query = `
        SELECT * FROM epf_rates 
        WHERE is_active = true 
        ORDER BY employee_type, wage_threshold NULLS LAST
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching EPF rates:", error);
      res.status(500).json({
        message: "Error fetching EPF rates",
        error: error.message,
      });
    }
  });

  // Get all SOCSO rates
  router.get("/socso", async (req, res) => {
    try {
      const query = `
        SELECT * FROM socso_rates 
        WHERE is_active = true 
        ORDER BY wage_from
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching SOCSO rates:", error);
      res.status(500).json({
        message: "Error fetching SOCSO rates",
        error: error.message,
      });
    }
  });

  // Get all SIP rates
  router.get("/sip", async (req, res) => {
    try {
      const query = `
        SELECT * FROM sip_rates 
        WHERE is_active = true 
        ORDER BY wage_from
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching SIP rates:", error);
      res.status(500).json({
        message: "Error fetching SIP rates",
        error: error.message,
      });
    }
  });

  // Update EPF rate
  router.put("/epf/:id", async (req, res) => {
    const { id } = req.params;
    const {
      employee_type,
      wage_threshold,
      employee_rate_percentage,
      employer_rate_percentage,
      employer_fixed_amount,
    } = req.body;

    try {
      const query = `
        UPDATE epf_rates
        SET employee_type = $1, wage_threshold = $2, employee_rate_percentage = $3,
            employer_rate_percentage = $4, employer_fixed_amount = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `;
      const result = await pool.query(query, [
        employee_type,
        wage_threshold,
        employee_rate_percentage,
        employer_rate_percentage,
        employer_fixed_amount,
        id,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "EPF rate not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating EPF rate:", error);
      res.status(500).json({
        message: "Error updating EPF rate",
        error: error.message,
      });
    }
  });

  // Update SOCSO rate
  router.put("/socso/:id", async (req, res) => {
    const { id } = req.params;
    const {
      wage_from,
      wage_to,
      employee_rate,
      employer_rate,
      employer_rate_over_60,
    } = req.body;

    try {
      const query = `
      UPDATE socso_rates
      SET wage_from = $1, wage_to = $2, employee_rate = $3,
          employer_rate = $4, employer_rate_over_60 = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
      const result = await pool.query(query, [
        wage_from,
        wage_to,
        employee_rate,
        employer_rate,
        employer_rate_over_60,
        id,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "SOCSO rate not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating SOCSO rate:", error);
      res.status(500).json({
        message: "Error updating SOCSO rate",
        error: error.message,
      });
    }
  });

  // Update SIP rate
  router.put("/sip/:id", async (req, res) => {
    const { id } = req.params;
    const { wage_from, wage_to, employee_rate, employer_rate } = req.body;

    try {
      const query = `
        UPDATE sip_rates
        SET wage_from = $1, wage_to = $2, employee_rate = $3,
            employer_rate = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `;
      const result = await pool.query(query, [
        wage_from,
        wage_to,
        employee_rate,
        employer_rate,
        id,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "SIP rate not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating SIP rate:", error);
      res.status(500).json({
        message: "Error updating SIP rate",
        error: error.message,
      });
    }
  });

  // Get all Income Tax rates
  router.get("/income-tax", async (req, res) => {
    try {
      const query = `
      SELECT * FROM income_tax_rates 
      WHERE is_active = true 
      ORDER BY wage_from
    `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Income Tax rates:", error);
      res.status(500).json({
        message: "Error fetching Income Tax rates",
        error: error.message,
      });
    }
  });

  // Update Income Tax rate
  router.put("/income-tax/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { id } = req.params;
      const updates = req.body;

      // Build update query dynamically
      const updateFields = Object.keys(updates)
        .filter((key) => key !== "id" && key !== "updated_at")
        .map((key, index) => `${key} = $${index + 2}`)
        .join(", ");

      const updateValues = Object.keys(updates)
        .filter((key) => key !== "id" && key !== "updated_at")
        .map((key) => updates[key]);

      const query = `
      UPDATE income_tax_rates 
      SET ${updateFields}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

      const result = await client.query(query, [id, ...updateValues]);

      if (result.rows.length === 0) {
        throw new Error("Income Tax rate not found");
      }

      await client.query("COMMIT");
      res.json(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating Income Tax rate:", error);
      res.status(500).json({
        message: "Error updating Income Tax rate",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Create new Income Tax rate
  router.post("/income-tax", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const {
        wage_from,
        wage_to,
        base_rate,
        unemployed_spouse_k0,
        unemployed_spouse_k1,
        unemployed_spouse_k2,
        unemployed_spouse_k3,
        unemployed_spouse_k4,
        unemployed_spouse_k5,
        unemployed_spouse_k6,
        unemployed_spouse_k7,
        unemployed_spouse_k8,
        unemployed_spouse_k9,
        unemployed_spouse_k10,
        employed_spouse_k0,
        employed_spouse_k1,
        employed_spouse_k2,
        employed_spouse_k3,
        employed_spouse_k4,
        employed_spouse_k5,
        employed_spouse_k6,
        employed_spouse_k7,
        employed_spouse_k8,
        employed_spouse_k9,
        employed_spouse_k10,
      } = req.body;

      const query = `
      INSERT INTO income_tax_rates (
        wage_from, wage_to, base_rate,
        unemployed_spouse_k0, unemployed_spouse_k1, unemployed_spouse_k2, unemployed_spouse_k3, unemployed_spouse_k4,
        unemployed_spouse_k5, unemployed_spouse_k6, unemployed_spouse_k7, unemployed_spouse_k8, unemployed_spouse_k9, unemployed_spouse_k10,
        employed_spouse_k0, employed_spouse_k1, employed_spouse_k2, employed_spouse_k3, employed_spouse_k4,
        employed_spouse_k5, employed_spouse_k6, employed_spouse_k7, employed_spouse_k8, employed_spouse_k9, employed_spouse_k10
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *
    `;

      const values = [
        wage_from,
        wage_to,
        base_rate,
        unemployed_spouse_k0,
        unemployed_spouse_k1,
        unemployed_spouse_k2,
        unemployed_spouse_k3,
        unemployed_spouse_k4,
        unemployed_spouse_k5,
        unemployed_spouse_k6,
        unemployed_spouse_k7,
        unemployed_spouse_k8,
        unemployed_spouse_k9,
        unemployed_spouse_k10,
        employed_spouse_k0,
        employed_spouse_k1,
        employed_spouse_k2,
        employed_spouse_k3,
        employed_spouse_k4,
        employed_spouse_k5,
        employed_spouse_k6,
        employed_spouse_k7,
        employed_spouse_k8,
        employed_spouse_k9,
        employed_spouse_k10,
      ];

      const result = await client.query(query, values);

      await client.query("COMMIT");
      res.json(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Income Tax rate:", error);
      res.status(500).json({
        message: "Error creating Income Tax rate",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete Income Tax rate
  router.delete("/income-tax/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { id } = req.params;

      const query = `
      DELETE FROM income_tax_rates 
      WHERE id = $1
      RETURNING *
    `;

      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Income Tax rate not found" });
      }

      await client.query("COMMIT");
      res.json({ message: "Income Tax rate deleted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting Income Tax rate:", error);
      res.status(500).json({
        message: "Error deleting Income Tax rate",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
