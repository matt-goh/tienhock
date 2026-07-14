// src/routes/greentarget/leave-management.js
// GT leave management — ported from src/routes/jellypolly/leave-management.js.
// GT keeps its OWN leave ledger (greentarget.leave_records +
// greentarget.employee_leave_balances) isolated from TH/JP, but GT staff live in
// public.staffs, so sibling aggregation and the staff joins run on public.staffs.
// The cuti-tahunan "advance" union reads greentarget.commission_records flagged
// is_advance = true (GT has no location_code). Packing-cuti endpoints are TH/JP
// only and are intentionally omitted here.
import { Router } from "express";

const VALID_LEAVE_TYPES = new Set([
  "cuti_umum",
  "cuti_sakit",
  "cuti_tahunan",
  "cuti_rawatan",
]);

// --- Helper Functions for Leave Calculation ---

/**
 * Calculates years of service from the join date to now.
 * @param {Date} dateJoined - The date the employee joined.
 * @returns {number} The total years of service.
 */
const calculateYearsOfService = (dateJoined) => {
  if (!dateJoined) return 0;
  const now = new Date();
  const joinDate = new Date(dateJoined);
  let years = now.getFullYear() - joinDate.getFullYear();
  const monthDiff = now.getMonth() - joinDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < joinDate.getDate())
  ) {
    years--;
  }
  return years;
};

/**
 * Calculates leave allocation based on years of service.
 * These values are based on standard Malaysian labor law.
 * @param {number} yearsOfService - The employee's years of service.
 * @returns {{cuti_tahunan_total: number, cuti_sakit_total: number, cuti_rawatan_total: number}}
 */
const calculateLeaveAllocation = (yearsOfService) => {
  let cuti_tahunan_total;
  let cuti_sakit_total;

  if (yearsOfService < 2) {
    cuti_tahunan_total = 8;
    cuti_sakit_total = 14;
  } else if (yearsOfService < 5) {
    cuti_tahunan_total = 12;
    cuti_sakit_total = 18;
  } else {
    cuti_tahunan_total = 16;
    cuti_sakit_total = 22;
  }

  return { cuti_tahunan_total, cuti_sakit_total, cuti_rawatan_total: 60 };
};

/**
 * Returns the list of sibling staff IDs sharing the same name as `employeeId`,
 * sorted by date_joined ASC (senior first) with id ASC as tie-breaker.
 * Multi-ID employees: leave is aggregated across these siblings so they share
 * one entitlement bucket per person, matching how payroll groups them.
 * Single-ID employees: returns just [{id: self, date_joined}].
 */
const getSiblingIds = async (client, employeeId) => {
  const result = await client.query(
    `SELECT id, date_joined
       FROM public.staffs
      WHERE name = (SELECT name FROM public.staffs WHERE id = $1)
      ORDER BY date_joined ASC, id ASC`,
    [employeeId],
  );
  return result.rows; // [{ id, date_joined }, ...]
};

const getCutiUmumTotal = async (client, year) => {
  const result = await client.query(
    `
      SELECT COUNT(*)::integer as total
      FROM holiday_calendar
      WHERE is_active = true
        AND is_cuti_umum = true
        AND EXTRACT(YEAR FROM holiday_date) = $1
    `,
    [year]
  );

  return Number(result.rows[0]?.total || 0);
};

const getCutiTahunanAdvanceDaysExpression = () => "1::numeric";

