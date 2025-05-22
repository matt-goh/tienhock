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

  return router;
}
