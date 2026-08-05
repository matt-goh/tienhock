// src/routes/greentarget/employee-pay-codes.js
import { Router } from "express";

// Green Target employee pay-rate overrides. GT deliberately shares the
// public.staffs / public.pay_codes catalogues; only the per-employee override
// rows and scheduled rate changes are GT-scoped, so a staff member on both
// companies' payrolls can hold different rates per company.
export default function (pool) {
  const router = Router();

  const parseRate = (value, fieldName) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(
        `Invalid value for ${fieldName}. Must be null or a non-negative number.`
      );
    }
    return parsed;
  };

  const employeeExists = async (employeeId) => {
    const result = await pool.query(
      "SELECT 1 FROM public.staffs WHERE id = $1",
      [employeeId]
    );
    return result.rows.length > 0;
  };

  const payCodeExists = async (payCodeId) => {
    const result = await pool.query(
      "SELECT 1 FROM public.pay_codes WHERE id = $1",
      [payCodeId]
    );
    return result.rows.length > 0;
  };

  const mappingSelect = `
    SELECT
      epc.id,
      epc.employee_id,
      epc.pay_code_id,
      epc.is_default,
      CAST(epc.override_rate_biasa AS NUMERIC(10, 2)) AS override_rate_biasa,
      CAST(epc.override_rate_ahad AS NUMERIC(10, 2)) AS override_rate_ahad,
      CAST(epc.override_rate_umum AS NUMERIC(10, 2)) AS override_rate_umum,
      pc.id AS pc_id,
      pc.description AS pc_description,
      pc.pay_type AS pc_pay_type,
      pc.rate_unit AS pc_rate_unit,
      CAST(pc.rate_biasa AS NUMERIC(10, 2)) AS pc_rate_biasa,
      CAST(pc.rate_ahad AS NUMERIC(10, 2)) AS pc_rate_ahad,
      CAST(pc.rate_umum AS NUMERIC(10, 2)) AS pc_rate_umum
    FROM greentarget.employee_pay_codes epc
    JOIN public.pay_codes pc ON epc.pay_code_id = pc.id
  `;

  const toMapping = (row) => ({
    id: row.id,
    employee_id: row.employee_id,
    pay_code_id: row.pay_code_id,
    is_default: row.is_default,
    override_rate_biasa:
      row.override_rate_biasa === null
        ? null
        : parseFloat(row.override_rate_biasa),
    override_rate_ahad:
      row.override_rate_ahad === null
        ? null
        : parseFloat(row.override_rate_ahad),
    override_rate_umum:
      row.override_rate_umum === null
        ? null
        : parseFloat(row.override_rate_umum),
    pay_code: {
      id: row.pc_id,
      description: row.pc_description,
      pay_type: row.pc_pay_type,
      rate_unit: row.pc_rate_unit,
      rate_biasa:
        row.pc_rate_biasa === null ? null : parseFloat(row.pc_rate_biasa),
      rate_ahad: row.pc_rate_ahad === null ? null : parseFloat(row.pc_rate_ahad),
      rate_umum: row.pc_rate_umum === null ? null : parseFloat(row.pc_rate_umum),
    },
  });

  // Get ALL GT employee pay-code overrides (joined with shared pay-code info)
  router.get("/", async (req, res) => {
    try {
      const result = await pool.query(
        `${mappingSelect} ORDER BY epc.employee_id, epc.pay_code_id`
      );
      res.json({ mappings: result.rows.map(toMapping) });
    } catch (error) {
      console.error("Error fetching GT employee pay code mappings:", error);
      res.status(500).json({
        message: "Error fetching GT employee pay code mappings",
        error: error.message,
      });
    }
  });

  // Get GT pay-code overrides for a specific employee
  router.get("/:employeeId", async (req, res) => {
    const { employeeId } = req.params;
    if (!employeeId) {
      return res.status(400).json({ message: "Employee ID is required" });
    }
    try {
      const result = await pool.query(
        `${mappingSelect} WHERE epc.employee_id = $1 ORDER BY epc.pay_code_id`,
        [employeeId]
      );
      res.json({ mappings: result.rows.map(toMapping) });
    } catch (error) {
      console.error("Error fetching GT employee pay code mappings:", error);
      res.status(500).json({
        message: "Error fetching GT employee pay code mappings",
        error: error.message,
      });
    }
  });

  // Replace an employee's entire GT override set in one transaction
  router.put("/:employeeId", async (req, res) => {
    const { employeeId } = req.params;
    const { mappings } = req.body;

    if (!employeeId) {
      return res.status(400).json({ message: "Employee ID is required" });
    }
    if (!mappings || !Array.isArray(mappings)) {
      return res
        .status(400)
        .json({ message: "An array of mappings is required" });
    }

    const client = await pool.connect();
    try {
      if (!(await employeeExists(employeeId))) {
        return res
          .status(400)
          .json({ message: `Employee '${employeeId}' not found` });
      }

      // Validate every entry before touching the database
      const validated = [];
      for (const entry of mappings) {
        const { pay_code_id, is_default = false } = entry;
        if (!pay_code_id) {
          return res.status(400).json({
            message: "All mappings must have a pay_code_id",
            invalid_entry: entry,
          });
        }
        if (!(await payCodeExists(pay_code_id))) {
          return res.status(400).json({
            message: `Pay code '${pay_code_id}' not found`,
            invalid_entry: entry,
          });
        }
        validated.push({
          pay_code_id,
          is_default: !!is_default,
          override_rate_biasa: parseRate(
            entry.override_rate_biasa,
            "override_rate_biasa"
          ),
          override_rate_ahad: parseRate(
            entry.override_rate_ahad,
            "override_rate_ahad"
          ),
          override_rate_umum: parseRate(
            entry.override_rate_umum,
            "override_rate_umum"
          ),
        });
      }

      await client.query("BEGIN");

      await client.query(
        "DELETE FROM greentarget.employee_pay_codes WHERE employee_id = $1",
        [employeeId]
      );

      for (const entry of validated) {
        await client.query(
          `INSERT INTO greentarget.employee_pay_codes
            (employee_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            employeeId,
            entry.pay_code_id,
            entry.is_default,
            entry.override_rate_biasa,
            entry.override_rate_ahad,
            entry.override_rate_umum,
          ]
        );
      }

      await client.query("COMMIT");

      const result = await pool.query(
        `${mappingSelect} WHERE epc.employee_id = $1 ORDER BY epc.pay_code_id`,
        [employeeId]
      );
      res.json({ mappings: result.rows.map(toMapping) });
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error.message &&
        error.message.startsWith("Invalid value for")
      ) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error saving GT employee pay code mappings:", error);
      res.status(500).json({
        message: "Error saving GT employee pay code mappings",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Get scheduled rate overrides for a specific employee
  router.get("/:employeeId/schedules", async (req, res) => {
    const { employeeId } = req.params;
    if (!employeeId) {
      return res.status(400).json({ message: "Employee ID is required" });
    }
    try {
      const result = await pool.query(
        `SELECT
          id, employee_id, pay_code_id, effective_year, effective_month,
          CAST(rate_biasa AS NUMERIC(10, 2)) AS rate_biasa,
          CAST(rate_ahad AS NUMERIC(10, 2)) AS rate_ahad,
          CAST(rate_umum AS NUMERIC(10, 2)) AS rate_umum,
          notes, created_at, created_by
        FROM greentarget.pay_rate_schedules
        WHERE employee_id = $1
        ORDER BY effective_year DESC, effective_month DESC`,
        [employeeId]
      );
      const schedules = result.rows.map((row) => ({
        ...row,
        rate_biasa: row.rate_biasa === null ? null : parseFloat(row.rate_biasa),
        rate_ahad: row.rate_ahad === null ? null : parseFloat(row.rate_ahad),
        rate_umum: row.rate_umum === null ? null : parseFloat(row.rate_umum),
      }));
      res.json({ schedules });
    } catch (error) {
      console.error("Error fetching GT pay rate schedules:", error);
      res.status(500).json({
        message: "Error fetching GT pay rate schedules",
        error: error.message,
      });
    }
  });

  // Upsert a scheduled rate override on (employee, pay code, year, month)
  router.post("/:employeeId/schedules", async (req, res) => {
    const { employeeId } = req.params;
    const {
      pay_code_id,
      effective_year,
      effective_month,
      rate_biasa,
      rate_ahad,
      rate_umum,
      notes,
    } = req.body;

    if (!employeeId) {
      return res.status(400).json({ message: "Employee ID is required" });
    }
    if (!pay_code_id) {
      return res.status(400).json({ message: "pay_code_id is required" });
    }
    const year = parseInt(effective_year, 10);
    const month = parseInt(effective_month, 10);
    if (isNaN(year) || year < 1900 || year > 2100) {
      return res
        .status(400)
        .json({ message: "effective_year must be a valid year" });
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return res
        .status(400)
        .json({ message: "effective_month must be between 1 and 12" });
    }

    try {
      if (!(await employeeExists(employeeId))) {
        return res
          .status(400)
          .json({ message: `Employee '${employeeId}' not found` });
      }
      if (!(await payCodeExists(pay_code_id))) {
        return res
          .status(400)
          .json({ message: `Pay code '${pay_code_id}' not found` });
      }

      const parsedRates = [
        parseRate(rate_biasa, "rate_biasa"),
        parseRate(rate_ahad, "rate_ahad"),
        parseRate(rate_umum, "rate_umum"),
      ];

      const createdBy = req.staffId || null;

      const result = await pool.query(
        `INSERT INTO greentarget.pay_rate_schedules
          (employee_id, pay_code_id, effective_year, effective_month, rate_biasa, rate_ahad, rate_umum, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (employee_id, pay_code_id, effective_year, effective_month)
         DO UPDATE SET
           rate_biasa = EXCLUDED.rate_biasa,
           rate_ahad = EXCLUDED.rate_ahad,
           rate_umum = EXCLUDED.rate_umum,
           notes = EXCLUDED.notes
         RETURNING
           id, employee_id, pay_code_id, effective_year, effective_month,
           CAST(rate_biasa AS NUMERIC(10, 2)) AS rate_biasa,
           CAST(rate_ahad AS NUMERIC(10, 2)) AS rate_ahad,
           CAST(rate_umum AS NUMERIC(10, 2)) AS rate_umum,
           notes, created_at, created_by`,
        [
          employeeId,
          pay_code_id,
          year,
          month,
          parsedRates[0],
          parsedRates[1],
          parsedRates[2],
          notes || null,
          createdBy,
        ]
      );

      const row = result.rows[0];
      res.json({
        ...row,
        rate_biasa: row.rate_biasa === null ? null : parseFloat(row.rate_biasa),
        rate_ahad: row.rate_ahad === null ? null : parseFloat(row.rate_ahad),
        rate_umum: row.rate_umum === null ? null : parseFloat(row.rate_umum),
      });
    } catch (error) {
      if (error.message && error.message.startsWith("Invalid value for")) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error saving GT pay rate schedule:", error);
      res.status(500).json({
        message: "Error saving GT pay rate schedule",
        error: error.message,
      });
    }
  });

  // Delete one scheduled rate override
  router.delete("/schedules/:scheduleId", async (req, res) => {
    const { scheduleId } = req.params;
    const id = parseInt(scheduleId, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid schedule ID" });
    }
    try {
      const result = await pool.query(
        `DELETE FROM greentarget.pay_rate_schedules WHERE id = $1 RETURNING id`,
        [id]
      );
      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Pay rate schedule not found" });
      }
      res.json({ message: "Pay rate schedule deleted", id: result.rows[0].id });
    } catch (error) {
      console.error("Error deleting GT pay rate schedule:", error);
      res.status(500).json({
        message: "Error deleting GT pay rate schedule",
        error: error.message,
      });
    }
  });

  return router;
}