export default function (pool) {
  const router = Router();

  /**
   * GET /greentarget/api/leave-management/balances/batch?employeeIds=EMP1,EMP2&year=2024
   * Gets or creates leave balances for multiple employees for a given year.
   */
  router.get("/balances/batch", async (req, res) => {
    const { employeeIds, year } = req.query;

    if (!employeeIds || !year) {
      return res.status(400).json({
        message: "employeeIds and year query parameters are required",
      });
    }

    try {
      const employeeIdList = employeeIds.split(",").filter((id) => id.trim());
      if (employeeIdList.length === 0) {
        return res.status(400).json({
          message: "At least one employee ID is required",
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const result = {};
        const cutiUmumTotal = await getCutiUmumTotal(client, parseInt(year));

        // Cache results per canonical ID so that two requested IDs sharing a
        // name don't re-run the same lookups twice.
        const canonicalCache = new Map(); // canonicalId -> { balance, taken }

        for (const employeeId of employeeIdList) {
          const siblings = await getSiblingIds(client, employeeId);
          if (siblings.length === 0) continue; // unknown employee → skip

          const canonicalId = siblings[0].id;
          const seniorJoined = siblings[0].date_joined;
          const siblingIds = siblings.map((s) => s.id);

          let cached = canonicalCache.get(canonicalId);
          if (!cached) {
            let balanceResult = await client.query(
              `SELECT * FROM greentarget.employee_leave_balances
                WHERE employee_id = ANY($1::text[]) AND year = $2
                ORDER BY CASE WHEN employee_id = $3 THEN 0 ELSE 1 END, id ASC
                LIMIT 1`,
              [siblingIds, parseInt(year), canonicalId]
            );

            if (balanceResult.rows.length === 0) {
              const yearsOfService = calculateYearsOfService(seniorJoined);
              const {
                cuti_tahunan_total,
                cuti_sakit_total,
                cuti_rawatan_total,
              } = calculateLeaveAllocation(yearsOfService);

              balanceResult = await client.query(
                `WITH inserted AS (
                   INSERT INTO greentarget.employee_leave_balances (employee_id, year, cuti_tahunan_total, cuti_sakit_total, cuti_rawatan_total)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (employee_id, year) DO NOTHING
                   RETURNING *
                 )
                 SELECT * FROM inserted
                 UNION ALL
                 SELECT * FROM greentarget.employee_leave_balances
                  WHERE employee_id = $1 AND year = $2
                 LIMIT 1;`,
                [
                  canonicalId,
                  parseInt(year),
                  cuti_tahunan_total,
                  cuti_sakit_total,
                  cuti_rawatan_total,
                ]
              );
            }

            const takenLeaveResult = await client.query(
              `SELECT leave_type, SUM(total_taken) as total_taken
                 FROM (
                   SELECT leave_type, SUM(days_taken)::numeric as total_taken
                     FROM greentarget.leave_records
                    WHERE employee_id = ANY($1::text[])
                      AND EXTRACT(YEAR FROM leave_date) = $2
                      AND status = 'approved'
                    GROUP BY leave_type

                   UNION ALL

                   SELECT 'cuti_tahunan' as leave_type,
                          SUM(${getCutiTahunanAdvanceDaysExpression()}) as total_taken
                     FROM greentarget.commission_records cr
                    WHERE cr.employee_id = ANY($1::text[])
                      AND EXTRACT(YEAR FROM cr.commission_date) = $2
                      AND cr.is_advance = true
                 ) leave_sources
                WHERE total_taken IS NOT NULL
                GROUP BY leave_type;`,
              [siblingIds, parseInt(year)]
            );

            const takenLeave = takenLeaveResult.rows.reduce((acc, row) => {
              acc[row.leave_type] = parseFloat(row.total_taken);
              return acc;
            }, {});

            cached = {
              balance: {
                ...balanceResult.rows[0],
                cuti_umum_total: cutiUmumTotal,
              },
              taken: takenLeave,
            };
            canonicalCache.set(canonicalId, cached);
          }

          // Always key the response by the originally-requested ID.
          result[employeeId] = cached;
        }

        await client.query("COMMIT");
        res.json(result);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error fetching batch leave balances:", error);
      res.status(500).json({
        message: "Error fetching batch leave balances",
        error: error.message,
      });
    }
  });

  /**
   * GET /greentarget/api/leave-management/balances/:employeeId/:year
   * Gets or creates leave balances for an employee for a given year.
   */
  router.get("/balances/:employeeId/:year", async (req, res) => {
    const { employeeId, year } = req.params;

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Find all sibling IDs sharing this employee's name.
        const siblings = await getSiblingIds(client, employeeId);
        if (siblings.length === 0) {
          return res.status(404).json({ message: "Employee not found." });
        }

        const siblingIds = siblings.map((s) => s.id);
        const canonicalId = siblings[0].id;
        const seniorJoined = siblings[0].date_joined;

        // Prefer the canonical sibling's balance row; fall back to any sibling's.
        let balanceResult = await client.query(
          `SELECT * FROM greentarget.employee_leave_balances
            WHERE employee_id = ANY($1::text[]) AND year = $2
            ORDER BY CASE WHEN employee_id = $3 THEN 0 ELSE 1 END, id ASC
            LIMIT 1`,
          [siblingIds, parseInt(year), canonicalId]
        );

        if (balanceResult.rows.length === 0) {
          // Lazy-create the canonical balance row using the senior sibling's tenure.
          const yearsOfService = calculateYearsOfService(seniorJoined);
          const { cuti_tahunan_total, cuti_sakit_total, cuti_rawatan_total } =
            calculateLeaveAllocation(yearsOfService);

          balanceResult = await client.query(
            `WITH inserted AS (
               INSERT INTO greentarget.employee_leave_balances (employee_id, year, cuti_tahunan_total, cuti_sakit_total, cuti_rawatan_total)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (employee_id, year) DO NOTHING
               RETURNING *
             )
             SELECT * FROM inserted
             UNION ALL
             SELECT * FROM greentarget.employee_leave_balances
              WHERE employee_id = $1 AND year = $2
             LIMIT 1;`,
            [
              canonicalId,
              parseInt(year),
              cuti_tahunan_total,
              cuti_sakit_total,
              cuti_rawatan_total,
            ]
          );
        }

        const cutiUmumTotal = await getCutiUmumTotal(client, parseInt(year));

        // Sum taken-days across ALL sibling IDs so multi-ID employees share one bucket.
        const takenLeaveResult = await client.query(
          `SELECT leave_type, SUM(total_taken) as total_taken
             FROM (
               SELECT leave_type, SUM(days_taken)::numeric as total_taken
                 FROM greentarget.leave_records
                WHERE employee_id = ANY($1::text[])
                  AND EXTRACT(YEAR FROM leave_date) = $2
                  AND status = 'approved'
                GROUP BY leave_type

               UNION ALL

               SELECT 'cuti_tahunan' as leave_type,
                      SUM(${getCutiTahunanAdvanceDaysExpression()}) as total_taken
                 FROM greentarget.commission_records cr
                WHERE cr.employee_id = ANY($1::text[])
                  AND EXTRACT(YEAR FROM cr.commission_date) = $2
                  AND cr.is_advance = true
             ) leave_sources
            WHERE total_taken IS NOT NULL
            GROUP BY leave_type;`,
          [siblingIds, parseInt(year)]
        );

        const takenLeave = takenLeaveResult.rows.reduce((acc, row) => {
          acc[row.leave_type] = parseFloat(row.total_taken);
          return acc;
        }, {});

        await client.query("COMMIT");
        res.json({
          balance: {
            ...balanceResult.rows[0],
            cuti_umum_total: cutiUmumTotal,
          },
          taken: takenLeave,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error fetching leave balances:", error);
      res.status(500).json({
        message: "Error fetching leave balances",
        error: error.message,
      });
    }
  });

  /**
   * GET /greentarget/api/leave-management/records/:employeeId/:year
   * Gets all leave records for an employee for a given year.
   */
  router.get("/records/:employeeId/:year", async (req, res) => {
    const { employeeId, year } = req.params;
    try {
      const client = await pool.connect();
      try {
        const siblings = await getSiblingIds(client, employeeId);
        if (siblings.length === 0) {
          return res.json([]);
        }
        const siblingIds = siblings.map((s) => s.id);

        const result = await client.query(
          `SELECT *
             FROM (
               SELECT id, employee_id, leave_date, leave_type, days_taken,
                      amount_paid, status, notes, created_by, created_at, updated_at
                 FROM greentarget.leave_records
                WHERE employee_id = ANY($1::text[])
                  AND EXTRACT(YEAR FROM leave_date) = $2

               UNION ALL

               SELECT -cr.id as id,
                      cr.employee_id,
                      cr.commission_date as leave_date,
                      'cuti_tahunan' as leave_type,
                      ${getCutiTahunanAdvanceDaysExpression()} as days_taken,
                      cr.amount as amount_paid,
                      'approved' as status,
                      CONCAT('Others (Advance) - ', cr.description) as notes,
                      cr.created_by,
                      cr.created_at,
                      NULL::timestamp as updated_at
                 FROM greentarget.commission_records cr
                WHERE cr.employee_id = ANY($1::text[])
                  AND EXTRACT(YEAR FROM cr.commission_date) = $2
                  AND cr.is_advance = true
             ) leave_sources
            ORDER BY leave_date DESC`,
          [siblingIds, parseInt(year)]
        );
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error fetching leave records:", error);
      res.status(500).json({
        message: "Error fetching leave records",
        error: error.message,
      });
    }
  });

  /**
   * POST /greentarget/api/leave-management/records
   * Creates a new leave record.
   */
  router.post("/records", async (req, res) => {
    const {
      employee_id,
      leave_date,
      leave_type,
      work_log_id,
      days_taken,
      amount_paid,
      status,
      notes,
      created_by,
    } = req.body;

    try {
      const query = `
        INSERT INTO greentarget.leave_records (
          employee_id, leave_date, leave_type, work_log_id, days_taken,
          amount_paid, status, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const result = await pool.query(query, [
        employee_id,
        leave_date,
        leave_type,
        work_log_id,
        days_taken,
        amount_paid,
        status,
        notes,
        created_by,
      ]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating leave record:", error);
      res.status(500).json({
        message: "Error creating leave record",
        error: error.message,
      });
    }
  });

  /**
   * PUT /greentarget/api/leave-management/records/:id
   * Updates an existing leave record.
   */
  router.put("/records/:id", async (req, res) => {
    const { id } = req.params;
    const { leave_date, leave_type, days_taken, amount_paid, status, notes } =
      req.body;

    try {
      const query = `
        UPDATE greentarget.leave_records
        SET leave_date = $1, leave_type = $2, days_taken = $3, amount_paid = $4,
            status = $5, notes = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING *;
      `;
      const result = await pool.query(query, [
        leave_date,
        leave_type,
        days_taken,
        amount_paid,
        status,
        notes,
        id,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Leave record not found." });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating leave record:", error);
      res.status(500).json({
        message: "Error updating leave record",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /greentarget/api/leave-management/records/:id
   * Deletes a leave record.
   */
  router.delete("/records/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM greentarget.leave_records WHERE id = $1 RETURNING *",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Leave record not found." });
      }
      res.status(200).json({ message: "Leave record deleted successfully." });
    } catch (error) {
      console.error("Error deleting leave record:", error);
      res.status(500).json({
        message: "Error deleting leave record",
        error: error.message,
      });
    }
  });

  /**
   * GET /greentarget/api/leave-management/summary/:employeeId/:year/:month
   * Get monthly leave summary for an employee.
   */
  router.get("/summary/:employeeId/:year/:month", async (req, res) => {
    const { employeeId, year, month } = req.params;
    try {
      const client = await pool.connect();
      try {
        const siblings = await getSiblingIds(client, employeeId);
        if (siblings.length === 0) {
          return res.json([]);
        }
        const siblingIds = siblings.map((s) => s.id);

        const result = await client.query(
          `SELECT
             to_char(leave_date, 'YYYY-MM-DD') as date,
             leave_type,
             days_taken,
             amount_paid
           FROM (
             SELECT leave_date, leave_type, days_taken, amount_paid
               FROM greentarget.leave_records
              WHERE employee_id = ANY($1::text[])
                AND EXTRACT(YEAR FROM leave_date) = $2
                AND EXTRACT(MONTH FROM leave_date) = $3
                AND status = 'approved'

             UNION ALL

             SELECT cr.commission_date as leave_date,
                    'cuti_tahunan' as leave_type,
                    ${getCutiTahunanAdvanceDaysExpression()} as days_taken,
                    cr.amount as amount_paid
               FROM greentarget.commission_records cr
              WHERE cr.employee_id = ANY($1::text[])
                AND EXTRACT(YEAR FROM cr.commission_date) = $2
                AND EXTRACT(MONTH FROM cr.commission_date) = $3
                AND cr.is_advance = true
           ) leave_sources
           ORDER BY leave_date ASC;`,
          [siblingIds, parseInt(year), parseInt(month)]
        );
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error fetching monthly leave summary:", error);
      res.status(500).json({
        message: "Error fetching monthly leave summary",
        error: error.message,
      });
    }
  });

  /**
   * POST /greentarget/api/leave-management/batch-reports
   * Get batch leave reports for multiple employees
   */
  router.post("/batch-reports", async (req, res) => {
    const { employeeIds, year } = req.body;

    if (
      !employeeIds ||
      !Array.isArray(employeeIds) ||
      employeeIds.length === 0
    ) {
      return res.status(400).json({
        message: "Employee IDs array is required and cannot be empty",
      });
    }

    if (!year || typeof year !== "number") {
      return res.status(400).json({
        message: "Year is required and must be a number",
      });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Fetch employee info + leave balances/records aggregated by name so
        // multi-ID employees share a single entitlement bucket.
        const query = `
          WITH requested AS (
            SELECT id FROM public.staffs WHERE id = ANY($1::text[])
          ),
          name_groups AS (
            -- For each requested ID, find all sibling IDs sharing the name.
            SELECT
              r.id AS requested_id,
              s.name,
              ARRAY_AGG(sib.id ORDER BY sib.date_joined ASC, sib.id ASC) AS sibling_ids,
              MIN(sib.date_joined) AS senior_joined,
              (ARRAY_AGG(sib.id ORDER BY sib.date_joined ASC, sib.id ASC))[1] AS canonical_id
            FROM requested r
            JOIN public.staffs s ON s.id = r.id
            JOIN public.staffs sib ON sib.name = s.name
            GROUP BY r.id, s.name
          ),
          employee_info AS (
            -- Use the canonical (senior) sibling's identity for display + tenure.
            SELECT
              ng.requested_id AS id,
              canon.name,
              canon.job,
              canon.date_joined AS "dateJoined",
              canon.ic_no AS "icNo",
              canon.nationality,
              EXTRACT(YEAR FROM AGE(CURRENT_DATE, ng.senior_joined)) AS years_of_service,
              ng.sibling_ids,
              ng.canonical_id
            FROM name_groups ng
            JOIN public.staffs canon ON canon.id = ng.canonical_id
          ),
          leave_balances AS (
            -- One balance row per requested ID; prefer the canonical sibling's row.
            SELECT DISTINCT ON (ei.id)
              ei.id AS requested_id,
              lb.cuti_tahunan_total,
              lb.cuti_sakit_total,
              lb.cuti_rawatan_total
            FROM employee_info ei
            JOIN greentarget.employee_leave_balances lb
              ON lb.employee_id = ANY(ei.sibling_ids) AND lb.year = $2
            ORDER BY ei.id,
                     CASE WHEN lb.employee_id = ei.canonical_id THEN 0 ELSE 1 END,
                     lb.id
          ),
          cuti_umum_entitlement AS (
            SELECT COUNT(*)::integer as total
            FROM holiday_calendar
            WHERE is_active = true
              AND is_cuti_umum = true
              AND EXTRACT(YEAR FROM holiday_date) = $2
          ),
          leave_records_filtered AS (
            -- Expand the per-name sibling list so we pick up every record.
            SELECT
              ei.id AS requested_id,
              lr.leave_date,
              lr.leave_type,
              lr.days_taken,
              lr.amount_paid
            FROM employee_info ei
            JOIN greentarget.leave_records lr ON lr.employee_id = ANY(ei.sibling_ids)
            WHERE EXTRACT(YEAR FROM lr.leave_date) = $2
              AND lr.status = 'approved'

            UNION ALL

            SELECT
              ei.id AS requested_id,
              cr.commission_date AS leave_date,
              'cuti_tahunan' AS leave_type,
              ${getCutiTahunanAdvanceDaysExpression()} AS days_taken,
              cr.amount AS amount_paid
            FROM employee_info ei
            JOIN greentarget.commission_records cr ON cr.employee_id = ANY(ei.sibling_ids)
            WHERE EXTRACT(YEAR FROM cr.commission_date) = $2
              AND cr.is_advance = true
          ),
          leave_taken AS (
            SELECT
              requested_id,
              SUM(CASE WHEN leave_type = 'cuti_umum' THEN days_taken ELSE 0 END) AS cuti_umum,
              SUM(CASE WHEN leave_type = 'cuti_sakit' THEN days_taken ELSE 0 END) AS cuti_sakit,
              SUM(CASE WHEN leave_type = 'cuti_tahunan' THEN days_taken ELSE 0 END) AS cuti_tahunan,
              SUM(CASE WHEN leave_type = 'cuti_rawatan' THEN days_taken ELSE 0 END) AS cuti_rawatan
            FROM leave_records_filtered
            GROUP BY requested_id
          )
          SELECT
            ei.id,
            ei.name,
            ei.job,
            ei."dateJoined",
            ei."icNo",
            ei.nationality,
            ei.years_of_service,
            (SELECT total FROM cuti_umum_entitlement) AS cuti_umum_total,
            COALESCE(lb.cuti_tahunan_total,
              CASE
                WHEN ei.years_of_service < 2 THEN 8
                WHEN ei.years_of_service < 5 THEN 12
                ELSE 16
              END) AS cuti_tahunan_total,
            COALESCE(lb.cuti_sakit_total,
              CASE
                WHEN ei.years_of_service < 2 THEN 14
                WHEN ei.years_of_service < 5 THEN 18
                ELSE 22
              END) AS cuti_sakit_total,
            COALESCE(lb.cuti_rawatan_total, 60) AS cuti_rawatan_total,
            COALESCE(lt.cuti_umum, 0) AS cuti_umum_taken,
            COALESCE(lt.cuti_sakit, 0) AS cuti_sakit_taken,
            COALESCE(lt.cuti_tahunan, 0) AS cuti_tahunan_taken,
            COALESCE(lt.cuti_rawatan, 0) AS cuti_rawatan_taken,
            COALESCE(
              (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                 'leave_date', lrf.leave_date,
                 'leave_type', lrf.leave_type,
                 'days_taken', lrf.days_taken,
                 'amount_paid', lrf.amount_paid))
               FROM leave_records_filtered lrf
               WHERE lrf.requested_id = ei.id),
              '[]'::json
            ) AS leave_records
          FROM employee_info ei
          LEFT JOIN leave_balances lb ON lb.requested_id = ei.id
          LEFT JOIN leave_taken lt ON lt.requested_id = ei.id
          ORDER BY ei.name
        `;

        const result = await client.query(query, [employeeIds, year]);

        // Process the results to match the expected frontend format
        const employees = result.rows.map((row) => {
          // Initialize monthly summary
          const monthlySummary = {};
          for (let i = 1; i <= 12; i++) {
            monthlySummary[i] = {
              cuti_umum: { days: 0, amount: 0 },
              cuti_sakit: { days: 0, amount: 0 },
              cuti_tahunan: { days: 0, amount: 0 },
              cuti_rawatan: { days: 0, amount: 0 },
            };
          }

          // Process leave records to build monthly summary
          const leaveRecords = Array.isArray(row.leave_records)
            ? row.leave_records
            : [];
          leaveRecords.forEach((record) => {
            if (record && record.leave_date && record.leave_type) {
              const month = new Date(record.leave_date).getMonth() + 1;
              if (
                monthlySummary[month] &&
                monthlySummary[month][record.leave_type]
              ) {
                monthlySummary[month][record.leave_type].days += Number(
                  record.days_taken || 0
                );
                monthlySummary[month][record.leave_type].amount += Number(
                  record.amount_paid || 0
                );
              }
            }
          });

          return {
            employee: {
              id: row.id,
              name: row.name,
              job: Array.isArray(row.job) ? row.job : [row.job || "N/A"],
              dateJoined: row.dateJoined,
              icNo: row.icNo,
              nationality: row.nationality,
            },
            year: year,
            yearsOfService: Number(row.years_of_service || 0),
            leaveBalance: {
              cuti_umum_total: Number(row.cuti_umum_total || 0),
              cuti_tahunan_total: Number(row.cuti_tahunan_total || 8),
              cuti_sakit_total: Number(row.cuti_sakit_total || 14),
              cuti_rawatan_total: Number(row.cuti_rawatan_total || 60),
            },
            leaveTaken: {
              cuti_umum: Number(row.cuti_umum_taken || 0),
              cuti_sakit: Number(row.cuti_sakit_taken || 0),
              cuti_tahunan: Number(row.cuti_tahunan_taken || 0),
              cuti_rawatan: Number(row.cuti_rawatan_taken || 0),
            },
            monthlySummary: monthlySummary,
          };
        });

        // Calculate batch summary
        const summary = {
          totalEmployees: employees.length,
          totalDaysUsed: {
            cuti_tahunan: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_tahunan.days,
                  0
                ),
              0
            ),
            cuti_sakit: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_sakit.days,
                  0
                ),
              0
            ),
            cuti_umum: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_umum.days,
                  0
                ),
              0
            ),
            cuti_rawatan: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_rawatan.days,
                  0
                ),
              0
            ),
          },
          totalAmountPaid: {
            cuti_tahunan: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_tahunan.amount,
                  0
                ),
              0
            ),
            cuti_sakit: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_sakit.amount,
                  0
                ),
              0
            ),
            cuti_umum: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_umum.amount,
                  0
                ),
              0
            ),
            cuti_rawatan: employees.reduce(
              (sum, emp) =>
                sum +
                Object.values(emp.monthlySummary).reduce(
                  (monthSum, month) => monthSum + month.cuti_rawatan.amount,
                  0
                ),
              0
            ),
          },
        };

        await client.query("COMMIT");

        res.json({
          employees,
          summary,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error fetching batch leave reports:", error);
      res.status(500).json({
        message: "Failed to fetch batch leave reports",
        error: error.message,
      });
    }
  });

  return router;
}
