// src/routes/greentarget/cp8d.js
// Green Target CP8D yearly employee particulars (LHDN). Schema-isolated clone of
// src/routes/payroll/cp8d.js on the greentarget schema (staff particulars still
// come from the SHARED public.staffs). The employer E number is read from
// greentarget.payroll_settings (ecaruman_lhdn_e_number), not hardcoded.
// Layout source: docs/C.P.8D_FORMAT.pdf (transcribed in docs/CP8D_HANDOVER.md).
import { Router } from "express";
import { format } from "date-fns";

const E_NUMBER_SETTING_KEY = "ecaruman_lhdn_e_number";

const MONEY_FIELDS = [
  "child_relief",
  "gross_remuneration",
  "benefits_in_kind",
  "living_accommodation",
  "esos_benefit",
  "tax_exempt_benefits",
  "tp1_relief",
  "tp1_zakat",
  "epf_contribution",
  "zakat_salary_deduction",
  "mtd",
  "cp38",
  "medical_insurance",
  "socso_contribution",
];

// Fields the user may edit through PUT /records/:id (everything except identity/audit).
const EDITABLE_FIELDS = [
  "employee_name",
  "tin",
  "identification_no",
  "employee_category",
  "employee_status",
  "retirement_date",
  "tax_borne_by_employer",
  "children_count",
  ...MONEY_FIELDS,
  "notes",
];

// Shared snapshot/derivation SELECT: one row per employee with particulars from
// public.staffs and the year's GT payroll sums (gross + employee EPF/SOCSO/PCB).
// Params: $1 = year. Optional $2 = restrict to one employee_id.
const SNAPSHOT_QUERY = `
  WITH emp AS (
    SELECT DISTINCT ep.employee_id
    FROM greentarget.employee_payrolls ep
    JOIN greentarget.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
    WHERE mp.year = $1
  ),
  gross AS (
    SELECT ep.employee_id, SUM(ep.gross_pay) AS amount
    FROM greentarget.employee_payrolls ep
    JOIN greentarget.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
    WHERE mp.year = $1
    GROUP BY ep.employee_id
  ),
  ded AS (
    SELECT
      ep.employee_id,
      SUM(pd.employee_amount) FILTER (WHERE pd.deduction_type = 'epf') AS epf,
      SUM(pd.employee_amount) FILTER (WHERE pd.deduction_type = 'socso') AS socso,
      SUM(pd.employee_amount) FILTER (WHERE pd.deduction_type = 'income_tax') AS mtd
    FROM greentarget.payroll_deductions pd
    JOIN greentarget.employee_payrolls ep ON ep.id = pd.employee_payroll_id
    JOIN greentarget.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
    WHERE mp.year = $1
      AND pd.deduction_type IN ('epf', 'socso', 'income_tax')
    GROUP BY ep.employee_id
  )
  SELECT
    s.id AS employee_id,
    LEFT(s.name, 60) AS employee_name,
    LEFT(NULLIF(REGEXP_REPLACE(COALESCE(s.income_tax_no, ''), '[^0-9]', '', 'g'), ''), 11) AS tin,
    COALESCE(
      LEFT(NULLIF(REGEXP_REPLACE(UPPER(COALESCE(s.ic_no, '')), '[^A-Z0-9]', '', 'g'), ''), 12),
      '000000000000'
    ) AS identification_no,
    CASE
      WHEN s.marital_status = 'Married' AND s.spouse_employment_status = 'Unemployed' THEN 2
      WHEN s.marital_status = 'Married' THEN 3
      ELSE 1
    END AS employee_category,
    CASE
      WHEN s.date_resigned IS NOT NULL AND EXTRACT(YEAR FROM s.date_resigned) = $1
      THEN s.date_resigned
    END AS retirement_date,
    COALESCE(s.number_of_children, 0) AS children_count,
    COALESCE(g.amount, 0) AS gross_remuneration,
    COALESCE(d.epf, 0) AS epf_contribution,
    COALESCE(d.socso, 0) AS socso_contribution,
    COALESCE(d.mtd, 0) AS mtd
  FROM public.staffs s
  LEFT JOIN emp ON emp.employee_id = s.id
  LEFT JOIN gross g ON g.employee_id = s.id
  LEFT JOIN ded d ON d.employee_id = s.id
`;

