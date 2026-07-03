// src/routes/catalogue/pay-rate-schedules.js
// Effective-month-dated pay-rate overrides layered over the base rate columns
// (pay_codes / job_pay_codes / employee_pay_codes). Payroll processing resolves
// the rate effective for a payroll month via the get_effective_pay_rate() SQL
// function. See the Database Schema notes in CLAUDE.md / AGENTS.md.
import { Router } from "express";

const SCOPES = ["pay_code", "job", "employee"];

export default function (pool) {
  const router = Router();

  // Normalize/validate the scope shape (which id columns must be set).
  const validateBody = (body) => {
    const {
      scope,
      job_id,
      employee_id,
      pay_code_id,
      effective_year,
      effective_month,
      rate_biasa,
      rate_ahad,
      rate_umum,
    } = body;

    if (!SCOPES.includes(scope)) {
      return { error: `scope must be one of ${SCOPES.join(", ")}` };
    }
    if (!pay_code_id) return { error: "pay_code_id is required" };

    const year = parseInt(effective_year, 10);
    const month = parseInt(effective_month, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { error: "effective_year is invalid" };
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { error: "effective_month must be 1-12" };
    }

    const normJob = scope === "job" ? job_id : null;
    const normEmp = scope === "employee" ? employee_id : null;
    if (scope === "job" && !normJob) return { error: "job_id is required for job scope" };
    if (scope === "employee" && !normEmp)
      return { error: "employee_id is required for employee scope" };

    const toRate = (v) =>
      v === undefined || v === null || v === "" ? null : parseFloat(v);
    const rb = toRate(rate_biasa);
    const ra = toRate(rate_ahad);
    const ru = toRate(rate_umum);
    if ([rb, ra, ru].every((r) => r === null)) {
      return { error: "At least one rate (biasa/ahad/umum) is required" };
    }
    if ([rb, ra, ru].some((r) => r !== null && (Number.isNaN(r) || r < 0))) {
      return { error: "Rates must be non-negative numbers" };
    }

    return {
      value: {
        scope,
        job_id: normJob,
        employee_id: normEmp,
        pay_code_id,
        effective_year: year,
        effective_month: month,
        rate_biasa: rb,
        rate_ahad: ra,
        rate_umum: ru,
        notes: body.notes ?? null,
      },
    };
  };

  // POST /resolve - batch-resolve the rate effective for a payroll month for a
  // list of {employee_id, job_id, pay_code_id} tuples, reusing the same
  // get_effective_pay_rate() function payroll processing uses (single source of
  // truth). Used by the work-log entry/detail screens to preview month-correct
  // rates. Returns a map keyed by `${employee_id||''}|${job_id||''}|${pay_code_id}`.
  router.post("/resolve", async (req, res) => {
    const { year, month, items } = req.body;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ message: "Valid year and month (1-12) are required" });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: "items must be an array" });
    }
    if (items.length === 0) return res.json({});
    try {
      const result = await pool.query(
        `SELECT i.employee_id, i.job_id, i.pay_code_id,
                r.rate_biasa, r.rate_ahad, r.rate_umum
         FROM jsonb_to_recordset($1::jsonb)
              AS i(employee_id varchar, job_id varchar, pay_code_id varchar)
         LEFT JOIN LATERAL jellypolly.get_effective_pay_rate(
           i.employee_id, i.job_id, i.pay_code_id, $2, $3
         ) r ON true
         WHERE i.pay_code_id IS NOT NULL`,
        [JSON.stringify(items), y, m],
      );
      const map = {};
      for (const row of result.rows) {
        const key = `${row.employee_id ?? ""}|${row.job_id ?? ""}|${row.pay_code_id}`;
        map[key] = {
          rate_biasa: row.rate_biasa === null ? null : parseFloat(row.rate_biasa),
          rate_ahad: row.rate_ahad === null ? null : parseFloat(row.rate_ahad),
          rate_umum: row.rate_umum === null ? null : parseFloat(row.rate_umum),
        };
      }
      res.json(map);
    } catch (error) {
      console.error("Error resolving effective pay rates:", error);
      res
        .status(500)
        .json({ message: "Error resolving effective pay rates", error: error.message });
    }
  });

  // GET / - list schedules, filterable by scope/employee_id/job_id/pay_code_id
  router.get("/", async (req, res) => {
    const { scope, employee_id, job_id, pay_code_id } = req.query;
    const conditions = [];
    const params = [];
    if (scope) {
      params.push(scope);
      conditions.push(`scope = $${params.length}`);
    }
    if (employee_id) {
      params.push(employee_id);
      conditions.push(`employee_id = $${params.length}`);
    }
    if (job_id) {
      params.push(job_id);
      conditions.push(`job_id = $${params.length}`);
    }
    if (pay_code_id) {
      params.push(pay_code_id);
      conditions.push(`pay_code_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const result = await pool.query(
        `SELECT id, scope, job_id, employee_id, pay_code_id, effective_year,
                effective_month, rate_biasa, rate_ahad, rate_umum, notes,
                created_at, created_by
         FROM jellypolly.pay_rate_schedules ${where}
         ORDER BY effective_year DESC, effective_month DESC, id DESC`,
        params,
      );
      res.json(
        result.rows.map((r) => ({
          ...r,
          rate_biasa: r.rate_biasa === null ? null : parseFloat(r.rate_biasa),
          rate_ahad: r.rate_ahad === null ? null : parseFloat(r.rate_ahad),
          rate_umum: r.rate_umum === null ? null : parseFloat(r.rate_umum),
        })),
      );
    } catch (error) {
      console.error("Error listing pay rate schedules:", error);
      res
        .status(500)
        .json({ message: "Error listing pay rate schedules", error: error.message });
    }
  });

  // POST / - create (or upsert on the unique key) a schedule row
  router.post("/", async (req, res) => {
    const { error, value } = validateBody(req.body);
    if (error) return res.status(400).json({ message: error });
    try {
      const result = await pool.query(
        `INSERT INTO jellypolly.pay_rate_schedules
           (scope, job_id, employee_id, pay_code_id, effective_year, effective_month,
            rate_biasa, rate_ahad, rate_umum, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (scope, COALESCE(job_id,''), COALESCE(employee_id,''), pay_code_id, effective_year, effective_month)
         DO UPDATE SET rate_biasa = EXCLUDED.rate_biasa,
                       rate_ahad  = EXCLUDED.rate_ahad,
                       rate_umum  = EXCLUDED.rate_umum,
                       notes      = EXCLUDED.notes
         RETURNING *`,
        [
          value.scope,
          value.job_id,
          value.employee_id,
          value.pay_code_id,
          value.effective_year,
          value.effective_month,
          value.rate_biasa,
          value.rate_ahad,
          value.rate_umum,
          value.notes,
          req.body.created_by ?? null,
        ],
      );
      res
        .status(201)
        .json({ message: "Pay rate schedule saved", schedule: result.rows[0] });
    } catch (error) {
      console.error("Error creating pay rate schedule:", error);
      res
        .status(500)
        .json({ message: "Error creating pay rate schedule", error: error.message });
    }
  });

  // PUT /:id - update a schedule row
  router.put("/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const { error, value } = validateBody(req.body);
    if (error) return res.status(400).json({ message: error });
    try {
      const result = await pool.query(
        `UPDATE jellypolly.pay_rate_schedules SET
           scope = $1, job_id = $2, employee_id = $3, pay_code_id = $4,
           effective_year = $5, effective_month = $6,
           rate_biasa = $7, rate_ahad = $8, rate_umum = $9, notes = $10
         WHERE id = $11
         RETURNING *`,
        [
          value.scope,
          value.job_id,
          value.employee_id,
          value.pay_code_id,
          value.effective_year,
          value.effective_month,
          value.rate_biasa,
          value.rate_ahad,
          value.rate_umum,
          value.notes,
          id,
        ],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Pay rate schedule not found" });
      }
      res.json({ message: "Pay rate schedule updated", schedule: result.rows[0] });
    } catch (error) {
      console.error("Error updating pay rate schedule:", error);
      res
        .status(500)
        .json({ message: "Error updating pay rate schedule", error: error.message });
    }
  });

  // DELETE /:id
  router.delete("/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    try {
      const result = await pool.query(
        "DELETE FROM jellypolly.pay_rate_schedules WHERE id = $1 RETURNING id",
        [id],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Pay rate schedule not found" });
      }
      res.json({ message: "Pay rate schedule deleted", id: result.rows[0].id });
    } catch (error) {
      console.error("Error deleting pay rate schedule:", error);
      res
        .status(500)
        .json({ message: "Error deleting pay rate schedule", error: error.message });
    }
  });

  return router;
}
