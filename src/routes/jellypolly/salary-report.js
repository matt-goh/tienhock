// src/routes/jellypolly/salary-report.js
// Jelly Polly Salary Report. JP has no locations and no leave, so the report
// groups by job type (OFFICE / MAINTENANCE / SALESMAN / ...) instead of location, and the
// per-employee column buckets are computed in JS from the stored payroll
// (employee_payrolls + payroll_items + payroll_deductions + mid-month).
//
// Output shapes match what the shared TH PDF generator
// (src/utils/payroll/SalaryReportPDF.tsx) consumes, with `location` = job group.
import { Router } from "express";

const TOTAL_KEYS = [
  "gaji",
  "ot",
  "bonus",
  "comm",
  "cuti",
  "gaji_kasar",
  "epf_majikan",
  "epf_pekerja",
  "socso_majikan",
  "socso_pekerja",
  "sip_majikan",
  "sip_pekerja",
  "pcb",
  "gaji_bersih",
  "setengah_bulan",
  "jumlah",
  "digenapkan",
  "setelah_digenapkan",
];

const GROUP_ORDER = [
  "OFFICE",
  "MAINTENANCE",
  "SALESMAN",
  "SALESMAN_IKUT",
  "ICE_POLLY",
  "JELLY_CUP",
  "PLASTIC",
  "PRODUCTION",
];
const groupRank = (g) => {
  const i = GROUP_ORDER.indexOf(g);
  return i === -1 ? 99 : i;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const emptyTotals = () => {
  const t = {};
  for (const k of TOTAL_KEYS) t[k] = 0;
  return t;
};

const addInto = (target, src) => {
  for (const k of TOTAL_KEYS) target[k] = round2(target[k] + (Number(src[k]) || 0));
  return target;
};

// Auto bucketing: report_column override wins, else by work_log_type / pay_type.
// Columns map to the PDF fields gaji / ot / bonus / comm (C/I/O) / cuti.
const columnForItem = (item) => {
  switch (item.report_column) {
    case "GAJI":
      return "gaji";
    case "OT":
      return "ot";
    case "BONUS":
      return "bonus";
    case "CIO":
      return "comm";
    case "CUTI":
      return "cuti";
    default:
      break;
  }
  if (item.work_log_type === "bonus") return "bonus";
  if (item.work_log_type === "advance") return "comm";
  if (item.pay_type === "Overtime") return "ot";
  return "gaji";
};

// Build the per-employee column row from its items / deductions / mid-month.
// leaveTotal lands in the CUTI column; daily work items dated on the leave
// owner's leave day are excluded (they are stored for display but not part of
// gross — same convention as the processor / TH).
const buildRow = (
  ep,
  items,
  deductions,
  midMonthAmount,
  leaveTotal = 0,
  leaveDateSet = null
) => {
  const row = emptyTotals();
  for (const item of items) {
    if (
      leaveDateSet &&
      item.work_log_type === "daily" &&
      item.source_date &&
      leaveDateSet.has(`${item.source_employee_id}|${item.source_date}`)
    ) {
      continue;
    }
    row[columnForItem(item)] += Number(item.amount) || 0;
  }
  row.cuti += Number(leaveTotal) || 0;
  row.gaji_kasar = Number(ep.gross_pay) || 0;
  for (const d of deductions) {
    const emp = Number(d.employee_amount) || 0;
    const er = Number(d.employer_amount) || 0;
    if (d.deduction_type === "epf") {
      row.epf_pekerja += emp;
      row.epf_majikan += er;
    } else if (d.deduction_type === "socso") {
      row.socso_pekerja += emp;
      row.socso_majikan += er;
    } else if (d.deduction_type === "sip") {
      row.sip_pekerja += emp;
      row.sip_majikan += er;
    } else if (d.deduction_type === "income_tax") {
      row.pcb += emp;
    }
  }
  row.gaji_bersih = Number(ep.net_pay) || 0;
  row.setengah_bulan = Number(midMonthAmount) || 0;
  const jumlah = row.gaji_bersih - row.setengah_bulan;
  row.jumlah = jumlah;
  row.setelah_digenapkan =
    ep.setelah_digenapkan != null
      ? Number(ep.setelah_digenapkan)
      : Math.ceil(jumlah);
  row.digenapkan =
    ep.digenapkan != null ? Number(ep.digenapkan) : row.setelah_digenapkan - jumlah;
  for (const k of TOTAL_KEYS) row[k] = round2(row[k]);
  return row;
};

export default function (pool) {
  const router = Router();

  // Fetch every processed employee payroll for a year as flat rows, each already
  // bucketed: { month, job_type, employee_id, employee_name, ep_id, row }.
  const loadYearRows = async (year) => {
    const mps = await pool.query(
      "SELECT id, month FROM jellypolly.monthly_payrolls WHERE year = $1",
      [year]
    );
    if (mps.rows.length === 0) return [];
    const monthByMp = {};
    mps.rows.forEach((m) => {
      monthByMp[m.id] = m.month;
    });
    const mpIds = mps.rows.map((m) => m.id);

    const eps = await pool.query(
      `SELECT ep.id, ep.monthly_payroll_id, ep.employee_id, ep.job_type,
              ep.gross_pay, ep.net_pay, ep.digenapkan, ep.setelah_digenapkan,
              s.name as employee_name
       FROM jellypolly.employee_payrolls ep
       LEFT JOIN public.staffs s ON ep.employee_id = s.id
       WHERE ep.monthly_payroll_id = ANY($1)`,
      [mpIds]
    );
    const epIds = eps.rows.map((e) => e.id);
    if (epIds.length === 0) return [];

    const [items, deds, mid, leave] = await Promise.all([
      pool.query(
        `SELECT pi.employee_payroll_id, pi.amount, pi.work_log_type,
                pi.source_employee_id,
                to_char(pi.source_date, 'YYYY-MM-DD') AS source_date,
                pc.pay_type, pc.report_column
         FROM jellypolly.payroll_items pi
         LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
         WHERE pi.employee_payroll_id = ANY($1)`,
        [epIds]
      ),
      pool.query(
        `SELECT employee_payroll_id, deduction_type,
                CAST(employee_amount AS NUMERIC(10,2)) AS employee_amount,
                CAST(employer_amount AS NUMERIC(10,2)) AS employer_amount
         FROM jellypolly.payroll_deductions
         WHERE employee_payroll_id = ANY($1)`,
        [epIds]
      ),
      pool.query(
        `SELECT employee_id, month, amount
         FROM jellypolly.mid_month_payrolls
         WHERE year = $1 AND status <> 'Cancelled'`,
        [year]
      ),
      // Leave rolls up to the HEAD id (like items); the CUTI column shows the
      // month's approved leave pay
      pool.query(
        `SELECT COALESCE(NULLIF(s.head_staff_id, ''), lr.employee_id) AS canonical_id,
                lr.employee_id,
                to_char(lr.leave_date, 'YYYY-MM-DD') AS leave_date,
                EXTRACT(MONTH FROM lr.leave_date)::int AS month,
                CAST(lr.amount_paid AS NUMERIC(10,2)) AS amount_paid
         FROM public.leave_records lr
         LEFT JOIN public.staffs s ON s.id = lr.employee_id
         WHERE EXTRACT(YEAR FROM lr.leave_date) = $1
           AND lr.status = 'approved'
           AND lr.company = 'JP'`,
        [year]
      ),
    ]);

    const itemsByEp = {};
    items.rows.forEach((i) => {
      if (!itemsByEp[i.employee_payroll_id]) itemsByEp[i.employee_payroll_id] = [];
      itemsByEp[i.employee_payroll_id].push(i);
    });
    const dedsByEp = {};
    deds.rows.forEach((d) => {
      if (!dedsByEp[d.employee_payroll_id]) dedsByEp[d.employee_payroll_id] = [];
      dedsByEp[d.employee_payroll_id].push(d);
    });
    const midByEmpMonth = {};
    mid.rows.forEach((m) => {
      midByEmpMonth[`${m.employee_id}_${m.month}`] = Number(m.amount);
    });
    const leaveTotalByEmpMonth = {};
    const leaveDatesByEmpMonth = {};
    leave.rows.forEach((l) => {
      const key = `${l.canonical_id}_${l.month}`;
      leaveTotalByEmpMonth[key] =
        (leaveTotalByEmpMonth[key] || 0) + (Number(l.amount_paid) || 0);
      if (!leaveDatesByEmpMonth[key]) leaveDatesByEmpMonth[key] = new Set();
      leaveDatesByEmpMonth[key].add(`${l.employee_id}|${l.leave_date}`);
    });

    return eps.rows.map((ep) => {
      const month = monthByMp[ep.monthly_payroll_id];
      const row = buildRow(
        ep,
        itemsByEp[ep.id] || [],
        dedsByEp[ep.id] || [],
        midByEmpMonth[`${ep.employee_id}_${month}`] || 0,
        leaveTotalByEmpMonth[`${ep.employee_id}_${month}`] || 0,
        leaveDatesByEmpMonth[`${ep.employee_id}_${month}`] || null
      );
      return {
        month,
        job_type: ep.job_type || "OTHER",
        employee_id: ep.employee_id,
        employee_name: ep.employee_name || ep.employee_id,
        ep_id: ep.id,
        row,
      };
    });
  };

  /**
   * GET /jellypolly/api/salary-report?year&month
   * Comprehensive monthly report grouped by job (OFFICE/DRIVER).
   */
  router.get("/", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month) {
      return res.status(400).json({ message: "year and month are required" });
    }
    try {
      const all = await loadYearRows(year);
      const rows = all.filter((r) => r.month === month);

      const groups = {};
      const grand = emptyTotals();
      for (const r of rows) {
        if (!groups[r.job_type]) {
          groups[r.job_type] = {
            location: r.job_type,
            employees: [],
            totals: emptyTotals(),
          };
        }
        groups[r.job_type].employees.push({
          employee_payroll_id: r.ep_id,
          staff_id: r.employee_id,
          staff_name: r.employee_name,
          ...r.row,
        });
        addInto(groups[r.job_type].totals, r.row);
        addInto(grand, r.row);
      }
      const locations = Object.values(groups).sort(
        (a, b) => groupRank(a.location) - groupRank(b.location)
      );
      res.json({ year, month, locations, grand_totals: grand });
    } catch (error) {
      console.error("Error building JP salary report:", error);
      res.status(500).json({
        message: "Error building salary report",
        error: error.message,
      });
    }
  });

  /**
   * GET /jellypolly/api/salary-report/annual?year
   * Annual summary: per-month totals + per-group totals + grand totals.
   */
  router.get("/annual", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    if (!year) return res.status(400).json({ message: "year is required" });
    try {
      const rows = await loadYearRows(year);
      const monthlyMap = {};
      const locMap = {};
      const grand = emptyTotals();
      for (const r of rows) {
        if (!monthlyMap[r.month]) monthlyMap[r.month] = emptyTotals();
        addInto(monthlyMap[r.month], r.row);
        if (!locMap[r.job_type]) locMap[r.job_type] = emptyTotals();
        addInto(locMap[r.job_type], r.row);
        addInto(grand, r.row);
      }
      const monthly = Object.keys(monthlyMap)
        .map((m) => ({ month: Number(m), totals: monthlyMap[m] }))
        .sort((a, b) => a.month - b.month);
      const locations = Object.keys(locMap)
        .map((l) => ({ location: l, totals: locMap[l] }))
        .sort((a, b) => groupRank(a.location) - groupRank(b.location));
      res.json({ year, monthly, locations, grand_totals: grand });
    } catch (error) {
      console.error("Error building JP annual salary report:", error);
      res.status(500).json({
        message: "Error building annual salary report",
        error: error.message,
      });
    }
  });

  /**
   * GET /jellypolly/api/salary-report/annual-breakdown?year
   * Per group, each employee expanded into one row per processed month.
   */
  router.get("/annual-breakdown", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    if (!year) return res.status(400).json({ message: "year is required" });
    try {
      const rows = await loadYearRows(year);
      const locMap = {};
      const grand = emptyTotals();
      for (const r of rows) {
        if (!locMap[r.job_type]) {
          locMap[r.job_type] = {
            location: r.job_type,
            employees: new Map(),
            totals: emptyTotals(),
          };
        }
        const loc = locMap[r.job_type];
        let emp = loc.employees.get(r.employee_id);
        if (!emp) {
          emp = {
            staff_id: r.employee_id,
            staff_name: r.employee_name,
            monthsMap: {},
            total: emptyTotals(),
          };
          loc.employees.set(r.employee_id, emp);
        }
        emp.monthsMap[r.month] = { ...r.row, month: r.month };
        addInto(emp.total, r.row);
        addInto(loc.totals, r.row);
        addInto(grand, r.row);
      }
      const locations = Object.values(locMap)
        .sort((a, b) => groupRank(a.location) - groupRank(b.location))
        .map((loc) => ({
          location: loc.location,
          employees: Array.from(loc.employees.values()).map((e) => ({
            staff_id: e.staff_id,
            staff_name: e.staff_name,
            months: Object.values(e.monthsMap).sort((a, b) => a.month - b.month),
            total: e.total,
          })),
          totals: loc.totals,
        }));
      res.json({ year, locations, grand_totals: grand });
    } catch (error) {
      console.error("Error building JP annual breakdown:", error);
      res.status(500).json({
        message: "Error building annual breakdown",
        error: error.message,
      });
    }
  });

  return router;
}
