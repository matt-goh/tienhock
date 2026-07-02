// src/routes/jellypolly/monthly-payrolls.js
// Jelly Polly monthly payrolls. Mirrors the GT route, but processing is
// delegated to jpPayrollProcessor (per-employee rebuild with HEAD rollup).
import { Router } from "express";
import { reprocessJPEmployees } from "./jpPayrollProcessor.js";

export default function (pool) {
  const router = Router();

  // Get all monthly payrolls
  router.get("/", async (req, res) => {
    const { year, month, include_employee_payrolls } = req.query;
    try {
      let query = `SELECT * FROM jellypolly.monthly_payrolls`;
      const values = [];
      const whereClauses = [];
      let paramCount = 1;

      if (year) {
        whereClauses.push(`year = $${paramCount++}`);
        values.push(parseInt(year));
      }
      if (month) {
        whereClauses.push(`month = $${paramCount++}`);
        values.push(parseInt(month));
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      query += ` ORDER BY year DESC, month DESC`;

      const result = await pool.query(query, values);

      if (include_employee_payrolls === "true") {
        const payrollsWithEmployees = await Promise.all(
          result.rows.map(async (payroll) => {
            const employeePayrollsResult = await pool.query(
              `SELECT ep.*, s.name as employee_name
               FROM jellypolly.employee_payrolls ep
               LEFT JOIN public.staffs s ON ep.employee_id = s.id
               WHERE ep.monthly_payroll_id = $1`,
              [payroll.id]
            );
            return {
              ...payroll,
              employee_payrolls: employeePayrollsResult.rows,
            };
          })
        );
        return res.json(payrollsWithEmployees);
      }

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching JP monthly payrolls:", error);
      res.status(500).json({
        message: "Error fetching JP monthly payrolls",
        error: error.message,
      });
    }
  });

  // Get specific monthly payroll by ID (with per-employee items + deductions
  // so batch payslip printing has full data — mirrors GT/TH)
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const payrollResult = await pool.query(
        "SELECT * FROM jellypolly.monthly_payrolls WHERE id = $1",
        [id]
      );

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const employeePayrollsResult = await pool.query(
        `SELECT ep.*, s.name as employee_name
         FROM jellypolly.employee_payrolls ep
         LEFT JOIN public.staffs s ON ep.employee_id = s.id
         WHERE ep.monthly_payroll_id = $1
         ORDER BY s.name`,
        [id]
      );

      const epIds = employeePayrollsResult.rows.map((ep) => ep.id);
      const itemsByEp = {};
      const deductionsByEp = {};
      if (epIds.length > 0) {
        const [itemsResult, deductionsResult] = await Promise.all([
          pool.query(
            `SELECT pi.id, pi.employee_payroll_id, pi.pay_code_id, pi.description,
                    pi.rate, pi.rate_unit, pi.quantity, pi.foc_units, pi.amount,
                    pi.is_manual, pi.job_type, pi.source_employee_id,
                    pi.work_log_type, pc.pay_type
             FROM jellypolly.payroll_items pi
             LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
             WHERE pi.employee_payroll_id = ANY($1)
             ORDER BY pi.id`,
            [epIds]
          ),
          pool.query(
            `SELECT pd.id, pd.employee_payroll_id, pd.deduction_type,
                    CAST(pd.employee_amount AS NUMERIC(10,2)) as employee_amount,
                    CAST(pd.employer_amount AS NUMERIC(10,2)) as employer_amount,
                    CAST(pd.wage_amount AS NUMERIC(10,2)) as wage_amount,
                    pd.rate_info
             FROM jellypolly.payroll_deductions pd
             WHERE pd.employee_payroll_id = ANY($1)
             ORDER BY pd.deduction_type`,
            [epIds]
          ),
        ]);
        for (const item of itemsResult.rows) {
          (itemsByEp[item.employee_payroll_id] ||= []).push({
            ...item,
            rate: parseFloat(item.rate),
            quantity: parseFloat(item.quantity),
            amount: parseFloat(item.amount),
            is_manual: !!item.is_manual,
          });
        }
        for (const d of deductionsResult.rows) {
          (deductionsByEp[d.employee_payroll_id] ||= []).push({
            ...d,
            employee_amount: parseFloat(d.employee_amount),
            employer_amount: parseFloat(d.employer_amount),
            wage_amount: parseFloat(d.wage_amount),
          });
        }
      }

      const employeePayrolls = employeePayrollsResult.rows.map((ep) => ({
        ...ep,
        gross_pay: parseFloat(ep.gross_pay),
        net_pay: parseFloat(ep.net_pay),
        digenapkan: ep.digenapkan != null ? parseFloat(ep.digenapkan) : 0,
        setelah_digenapkan:
          ep.setelah_digenapkan != null
            ? parseFloat(ep.setelah_digenapkan)
            : null,
        items: itemsByEp[ep.id] || [],
        deductions: deductionsByEp[ep.id] || [],
      }));

      res.json({
        ...payrollResult.rows[0],
        employeePayrolls,
      });
    } catch (error) {
      console.error("Error fetching JP monthly payroll details:", error);
      res.status(500).json({
        message: "Error fetching JP monthly payroll details",
        error: error.message,
      });
    }
  });

  // Create a new monthly payroll
  router.post("/", async (req, res) => {
    const { year, month, created_by } = req.body;

    if (!year || !month) {
      return res.status(400).json({ message: "Year and month are required" });
    }

    try {
      const existingCheck = await pool.query(
        "SELECT id FROM jellypolly.monthly_payrolls WHERE year = $1 AND month = $2",
        [year, month]
      );

      if (existingCheck.rows.length > 0) {
        return res.status(400).json({
          message: "Payroll for this month already exists",
          payroll: existingCheck.rows[0],
        });
      }

      const insertResult = await pool.query(
        `INSERT INTO jellypolly.monthly_payrolls (year, month, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [year, month, created_by || null]
      );

      res.status(201).json({
        message: "Monthly payroll created successfully",
        payroll: insertResult.rows[0],
      });
    } catch (error) {
      console.error("Error creating JP monthly payroll:", error);
      res.status(500).json({
        message: "Error creating JP monthly payroll",
        error: error.message,
      });
    }
  });

  // Process the whole month (all assigned JP staff; prunes unassigned)
  router.post("/:id/process-all", async (req, res) => {
    const { id } = req.params;

    try {
      const payrollResult = await pool.query(
        "SELECT year, month FROM jellypolly.monthly_payrolls WHERE id = $1",
        [id]
      );
      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }
      const { year, month } = payrollResult.rows[0];

      const result = await reprocessJPEmployees(pool, { year, month });

      res.json({
        success: true,
        processed_count: result.processed.length,
        removed: result.removed,
        processed: result.processed,
      });
    } catch (error) {
      console.error("Error in JP payroll processing:", error);
      res.status(500).json({
        success: false,
        message: "Error processing payroll",
        error: error.message,
      });
    }
  });

  // Delete monthly payroll
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const checkResult = await pool.query(
        "SELECT id FROM jellypolly.monthly_payrolls WHERE id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const result = await pool.query(
        "DELETE FROM jellypolly.monthly_payrolls WHERE id = $1 RETURNING *",
        [id]
      );

      res.json({
        message: "Monthly payroll deleted successfully",
        payroll: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting JP monthly payroll:", error);
      res.status(500).json({
        message: "Error deleting monthly payroll",
        error: error.message,
      });
    }
  });

  return router;
}
