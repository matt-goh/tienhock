// src/routes/greentarget/payroll-rules.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET all payroll rules (optionally filtered by rule_type)
  router.get("/", async (req, res) => {
    try {
      const { rule_type, include_inactive } = req.query;

      let query = `
        SELECT
          pr.id,
          pr.rule_type,
          pr.condition_field,
          pr.condition_operator,
          pr.condition_value,
          pr.secondary_condition_field,
          pr.secondary_condition_operator,
          pr.secondary_condition_value,
          pr.pay_code_id,
          pr.priority,
          pr.is_active,
          pr.description,
          pr.created_at,
          pr.updated_at,
          pc.description as pay_code_description,
          pc.rate_biasa as pay_code_rate
        FROM greentarget.payroll_rules pr
        JOIN pay_codes pc ON pr.pay_code_id = pc.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (rule_type) {
        query += ` AND pr.rule_type = $${paramIndex++}`;
        params.push(rule_type);
      }

      if (include_inactive !== 'true') {
        query += ` AND pr.is_active = true`;
      }

      query += ` ORDER BY pr.rule_type, pr.priority DESC, pr.id`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching payroll rules:", error);
      res.status(500).json({ error: "Failed to fetch payroll rules" });
    }
  });

  // GET all GT-related pay codes (MUST be before /:id route)
  router.get("/pay-codes", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, description, rate_biasa, rate_ahad, rate_umum, pay_type, rate_unit, is_active
         FROM pay_codes
         WHERE (id LIKE 'GT_%' OR id LIKE 'TRIP%' OR id = 'HTRB') AND is_active = true
         ORDER BY id`
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching pay codes:", error);
      res.status(500).json({ error: "Failed to fetch pay codes" });
    }
  });

  // GET single payroll rule by ID
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT
          pr.id,
          pr.rule_type,
          pr.condition_field,
          pr.condition_operator,
          pr.condition_value,
          pr.secondary_condition_field,
          pr.secondary_condition_operator,
          pr.secondary_condition_value,
          pr.pay_code_id,
          pr.priority,
          pr.is_active,
          pr.description,
          pr.created_at,
          pr.updated_at,
          pc.description as pay_code_description,
          pc.rate_biasa as pay_code_rate
        FROM greentarget.payroll_rules pr
        JOIN pay_codes pc ON pr.pay_code_id = pc.id
        WHERE pr.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Payroll rule not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching payroll rule:", error);
      res.status(500).json({ error: "Failed to fetch payroll rule" });
    }
  });

  // POST create new payroll rule
  router.post("/", async (req, res) => {
    try {
      const {
        rule_type,
        condition_field,
        condition_operator,
        condition_value,
        secondary_condition_field,
        secondary_condition_operator,
        secondary_condition_value,
        pay_code_id,
        priority = 0,
        description
      } = req.body;

      // Validate required fields
      if (!rule_type || !condition_field || !condition_operator || !pay_code_id) {
        return res.status(400).json({
          error: "rule_type, condition_field, condition_operator, and pay_code_id are required"
        });
      }

      // Validate rule_type
      if (!['PLACEMENT', 'PICKUP'].includes(rule_type)) {
        return res.status(400).json({ error: "rule_type must be PLACEMENT or PICKUP" });
      }

      // Validate pay_code exists
      const payCodeCheck = await pool.query(
        `SELECT id FROM pay_codes WHERE id = $1`,
        [pay_code_id]
      );

      if (payCodeCheck.rows.length === 0) {
        return res.status(400).json({ error: "Invalid pay_code_id" });
      }

      const result = await pool.query(
        `INSERT INTO greentarget.payroll_rules (
          rule_type, condition_field, condition_operator, condition_value,
          secondary_condition_field, secondary_condition_operator, secondary_condition_value,
          pay_code_id, priority, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          rule_type,
          condition_field,
          condition_operator,
          condition_value,
          secondary_condition_field || null,
          secondary_condition_operator || null,
          secondary_condition_value || null,
          pay_code_id,
          priority,
          description || null
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating payroll rule:", error);
      res.status(500).json({ error: "Failed to create payroll rule" });
    }
  });

  // PUT update payroll rule
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const {
        rule_type,
        condition_field,
        condition_operator,
        condition_value,
        secondary_condition_field,
        secondary_condition_operator,
        secondary_condition_value,
        pay_code_id,
        priority,
        is_active,
        description
      } = req.body;

      // Check if rule exists
      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.payroll_rules WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Payroll rule not found" });
      }

      // Validate pay_code if provided
      if (pay_code_id) {
        const payCodeCheck = await pool.query(
          `SELECT id FROM pay_codes WHERE id = $1`,
          [pay_code_id]
        );

        if (payCodeCheck.rows.length === 0) {
          return res.status(400).json({ error: "Invalid pay_code_id" });
        }
      }

      const result = await pool.query(
        `UPDATE greentarget.payroll_rules
         SET rule_type = COALESCE($1, rule_type),
             condition_field = COALESCE($2, condition_field),
             condition_operator = COALESCE($3, condition_operator),
             condition_value = COALESCE($4, condition_value),
             secondary_condition_field = $5,
             secondary_condition_operator = $6,
             secondary_condition_value = $7,
             pay_code_id = COALESCE($8, pay_code_id),
             priority = COALESCE($9, priority),
             is_active = COALESCE($10, is_active),
             description = COALESCE($11, description)
         WHERE id = $12
         RETURNING *`,
        [
          rule_type,
          condition_field,
          condition_operator,
          condition_value,
          secondary_condition_field,
          secondary_condition_operator,
          secondary_condition_value,
          pay_code_id,
          priority,
          is_active,
          description,
          id
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating payroll rule:", error);
      res.status(500).json({ error: "Failed to update payroll rule" });
    }
  });

  // DELETE payroll rule
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.payroll_rules WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Payroll rule not found" });
      }

      await pool.query(`DELETE FROM greentarget.payroll_rules WHERE id = $1`, [id]);
      res.json({ message: "Payroll rule deleted successfully" });
    } catch (error) {
      console.error("Error deleting payroll rule:", error);
      res.status(500).json({ error: "Failed to delete payroll rule" });
    }
  });

  // GET evaluate rule - returns applicable pay_code based on conditions
  router.get("/evaluate/:rule_type", async (req, res) => {
    try {
      const { rule_type } = req.params;
      const { invoice_amount, destination } = req.query;

      if (!['PLACEMENT', 'PICKUP'].includes(rule_type)) {
        return res.status(400).json({ error: "rule_type must be PLACEMENT or PICKUP" });
      }

      // Get all active rules for this type, ordered by priority
      const rulesResult = await pool.query(
        `SELECT
          pr.*,
          pc.description as pay_code_description,
          pc.rate_biasa as pay_code_rate
        FROM greentarget.payroll_rules pr
        JOIN pay_codes pc ON pr.pay_code_id = pc.id
        WHERE pr.rule_type = $1 AND pr.is_active = true
        ORDER BY pr.priority DESC`,
        [rule_type]
      );

      const rules = rulesResult.rows;
      const amount = parseFloat(invoice_amount) || 0;

      // Evaluate rules
      for (const rule of rules) {
        let primaryMatch = false;
        let secondaryMatch = true; // Default to true if no secondary condition

        // Evaluate primary condition
        if (rule.condition_field === 'invoice_amount') {
          primaryMatch = evaluateCondition(amount, rule.condition_operator, parseFloat(rule.condition_value));
        } else if (rule.condition_field === 'destination') {
          primaryMatch = evaluateCondition(destination, rule.condition_operator, rule.condition_value);
        }

        // Evaluate secondary condition if present
        if (rule.secondary_condition_field && rule.secondary_condition_operator) {
          if (rule.secondary_condition_field === 'invoice_amount') {
            secondaryMatch = evaluateCondition(amount, rule.secondary_condition_operator, parseFloat(rule.secondary_condition_value));
          } else if (rule.secondary_condition_field === 'destination') {
            secondaryMatch = evaluateCondition(destination, rule.secondary_condition_operator, rule.secondary_condition_value);
          }
        }

        if (primaryMatch && secondaryMatch) {
          return res.json({
            matched: true,
            rule_id: rule.id,
            pay_code_id: rule.pay_code_id,
            pay_code_description: rule.pay_code_description,
            pay_code_rate: rule.pay_code_rate,
            description: rule.description
          });
        }
      }

      // No rule matched
      res.json({
        matched: false,
        message: "No matching rule found"
      });
    } catch (error) {
      console.error("Error evaluating payroll rule:", error);
      res.status(500).json({ error: "Failed to evaluate payroll rule" });
    }
  });

  // GET addon paycodes - list of available manual add-on paycodes
  router.get("/addon-paycodes/list", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
          ap.id,
          ap.pay_code_id,
          ap.display_name,
          ap.default_amount,
          ap.is_variable_amount,
          ap.sort_order,
          ap.is_active,
          pc.description as pay_code_description,
          pc.rate_biasa
        FROM greentarget.addon_paycodes ap
        JOIN pay_codes pc ON ap.pay_code_id = pc.id
        WHERE ap.is_active = true
        ORDER BY ap.sort_order ASC`
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching addon paycodes:", error);
      res.status(500).json({ error: "Failed to fetch addon paycodes" });
    }
  });

  // POST create addon paycode
  router.post("/addon-paycodes", async (req, res) => {
    try {
      const { pay_code_id, display_name, default_amount, is_variable_amount, sort_order } = req.body;

      if (!pay_code_id || !display_name) {
        return res.status(400).json({ error: "pay_code_id and display_name are required" });
      }

      // Validate pay_code exists
      const payCodeCheck = await pool.query(
        `SELECT id FROM pay_codes WHERE id = $1`,
        [pay_code_id]
      );

      if (payCodeCheck.rows.length === 0) {
        return res.status(400).json({ error: "Invalid pay_code_id" });
      }

      const result = await pool.query(
        `INSERT INTO greentarget.addon_paycodes (pay_code_id, display_name, default_amount, is_variable_amount, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [pay_code_id, display_name, default_amount || 0, is_variable_amount || false, sort_order || 0]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating addon paycode:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "This pay code is already configured as an addon" });
      }
      res.status(500).json({ error: "Failed to create addon paycode" });
    }
  });

  // PUT update addon paycode
  router.put("/addon-paycodes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { pay_code_id, display_name, default_amount, is_variable_amount, sort_order, is_active } = req.body;

      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.addon_paycodes WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Addon paycode not found" });
      }

      const result = await pool.query(
        `UPDATE greentarget.addon_paycodes
         SET pay_code_id = COALESCE($1, pay_code_id),
             display_name = COALESCE($2, display_name),
             default_amount = COALESCE($3, default_amount),
             is_variable_amount = COALESCE($4, is_variable_amount),
             sort_order = COALESCE($5, sort_order),
             is_active = COALESCE($6, is_active)
         WHERE id = $7
         RETURNING *`,
        [pay_code_id, display_name, default_amount, is_variable_amount, sort_order, is_active, id]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating addon paycode:", error);
      res.status(500).json({ error: "Failed to update addon paycode" });
    }
  });

  // DELETE addon paycode
  router.delete("/addon-paycodes/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.addon_paycodes WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Addon paycode not found" });
      }

      await pool.query(`DELETE FROM greentarget.addon_paycodes WHERE id = $1`, [id]);
      res.json({ message: "Addon paycode deleted successfully" });
    } catch (error) {
      console.error("Error deleting addon paycode:", error);
      res.status(500).json({ error: "Failed to delete addon paycode" });
    }
  });

  // GET payroll settings
  router.get("/settings/all", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT setting_key, setting_value, description FROM greentarget.payroll_settings`
      );

      // Convert to object for easier access
      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = {
          value: row.setting_value,
          description: row.description
        };
      });

      res.json(settings);
    } catch (error) {
      console.error("Error fetching payroll settings:", error);
      res.status(500).json({ error: "Failed to fetch payroll settings" });
    }
  });

  // PUT update payroll setting
  router.put("/settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (value === undefined || value === null) {
        return res.status(400).json({ error: "value is required" });
      }

      const result = await pool.query(
        `UPDATE greentarget.payroll_settings
         SET setting_value = $1
         WHERE setting_key = $2
         RETURNING setting_key, setting_value, description`,
        [value.toString(), key]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Setting not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating payroll setting:", error);
      res.status(500).json({ error: "Failed to update payroll setting" });
    }
  });

  return router;
};

// Helper function to evaluate conditions
function evaluateCondition(value, operator, targetValue) {
  switch (operator) {
    case '=':
      return value === targetValue || (typeof value === 'string' && value.toUpperCase() === targetValue?.toUpperCase?.());
    case '>':
      return value > targetValue;
    case '<':
      return value < targetValue;
    case '>=':
      return value >= targetValue;
    case '<=':
      return value <= targetValue;
    case 'ANY':
      return true;
    default:
      return false;
  }
}
