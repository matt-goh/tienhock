// src/routes/jellypolly/employee-payrolls.js
// Jelly Polly employee payrolls: batch/single detail reads, manual items, and
// the cross-company take-home summary. Recalculation after manual item changes
// delegates to jpPayrollProcessor (single source of processing math).
import { Router } from "express";
import { reprocessJPEmployees } from "./jpPayrollProcessor.js";

export default function (pool) {
  const router = Router();

  // Rebuild one payroll's employee via the shared processor
  const recalculateJPPayroll = async (employeePayrollId) => {
    const payrollResult = await pool.query(
      `SELECT ep.employee_id, mp.year, mp.month
       FROM jellypolly.employee_payrolls ep
       JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
       WHERE ep.id = $1`,
      [employeePayrollId]
    );
    if (payrollResult.rows.length === 0) {
      throw new Error("Employee payroll not found");
    }
    const { employee_id, year, month } = payrollResult.rows[0];
    const result = await reprocessJPEmployees(pool, {
      year,
      month,
      employeeIds: [employee_id],
    });
    // July 2026+ OT formula block (decision 15): surface it instead of leaving
    // the payroll silently stale after a manual item change.
    const blockedEmployee = (result.blocked || []).find(
      (b) => b.employeeId === employee_id
    );
    if (blockedEmployee) {
      throw new Error(blockedEmployee.error);
    }
  };

  const roundMoney = (value) =>
    Math.round((parseFloat(value) || 0) * 100) / 100;

  const buildMidMonthAggregateMap = (rows) => {
    return rows.reduce((acc, row) => {
      const sourceEmployeeId = row.source_employee_id || row.employee_id;
      const key = `${sourceEmployeeId}:${row.year}:${row.month}`;
      const amount = roundMoney(row.amount);

      if (!acc[key]) {
        acc[key] = {
          primary: row,
          total: 0,
          byEmployee: {},
        };
      }

      if (row.employee_id === sourceEmployeeId) {
        acc[key].primary = row;
      }

      acc[key].total = roundMoney(acc[key].total + amount);
      acc[key].byEmployee[row.employee_id] = roundMoney(
        (acc[key].byEmployee[row.employee_id] || 0) + amount
      );
      return acc;
    }, {});
  };

  const serializeMidMonthAggregate = (aggregate, employeeId) => {
    if (!aggregate) return null;
    const { source_employee_id, ...primary } = aggregate.primary;
    return {
      ...primary,
      employee_id: employeeId,
      amount: aggregate.total,
    };
  };

  // Cross-company take-home summary for a staff member's name-sibling group.
  // Returns Tien Hock + Jelly Polly pay for the month so both Details pages can
  // render a combined take-home card for dual-company staff.
  // Registered before /:id so "cross-company" isn't captured as an id.
  router.get("/cross-company/:employeeId/:year/:month", async (req, res) => {
    const { employeeId, year, month } = req.params;

    try {
      // TH and JP have SEPARATE staff catalogues, so the person is matched by
      // NAME across the two. The id may come from either catalogue.
      const [jpStaffResult, thStaffResult] = await Promise.all([
        pool.query("SELECT name FROM jellypolly.staffs WHERE id = $1", [
          employeeId,
        ]),
        pool.query("SELECT name FROM public.staffs WHERE id = $1", [
          employeeId,
        ]),
      ]);
      const name =
        jpStaffResult.rows[0]?.name || thStaffResult.rows[0]?.name || null;
      if (!name) {
        return res.status(404).json({ message: "Staff not found" });
      }

      const [jpSiblingsResult, thSiblingsResult] = await Promise.all([
        pool.query(
          `SELECT id FROM jellypolly.staffs
           WHERE UPPER(TRIM(name)) = UPPER(TRIM($1))`,
          [name]
        ),
        pool.query(
          `SELECT id FROM public.staffs
           WHERE UPPER(TRIM(name)) = UPPER(TRIM($1))`,
          [name]
        ),
      ]);
      const jpIds = jpSiblingsResult.rows.map((r) => r.id);
      const thIds = thSiblingsResult.rows.map((r) => r.id);

      const buildCompanySummary = async (schema, siblingIds) => {
        if (siblingIds.length === 0) return null;
        const payrollResult = await pool.query(
          `SELECT ep.id, ep.employee_id, ep.net_pay, ep.setelah_digenapkan
           FROM ${schema}.employee_payrolls ep
           JOIN ${schema}.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
           WHERE mp.year = $1 AND mp.month = $2 AND ep.employee_id = ANY($3)`,
          [parseInt(year), parseInt(month), siblingIds]
        );
        if (payrollResult.rows.length === 0) return null;

        const [pinjamResult, midMonthResult] = await Promise.all([
          pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM ${schema}.pinjam_records
             WHERE year = $1 AND month = $2 AND pinjam_type = 'monthly'
               AND employee_id = ANY($3)`,
            [parseInt(year), parseInt(month), siblingIds]
          ),
          pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM ${schema}.mid_month_payrolls
             WHERE year = $1 AND month = $2 AND status <> 'Cancelled'
               AND employee_id = ANY($3)`,
            [parseInt(year), parseInt(month), siblingIds]
          ),
        ]);

        const netPay = payrollResult.rows.reduce(
          (sum, row) => sum + (parseFloat(row.net_pay) || 0),
          0
        );
        const setelahDigenapkan = payrollResult.rows.reduce(
          (sum, row) => sum + (parseFloat(row.setelah_digenapkan) || 0),
          0
        );
        const monthlyPinjam = parseFloat(pinjamResult.rows[0].total) || 0;
        const midMonth = parseFloat(midMonthResult.rows[0].total) || 0;

        return {
          employee_payroll_ids: payrollResult.rows.map((r) => r.id),
          net_pay: Math.round(netPay * 100) / 100,
          mid_month: Math.round(midMonth * 100) / 100,
          setelah_digenapkan: Math.round(setelahDigenapkan * 100) / 100,
          monthly_pinjam: Math.round(monthlyPinjam * 100) / 100,
          // Jumlah Digenapkan already has mid-month removed; monthly pinjam is
          // deducted at payment time.
          final_take_home:
            Math.round((setelahDigenapkan - monthlyPinjam) * 100) / 100,
        };
      };

      const [tienhock, jellypolly] = await Promise.all([
        buildCompanySummary("public", thIds),
        buildCompanySummary("jellypolly", jpIds),
      ]);

      const combined =
        Math.round(
          ((tienhock?.final_take_home || 0) +
            (tienhock?.mid_month || 0) +
            (jellypolly?.final_take_home || 0) +
            (jellypolly?.mid_month || 0)) *
            100
        ) / 100;

      res.json({
        employee_id: employeeId,
        sibling_ids: { tienhock: thIds, jellypolly: jpIds },
        year: parseInt(year),
        month: parseInt(month),
        tienhock,
        jellypolly,
        combined_take_home: combined,
      });
    } catch (error) {
      console.error("Error fetching cross-company summary:", error);
      res.status(500).json({
        message: "Error fetching cross-company summary",
        error: error.message,
      });
    }
  });

  // Get multiple employee payroll details (batch).
  // Registered before /:id so "batch" isn't captured as an id.
  router.get("/batch", async (req, res) => {
    const { ids } = req.query;

    if (!ids) {
      return res
        .status(400)
        .json({ message: "Employee payroll IDs are required" });
    }

    try {
      const idsText = Array.isArray(ids) ? ids.join(",") : ids;
      const idParts = String(idsText)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (idParts.length === 0 || idParts.some((id) => !/^\d+$/.test(id))) {
        return res.status(400).json({
          message: "Valid employee payroll IDs are required",
        });
      }

      const payrollIds = idParts.map((id) => parseInt(id, 10));

      const payrollsResult = await pool.query(
        `SELECT ep.*, mp.year, mp.month,
                s.name as employee_name, s.ic_no
         FROM jellypolly.employee_payrolls ep
         JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
         LEFT JOIN jellypolly.staffs s ON ep.employee_id = s.id
         WHERE ep.id = ANY($1)`,
        [payrollIds]
      );

      if (payrollsResult.rows.length === 0) {
        return res.json([]);
      }

      const employeeIds = payrollsResult.rows.map((payroll) => payroll.employee_id);
      const years = [...new Set(payrollsResult.rows.map((payroll) => payroll.year))];
      const months = [...new Set(payrollsResult.rows.map((payroll) => payroll.month))];

      const [itemsResult, deductionsResult, midMonthResult, leaveResult] =
        await Promise.all([
          pool.query(
            `SELECT pi.employee_payroll_id, pi.id, pi.pay_code_id, pi.description,
                    pi.rate, pi.rate_unit, pi.quantity, pi.foc_units, pi.amount,
                    pi.is_manual, pi.job_type, pi.source_employee_id,
                    pi.source_date, pi.work_log_id, pi.work_log_type, pc.pay_type
             FROM jellypolly.payroll_items pi
             LEFT JOIN jellypolly.pay_codes pc ON pi.pay_code_id = pc.id
             WHERE pi.employee_payroll_id = ANY($1)
             ORDER BY pi.id`,
            [payrollIds]
          ),
          pool.query(
            `SELECT pd.employee_payroll_id, pd.deduction_type, pd.employee_amount,
                    pd.employer_amount, pd.wage_amount, pd.rate_info
             FROM jellypolly.payroll_deductions pd
             WHERE pd.employee_payroll_id = ANY($1)
             ORDER BY pd.employee_payroll_id, pd.deduction_type`,
            [payrollIds]
          ),
          pool.query(
            `WITH source_siblings AS (
               SELECT source.id AS source_employee_id, sibling.id AS sibling_id
               FROM jellypolly.staffs source
               JOIN jellypolly.staffs sibling
                 ON COALESCE(NULLIF(sibling.head_staff_id, ''), sibling.id) =
                    COALESCE(NULLIF(source.head_staff_id, ''), source.id)
               WHERE source.id = ANY($1)
             )
             SELECT ss.source_employee_id, mmp.id, mmp.employee_id, mmp.year,
                    mmp.month, mmp.amount, mmp.payment_method, mmp.status,
                    mmp.created_at, mmp.updated_at, mmp.paid_at, mmp.notes
             FROM source_siblings ss
             JOIN jellypolly.mid_month_payrolls mmp ON mmp.employee_id = ss.sibling_id
             WHERE mmp.year = ANY($2)
               AND mmp.month = ANY($3)
               AND mmp.status <> 'Cancelled'`,
            [employeeIds, years, months]
          ),
          pool.query(
            `WITH source_siblings AS (
               SELECT source.id AS source_employee_id, sibling.id AS sibling_id
               FROM jellypolly.staffs source
               JOIN jellypolly.staffs sibling
                 ON COALESCE(NULLIF(sibling.head_staff_id, ''), sibling.id) =
                    COALESCE(NULLIF(source.head_staff_id, ''), source.id)
               WHERE source.id = ANY($1)
             )
             SELECT ss.source_employee_id, lr.id, lr.employee_id,
                    to_char(lr.leave_date, 'YYYY-MM-DD') AS leave_date,
                    lr.leave_type, lr.days_taken,
                    CAST(lr.amount_paid AS NUMERIC(10,2)) AS amount_paid,
                    lr.status
             FROM source_siblings ss
             JOIN jellypolly.leave_records lr ON lr.employee_id = ss.sibling_id
             WHERE CAST(EXTRACT(YEAR FROM lr.leave_date) AS INTEGER) = ANY($2)
               AND CAST(EXTRACT(MONTH FROM lr.leave_date) AS INTEGER) = ANY($3)
               AND lr.status = 'approved'
             ORDER BY lr.leave_date`,
            [employeeIds, years, months]
          ),
        ]);

      const itemsByPayrollId = itemsResult.rows.reduce((acc, item) => {
        if (!acc[item.employee_payroll_id]) acc[item.employee_payroll_id] = [];
        acc[item.employee_payroll_id].push({
          ...item,
          rate: parseFloat(item.rate),
          quantity: parseFloat(item.quantity),
          amount: parseFloat(item.amount),
          is_manual: !!item.is_manual,
        });
        return acc;
      }, {});

      const deductionsByPayrollId = deductionsResult.rows.reduce((acc, d) => {
        if (!acc[d.employee_payroll_id]) acc[d.employee_payroll_id] = [];
        acc[d.employee_payroll_id].push({
          ...d,
          employee_amount: parseFloat(d.employee_amount),
          employer_amount: parseFloat(d.employer_amount),
          wage_amount: parseFloat(d.wage_amount),
        });
        return acc;
      }, {});

      const midMonthByEmployeePeriod = buildMidMonthAggregateMap(
        midMonthResult.rows
      );

      const leaveRecordsByEmployeePeriod = leaveResult.rows.reduce((acc, row) => {
        const year = parseInt(row.leave_date.slice(0, 4));
        const month = parseInt(row.leave_date.slice(5, 7));
        const key = `${row.source_employee_id}:${year}:${month}`;
        const { source_employee_id, ...leaveRecord } = row;
        if (!acc[key]) acc[key] = [];
        acc[key].push({
          ...leaveRecord,
          amount_paid: parseFloat(leaveRecord.amount_paid),
        });
        return acc;
      }, {});

      const response = payrollsResult.rows.map((payroll) => ({
        ...payroll,
        gross_pay: parseFloat(payroll.gross_pay),
        net_pay: parseFloat(payroll.net_pay),
        digenapkan: parseFloat(payroll.digenapkan || 0),
        setelah_digenapkan:
          payroll.setelah_digenapkan != null
            ? parseFloat(payroll.setelah_digenapkan)
            : null,
        items: itemsByPayrollId[payroll.id] || [],
        deductions: deductionsByPayrollId[payroll.id] || [],
        leave_records:
          leaveRecordsByEmployeePeriod[
            `${payroll.employee_id}:${payroll.year}:${payroll.month}`
          ] || [],
        mid_month_payroll: serializeMidMonthAggregate(
          midMonthByEmployeePeriod[
            `${payroll.employee_id}:${payroll.year}:${payroll.month}`
          ],
          payroll.employee_id
        ),
        mid_month_payrolls_by_employee:
          midMonthByEmployeePeriod[
            `${payroll.employee_id}:${payroll.year}:${payroll.month}`
          ]?.byEmployee || {},
      }));

      res.json(response);
    } catch (error) {
      console.error("Error fetching batch JP employee payrolls:", error);
      res.status(500).json({
        message: "Error fetching batch JP employee payrolls",
        error: error.message,
      });
    }
  });

  // Get employee payroll details with items and deductions
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const payrollResult = await pool.query(
        `SELECT ep.*, mp.year, mp.month,
                s.name as employee_name, s.ic_no, s.bank_account_number,
                s.epf_no, s.socso_no, s.income_tax_no
         FROM jellypolly.employee_payrolls ep
         JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
         LEFT JOIN jellypolly.staffs s ON ep.employee_id = s.id
         WHERE ep.id = $1`,
        [id]
      );

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Employee payroll not found" });
      }

      const payrollData = payrollResult.rows[0];

      // Leave rolls up like items: include records of the whole sibling group
      const siblingIdsResult = await pool.query(
        `SELECT id FROM jellypolly.staffs
         WHERE COALESCE(NULLIF(head_staff_id, ''), id) =
               (SELECT COALESCE(NULLIF(head_staff_id, ''), id)
                FROM jellypolly.staffs WHERE id = $1)`,
        [payrollData.employee_id]
      );
      const siblingIds = siblingIdsResult.rows.map((r) => r.id);

      const [itemsResult, deductionsResult, pinjamResult, midMonthResult, leaveResult] =
        await Promise.all([
          pool.query(
            `SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit,
                    pi.quantity, pi.foc_units, pi.amount, pi.is_manual, pi.job_type,
                    pi.source_employee_id, pi.source_date, pi.work_log_id,
                    pi.work_log_type,
                    pc.pay_type
             FROM jellypolly.payroll_items pi
             LEFT JOIN jellypolly.pay_codes pc ON pi.pay_code_id = pc.id
             WHERE pi.employee_payroll_id = $1
             ORDER BY pi.id`,
            [id]
          ),
          pool.query(
            `SELECT pd.*,
                    CAST(pd.employee_amount AS NUMERIC(10, 2)) as employee_amount,
                    CAST(pd.employer_amount AS NUMERIC(10, 2)) as employer_amount,
                    CAST(pd.wage_amount AS NUMERIC(10, 2)) as wage_amount
             FROM jellypolly.payroll_deductions pd
             WHERE pd.employee_payroll_id = $1
             ORDER BY pd.deduction_type`,
            [id]
          ),
          pool.query(
            `SELECT id, employee_id, year, month, amount, description, pinjam_type
             FROM jellypolly.pinjam_records
             WHERE employee_id = ANY($1) AND year = $2 AND month = $3
             ORDER BY pinjam_type, description`,
            [
              siblingIds.length > 0 ? siblingIds : [payrollData.employee_id],
              payrollData.year,
              payrollData.month,
            ]
          ),
          pool.query(
            `SELECT $4::varchar AS source_employee_id, id, employee_id, year,
                    month, amount, payment_method, status, created_at,
                    updated_at, paid_at, notes
             FROM jellypolly.mid_month_payrolls
             WHERE employee_id = ANY($1)
               AND year = $2
               AND month = $3
               AND status <> 'Cancelled'
             ORDER BY CASE WHEN employee_id = $4 THEN 0 ELSE 1 END, employee_id`,
            [
              siblingIds.length > 0 ? siblingIds : [payrollData.employee_id],
              payrollData.year,
              payrollData.month,
              payrollData.employee_id,
            ]
          ),
          pool.query(
            `SELECT id, employee_id, to_char(leave_date, 'YYYY-MM-DD') AS leave_date,
                    leave_type, days_taken,
                    CAST(amount_paid AS NUMERIC(10,2)) AS amount_paid, status
             FROM jellypolly.leave_records
             WHERE employee_id = ANY($1)
               AND EXTRACT(YEAR FROM leave_date) = $2
               AND EXTRACT(MONTH FROM leave_date) = $3
               AND status = 'approved'
             ORDER BY leave_date`,
            [
              siblingIds.length > 0 ? siblingIds : [payrollData.employee_id],
              payrollData.year,
              payrollData.month,
            ]
          ),
        ]);

      const items = itemsResult.rows.map((item) => ({
        ...item,
        rate: parseFloat(item.rate),
        quantity: parseFloat(item.quantity),
        amount: parseFloat(item.amount),
        is_manual: !!item.is_manual,
      }));

      const midMonthKey = `${payrollData.employee_id}:${payrollData.year}:${payrollData.month}`;
      const midMonthAggregate =
        buildMidMonthAggregateMap(midMonthResult.rows)[midMonthKey];

      res.json({
        ...payrollData,
        gross_pay: parseFloat(payrollData.gross_pay),
        net_pay: parseFloat(payrollData.net_pay),
        digenapkan: parseFloat(payrollData.digenapkan || 0),
        setelah_digenapkan:
          payrollData.setelah_digenapkan != null
            ? parseFloat(payrollData.setelah_digenapkan)
            : null,
        items,
        deductions: deductionsResult.rows.map((deduction) => ({
          ...deduction,
          employee_amount: parseFloat(deduction.employee_amount),
          employer_amount: parseFloat(deduction.employer_amount),
          wage_amount: parseFloat(deduction.wage_amount),
          rate_info: deduction.rate_info || {},
        })),
        pinjam_records: pinjamResult.rows.map((record) => ({
          ...record,
          amount: parseFloat(record.amount),
        })),
        leave_records: leaveResult.rows.map((record) => ({
          ...record,
          amount_paid: parseFloat(record.amount_paid),
        })),
        mid_month_payroll: serializeMidMonthAggregate(
          midMonthAggregate,
          payrollData.employee_id
        ),
        mid_month_payrolls_by_employee: midMonthAggregate?.byEmployee || {},
      });
    } catch (error) {
      console.error("Error fetching JP employee payroll details:", error);
      res.status(500).json({
        message: "Error fetching JP employee payroll details",
        error: error.message,
      });
    }
  });

  // Add a manual payroll item
  router.post("/:id/items", async (req, res) => {
    const { id } = req.params;
    const { pay_code_id, description, rate, rate_unit, quantity, amount } =
      req.body;

    if (
      !pay_code_id ||
      !description ||
      rate === undefined ||
      !rate_unit ||
      quantity === undefined
    ) {
      return res.status(400).json({
        message:
          "pay_code_id, description, rate, rate_unit, and quantity are required",
      });
    }

    try {
      const checkResult = await pool.query(
        "SELECT ep.id FROM jellypolly.employee_payrolls ep WHERE ep.id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Employee payroll not found" });
      }

      const parsedRate = parseFloat(rate);
      const parsedQuantity = parseFloat(quantity);
      const finalAmount =
        amount !== undefined ? parseFloat(amount) : parsedRate * parsedQuantity;

      const insertResult = await pool.query(
        `INSERT INTO jellypolly.payroll_items (
          employee_payroll_id, pay_code_id, description,
          rate, rate_unit, quantity, amount, is_manual
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        RETURNING *`,
        [id, pay_code_id, description, parsedRate, rate_unit, parsedQuantity, finalAmount]
      );

      // Rebuild gross/deductions/net via the shared processor
      await recalculateJPPayroll(id);

      res.status(201).json({
        message: "Manual payroll item added successfully",
        item: {
          ...insertResult.rows[0],
          rate: parseFloat(insertResult.rows[0].rate),
          quantity: parseFloat(insertResult.rows[0].quantity),
          amount: parseFloat(insertResult.rows[0].amount),
        },
      });
    } catch (error) {
      console.error("Error adding manual payroll item:", error);
      res.status(500).json({
        message: "Error adding manual payroll item",
        error: error.message,
      });
    }
  });

  // Delete a payroll item
  router.delete("/items/:itemId", async (req, res) => {
    const { itemId } = req.params;

    try {
      const checkResult = await pool.query(
        `SELECT pi.id, pi.employee_payroll_id
         FROM jellypolly.payroll_items pi
         WHERE pi.id = $1`,
        [itemId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Payroll item not found" });
      }

      const employeePayrollId = checkResult.rows[0].employee_payroll_id;

      await pool.query("DELETE FROM jellypolly.payroll_items WHERE id = $1", [
        itemId,
      ]);

      await recalculateJPPayroll(employeePayrollId);

      res.json({
        message: "Payroll item deleted successfully",
        employee_payroll_id: employeePayrollId,
      });
    } catch (error) {
      console.error("Error deleting payroll item:", error);
      res.status(500).json({
        message: "Error deleting payroll item",
        error: error.message,
      });
    }
  });

  return router;
}