const parseRecord = (row) => {
  const parsed = { ...row };
  for (const field of MONEY_FIELDS) {
    parsed[field] = parseFloat(row[field]);
  }
  return parsed;
};

export default function (pool) {
  const router = Router();

  // List CP8D records for a year
  router.get("/:year", async (req, res) => {
    const year = parseInt(req.params.year);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ message: "Invalid year" });
    }

    try {
      const result = await pool.query(
        `SELECT * FROM greentarget.cp8d_records WHERE year = $1 ORDER BY employee_name, employee_id`,
        [year]
      );
      res.json({ records: result.rows.map(parseRecord) });
    } catch (error) {
      console.error("Error fetching GT CP8D records:", error);
      res.status(500).json({
        message: "Error fetching CP8D records",
        error: error.message,
      });
    }
  });

  // Prefill: create rows for every employee with GT payroll in the year who does
  // not already have a CP8D row. Existing rows are never touched.
  router.post("/:year/prefill", async (req, res) => {
    const year = parseInt(req.params.year);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ message: "Invalid year" });
    }

    try {
      const insertResult = await pool.query(
        `${SNAPSHOT_QUERY}
        WHERE emp.employee_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM greentarget.cp8d_records c
            WHERE c.year = $1 AND c.employee_id = s.id
          )
        `,
        [year]
      );

      const rows = insertResult.rows;
      if (rows.length > 0) {
        const values = [];
        const tuples = rows
          .map((r, idx) => {
            const o = idx * 13;
            values.push(
              year,
              r.employee_id,
              r.employee_name,
              r.tin,
              r.identification_no,
              r.employee_category,
              r.retirement_date,
              r.children_count,
              r.gross_remuneration,
              r.epf_contribution,
              r.socso_contribution,
              r.mtd,
              req.staffId || null
            );
            return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${
              o + 6
            }, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}, $${o + 11}, $${
              o + 12
            }, now(), $${o + 13})`;
          })
          .join(", ");

        await pool.query(
          `INSERT INTO greentarget.cp8d_records (
            year, employee_id, employee_name, tin, identification_no,
            employee_category, retirement_date, children_count,
            gross_remuneration, epf_contribution, socso_contribution, mtd,
            derived_at, created_by
          ) VALUES ${tuples}`,
          values
        );
      }

      const totalResult = await pool.query(
        `SELECT COUNT(DISTINCT ep.employee_id) AS total
         FROM greentarget.employee_payrolls ep
         JOIN greentarget.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
         WHERE mp.year = $1`,
        [year]
      );
      const total = parseInt(totalResult.rows[0].total);

      res.json({
        created: rows.length,
        skipped: total - rows.length,
        totalPayrollEmployees: total,
      });
    } catch (error) {
      console.error("Error prefilling GT CP8D records:", error);
      res.status(500).json({
        message: "Error prefilling CP8D records",
        error: error.message,
      });
    }
  });

  // Manually add one staff member to a year (no payroll required)
  router.post("/:year/records", async (req, res) => {
    const year = parseInt(req.params.year);
    const { employee_id } = req.body;
    if (!Number.isInteger(year) || !employee_id) {
      return res
        .status(400)
        .json({ message: "Year and employee_id are required" });
    }

    try {
      const existing = await pool.query(
        `SELECT id FROM greentarget.cp8d_records WHERE year = $1 AND employee_id = $2`,
        [year, employee_id]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          message: "A CP8D record already exists for this employee and year",
        });
      }

      const snapshot = await pool.query(
        `${SNAPSHOT_QUERY} WHERE s.id = $2`,
        [year, employee_id]
      );
      if (snapshot.rows.length === 0) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      const r = snapshot.rows[0];

      const insertResult = await pool.query(
        `INSERT INTO greentarget.cp8d_records (
          year, employee_id, employee_name, tin, identification_no,
          employee_category, retirement_date, children_count,
          gross_remuneration, epf_contribution, socso_contribution, mtd,
          derived_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
        RETURNING *`,
        [
          year,
          r.employee_id,
          r.employee_name,
          r.tin,
          r.identification_no,
          r.employee_category,
          r.retirement_date,
          r.children_count,
          r.gross_remuneration,
          r.epf_contribution,
          r.socso_contribution,
          r.mtd,
          req.staffId || null,
        ]
      );

      res.status(201).json(parseRecord(insertResult.rows[0]));
    } catch (error) {
      console.error("Error adding GT CP8D record:", error);
      res.status(500).json({
        message: "Error adding CP8D record",
        error: error.message,
      });
    }
  });

  // Re-derive one record: re-snapshot particulars + recompute payroll sums.
  // User-edited non-derived fields are preserved.
  router.post("/records/:id/derive", async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    try {
      const recordResult = await pool.query(
        `SELECT * FROM greentarget.cp8d_records WHERE id = $1`,
        [id]
      );
      if (recordResult.rows.length === 0) {
        return res.status(404).json({ message: "CP8D record not found" });
      }
      const record = recordResult.rows[0];

      const snapshot = await pool.query(
        `${SNAPSHOT_QUERY} WHERE s.id = $2`,
        [record.year, record.employee_id]
      );
      if (snapshot.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Staff member no longer exists" });
      }
      const r = snapshot.rows[0];

      const updateResult = await pool.query(
        `UPDATE greentarget.cp8d_records SET
          employee_name = $1,
          tin = $2,
          identification_no = $3,
          employee_category = $4,
          retirement_date = $5,
          children_count = $6,
          gross_remuneration = $7,
          epf_contribution = $8,
          socso_contribution = $9,
          mtd = $10,
          derived_at = now(),
          updated_at = now(),
          updated_by = $11
        WHERE id = $12
        RETURNING *`,
        [
          r.employee_name,
          r.tin,
          r.identification_no,
          r.employee_category,
          r.retirement_date,
          r.children_count,
          r.gross_remuneration,
          r.epf_contribution,
          r.socso_contribution,
          r.mtd,
          req.staffId || null,
          id,
        ]
      );

      res.json(parseRecord(updateResult.rows[0]));
    } catch (error) {
      console.error("Error re-deriving GT CP8D record:", error);
      res.status(500).json({
        message: "Error re-deriving CP8D record",
        error: error.message,
      });
    }
  });

  // Edit any editable field of a record
  router.put("/records/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    try {
      const sets = [];
      const values = [];
      let paramCount = 1;

      for (const field of EDITABLE_FIELDS) {
        if (req.body[field] === undefined) continue;
        let value = req.body[field];
        if (MONEY_FIELDS.includes(field)) {
          value = parseFloat(value) || 0;
        } else if (field === "children_count") {
          value = parseInt(value) || 0;
        } else if (
          ["employee_category", "employee_status", "tax_borne_by_employer"].includes(
            field
          )
        ) {
          value = parseInt(value);
        } else if (field === "retirement_date") {
          value = value || null;
        } else if (field === "tin") {
          value = value || null;
        }
        sets.push(`${field} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }

      if (sets.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      sets.push(`updated_at = now()`);
      sets.push(`updated_by = $${paramCount}`);
      values.push(req.staffId || null);
      paramCount++;
      values.push(id);

      const result = await pool.query(
        `UPDATE greentarget.cp8d_records SET ${sets.join(", ")} WHERE id = $${paramCount} RETURNING *`,
        values
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "CP8D record not found" });
      }

      res.json(parseRecord(result.rows[0]));
    } catch (error) {
      console.error("Error updating GT CP8D record:", error);
      res.status(500).json({
        message: "Error updating CP8D record",
        error: error.message,
      });
    }
  });

  // Remove a record
  router.delete("/records/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    try {
      const result = await pool.query(
        `DELETE FROM greentarget.cp8d_records WHERE id = $1 RETURNING id`,
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "CP8D record not found" });
      }
      res.json({ message: "CP8D record deleted" });
    } catch (error) {
      console.error("Error deleting GT CP8D record:", error);
      res.status(500).json({
        message: "Error deleting CP8D record",
        error: error.message,
      });
    }
  });

  // Export the LHDN TXT file content for a year
  router.get("/:year/export", async (req, res) => {
    const year = parseInt(req.params.year);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ message: "Invalid year" });
    }

    try {
      const settingsResult = await pool.query(
        `SELECT setting_value FROM greentarget.payroll_settings WHERE setting_key = $1`,
        [E_NUMBER_SETTING_KEY]
      );
      const eNumber = (settingsResult.rows[0]?.setting_value || "").trim();
      if (!eNumber) {
        return res.status(400).json({
          message:
            "LHDN E Number is not set. Key it in on the Green Target e-Caruman page first.",
        });
      }

      const result = await pool.query(
        `SELECT * FROM greentarget.cp8d_records WHERE year = $1 ORDER BY employee_name, employee_id`,
        [year]
      );
      const records = result.rows;

      // Integer fields exclude sen (truncated per the PDF examples); decimal
      // fields keep sen. Optional fields are blank when zero (PDF example 2).
      const intField = (v) => String(Math.trunc(Math.abs(Number(v) || 0)));
      const decField = (v) => (Number(v) || 0).toFixed(2);
      const optInt = (v) => (Number(v) === 0 || v == null ? "" : intField(v));
      const optDec = (v) => (Number(v) === 0 || v == null ? "" : decField(v));

      const warnings = [];
      const lines = records.map((r) => {
        if (!r.tin) {
          warnings.push(`${r.employee_name}: no TIN (field left blank)`);
        }
        if (!r.identification_no || r.identification_no === "000000000000") {
          warnings.push(
            `${r.employee_name}: no identification number (000000000000 used)`
          );
        }
        if (!r.retirement_date) {
          warnings.push(
            `${r.employee_name}: no retirement / contract end date (field left blank)`
          );
        }
        if (Number(r.gross_remuneration) === 0) {
          warnings.push(`${r.employee_name}: zero gross remuneration`);
        }

        const retirementDate = r.retirement_date
          ? format(new Date(r.retirement_date), "dd-MM-yyyy")
          : "";

        return (
          [
            String(r.employee_name || "").substring(0, 60),
            r.tin || "",
            String(r.identification_no || "000000000000").substring(0, 12),
            String(r.employee_category),
            String(r.employee_status),
            retirementDate,
            String(r.tax_borne_by_employer),
            intField(r.children_count),
            intField(r.child_relief),
            intField(r.gross_remuneration),
            optInt(r.benefits_in_kind),
            optInt(r.living_accommodation),
            optInt(r.esos_benefit),
            optInt(r.tax_exempt_benefits),
            optInt(r.tp1_relief),
            optDec(r.tp1_zakat),
            intField(r.epf_contribution),
            optDec(r.zakat_salary_deduction),
            decField(r.mtd),
            optDec(r.cp38),
            optInt(r.medical_insurance),
            intField(r.socso_contribution),
          ].join("|") + "|"
        );
      });

      res.json({
        filename: `P${eNumber}_${year}.TXT`,
        content: lines.join("\r\n") + (lines.length > 0 ? "\r\n" : ""),
        count: records.length,
        warnings,
      });
    } catch (error) {
      console.error("Error exporting GT CP8D file:", error);
      res.status(500).json({
        message: "Error exporting CP8D file",
        error: error.message,
      });
    }
  });

  return router;
}
