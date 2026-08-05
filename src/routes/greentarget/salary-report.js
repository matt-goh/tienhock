// src/routes/greentarget/salary-report.js
// Green Target Salary Report (Phase 5). The report groups by the shared
// public.staffs.location JSONB field (first entry; names from public.locations),
// falling back to "02" (Office) when unset — the same convention as TH. The
// per-employee column buckets are computed in JS from the stored payroll
// (employee_payrolls + payroll_items + payroll_deductions + mid-month). Leave
// pay lives in the GT leave ledger (folded into gross_pay) and is surfaced in
// the Cuti column.
//
// Output shapes match what the shared TH PDF generator
// (src/utils/payroll/SalaryReportPDF.tsx) consumes, with `location` = the
// shared location code.
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

// Locations sort numerically by code; non-numeric codes go last (same as JP).
const locationRank = (code) => {
  const n = parseInt(code, 10);
  return Number.isNaN(n) ? 999 : n;
};

// Staff without a location fall back to Office (same convention as TH).
const DEFAULT_LOCATION = "02";

const firstLocationCode = (location) => {
  if (Array.isArray(location) && location.length > 0 && location[0]) {
    return String(location[0]);
  }
  return DEFAULT_LOCATION;
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

// Commission/bonus advances (is_advance rows, stored as work_log_type='advance'
// items) are already deducted from net_pay by the GT payroll processor. Summing
// them back out here reproduces its commissionAdvanceCents.
const advanceTotalOf = (items) =>
  round2(
    items.reduce(
      (sum, item) =>
        item.work_log_type === "advance" ? sum + (Number(item.amount) || 0) : sum,
      0
    )
  );

// Build the per-employee column row from its items / deductions / mid-month.
const buildRow = (
  ep,
  items,
  deductions,
  midMonthAmount,
  leaveAmount = 0,
  advanceTotal = 0
) => {
  const row = emptyTotals();
  for (const item of items) {
    row[columnForItem(item)] += Number(item.amount) || 0;
  }
  // Leave pay is folded into gross_pay by the processor but is not a payroll
  // item, so surface it in the Cuti column here to reconcile with gaji_kasar.
  row.cuti += Number(leaveAmount) || 0;
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
  // GAJI BERSIH / JUMLAH / S.DIGENAP show the TOTAL earned salary, adding back
  // advances already paid out, so the report reflects full salary rather than
  // cash-in-hand (same convention as TH). The Bank/Pinjam tabs subtract the
  // advance again via gaji_genap to get the actual take-home.
  row.gaji_bersih = (Number(ep.net_pay) || 0) + advanceTotal;
  row.setengah_bulan = Number(midMonthAmount) || 0;
  const jumlah = row.gaji_bersih - row.setengah_bulan;
  row.jumlah = jumlah;
  // Derive rounding from the live, non-cancelled advance amount so historical
  // payroll rows cannot keep a cancelled advance in report totals.
  row.setelah_digenapkan = Math.ceil(jumlah);
  row.digenapkan = row.setelah_digenapkan - jumlah;
  for (const k of TOTAL_KEYS) row[k] = round2(row[k]);
  return row;
};

export default function (pool) {
  const router = Router();

  // Fetch every processed employee payroll for a year as flat rows, each already
  // bucketed: { month, job_type, employee_id, employee_name, ep_id, row }.
  const loadYearRows = async (year) => {
    const mps = await pool.query(
      "SELECT id, month FROM greentarget.monthly_payrolls WHERE year = $1",
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
              s.name as employee_name, s.location,
              s.ic_no, s.bank_account_number, s.payment_preference
       FROM greentarget.employee_payrolls ep
       LEFT JOIN public.staffs s ON ep.employee_id = s.id
       WHERE ep.monthly_payroll_id = ANY($1)`,
      [mpIds]
    );
    const epIds = eps.rows.map((e) => e.id);
    if (epIds.length === 0) return [];

    const [items, deds, mid, leave, pinjam] = await Promise.all([
      pool.query(
        `SELECT pi.employee_payroll_id, pi.amount, pi.work_log_type,
                pc.pay_type, pc.report_column
         FROM greentarget.payroll_items pi
         LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
         WHERE pi.employee_payroll_id = ANY($1)`,
        [epIds]
      ),
      pool.query(
        `SELECT employee_payroll_id, deduction_type,
                CAST(employee_amount AS NUMERIC(10,2)) AS employee_amount,
                CAST(employer_amount AS NUMERIC(10,2)) AS employer_amount
         FROM greentarget.payroll_deductions
         WHERE employee_payroll_id = ANY($1)`,
        [epIds]
      ),
      pool.query(
        `SELECT employee_id, month, amount
         FROM greentarget.mid_month_payrolls
         WHERE year = $1
           AND LOWER(COALESCE(status, '')) <> 'cancelled'`,
        [year]
      ),
      pool.query(
        `SELECT employee_id,
                EXTRACT(MONTH FROM leave_date)::int AS month,
                SUM(amount_paid) AS amount
         FROM greentarget.leave_records
         WHERE EXTRACT(YEAR FROM leave_date) = $1 AND status = 'approved'
         GROUP BY employee_id, EXTRACT(MONTH FROM leave_date)`,
        [year]
      ),
      // Monthly pinjam for the Pinjam/Bank tabs. mid_month pinjam is excluded:
      // it is settled against the mid-month advance, not the month-end pay.
      pool.query(
        `SELECT employee_id, month,
                CAST(amount AS NUMERIC(10,2)) AS amount,
                COALESCE(NULLIF(btrim(description), ''), 'Pinjam') AS description
         FROM greentarget.pinjam_records
         WHERE year = $1 AND pinjam_type = 'monthly'
         ORDER BY amount DESC`,
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
    const leaveByEmpMonth = {};
    leave.rows.forEach((l) => {
      leaveByEmpMonth[`${l.employee_id}_${l.month}`] = Number(l.amount);
    });

    const pinjamByEmpMonth = {};
    pinjam.rows.forEach((p) => {
      const key = `${p.employee_id}_${p.month}`;
      if (!pinjamByEmpMonth[key]) {
        pinjamByEmpMonth[key] = { total: 0, details: [] };
      }
      pinjamByEmpMonth[key].total = round2(
        pinjamByEmpMonth[key].total + (Number(p.amount) || 0)
      );
      pinjamByEmpMonth[key].details.push({
        description: p.description,
        amount: Number(p.amount) || 0,
      });
    });

    return eps.rows.map((ep) => {
      const month = monthByMp[ep.monthly_payroll_id];
      const epItems = itemsByEp[ep.id] || [];
      const advanceTotal = advanceTotalOf(epItems);
      const row = buildRow(
        ep,
        epItems,
        dedsByEp[ep.id] || [],
        midByEmpMonth[`${ep.employee_id}_${month}`] || 0,
        leaveByEmpMonth[`${ep.employee_id}_${month}`] || 0,
        advanceTotal
      );
      const pinjamEntry = pinjamByEmpMonth[`${ep.employee_id}_${month}`];
      // Bank/Pinjam show the remaining gaji/genap after advances already paid.
      // It reconciles with the Salary tab: gaji_genap + advances = setelah_digenapkan.
      const gajiGenap = round2(row.setelah_digenapkan - advanceTotal);
      const totalPinjam = pinjamEntry ? pinjamEntry.total : 0;
      return {
        month,
        job_type: ep.job_type || "OTHER",
        location_code: firstLocationCode(ep.location),
        employee_id: ep.employee_id,
        employee_name: ep.employee_name || ep.employee_id,
        ep_id: ep.id,
        row,
        ic_no: ep.ic_no || null,
        bank_account_number: ep.bank_account_number || null,
        payment_preference: ep.payment_preference || null,
        gaji_genap: gajiGenap,
        total_pinjam: totalPinjam,
        pinjam_details: pinjamEntry ? pinjamEntry.details : [],
        final_total: round2(gajiGenap - totalPinjam),
      };
    });
  };

  // Location id -> name map from the shared TH location catalogue.
  const loadLocationMap = async () => {
    const r = await pool.query("SELECT id, name FROM public.locations");
    const map = {};
    r.rows.forEach((l) => {
      map[l.id] = l.name;
    });
    return map;
  };

  /**
   * GET /greentarget/api/salary-report?year&month
   * Comprehensive monthly report grouped by location.
   */
  router.get("/", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month) {
      return res.status(400).json({ message: "year and month are required" });
    }
    try {
      const [all, locationMap] = await Promise.all([
        loadYearRows(year),
        loadLocationMap(),
      ]);
      const rows = all.filter((r) => r.month === month);

      const groups = {};
      const grand = emptyTotals();
      for (const r of rows) {
        if (!groups[r.location_code]) {
          groups[r.location_code] = {
            location: r.location_code,
            employees: [],
            totals: emptyTotals(),
          };
        }
        groups[r.location_code].employees.push({
          employee_payroll_id: r.ep_id,
          staff_id: r.employee_id,
          staff_name: r.employee_name,
          ...r.row,
        });
        addInto(groups[r.location_code].totals, r.row);
        addInto(grand, r.row);
      }
      const locations = Object.values(groups).sort(
        (a, b) => locationRank(a.location) - locationRank(b.location)
      );

      // Employee / Bank / Pinjam tabs list each person once, sorted by name.
      // GT payroll rows are already one per employee per month.
      const byName = [...rows].sort((a, b) =>
        (a.employee_name || "").localeCompare(b.employee_name || "")
      );

      const pinjamData = byName.map((r, index) => ({
        no: index + 1,
        staff_id: r.employee_id,
        staff_name: r.employee_name,
        payment_preference: r.payment_preference,
        gaji_genap: r.gaji_genap,
        total_pinjam: r.total_pinjam,
        pinjam_details: r.pinjam_details,
        final_total: r.final_total,
        net_pay: r.row.gaji_bersih,
        mid_month_amount: r.row.setengah_bulan,
      }));

      res.json({
        year,
        month,
        locations,
        grand_totals: grand,
        location_map: locationMap,
        // Pinjam tab
        data: pinjamData,
        total_records: pinjamData.length,
        summary: {
          total_gaji_genap: round2(
            pinjamData.reduce((sum, r) => sum + r.gaji_genap, 0)
          ),
          total_pinjam: round2(
            pinjamData.reduce((sum, r) => sum + r.total_pinjam, 0)
          ),
          total_final: round2(
            pinjamData.reduce((sum, r) => sum + r.final_total, 0)
          ),
        },
        // Employee tab
        employees: byName.map((r, index) => ({
          no: index + 1,
          employee_payroll_id: r.ep_id,
          staff_id: r.employee_id,
          staff_name: r.employee_name,
          ...r.row,
        })),
        employees_grand_totals: grand,
        // Bank tab — only people with money to pay out this month.
        bank_data: byName
          .filter((r) => r.final_total > 0)
          .map((r, index) => ({
            no: index + 1,
            staff_name: r.employee_name,
            icNo: r.ic_no || "N/A",
            bankAccountNumber: r.bank_account_number || "N/A",
            total: r.final_total,
            payment_preference: r.payment_preference,
          })),
      });
    } catch (error) {
      console.error("Error building GT salary report:", error);
      res.status(500).json({
        message: "Error building salary report",
        error: error.message,
      });
    }
  });

  /**
   * GET /greentarget/api/salary-report/yearly?year
   * Same shape as the monthly report, but every processed month of the year
   * aggregated into one row per employee. Per-month rounding is summed rather
   * than recomputed, so the yearly figures reconcile with the monthly payrolls
   * (same convention as /annual). Bank and Pinjam stay monthly-only.
   */
  router.get("/yearly", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    if (!year) return res.status(400).json({ message: "year is required" });
    try {
      const [rows, locationMap] = await Promise.all([
        loadYearRows(year),
        loadLocationMap(),
      ]);

      const newEmployee = (r) => ({
        employee_payroll_id: null,
        staff_id: r.employee_id,
        staff_name: r.employee_name,
        ...emptyTotals(),
      });

      const groups = {};
      const byEmployee = new Map();
      const grand = emptyTotals();
      for (const r of rows) {
        if (!groups[r.location_code]) {
          groups[r.location_code] = {
            location: r.location_code,
            employees: new Map(),
            totals: emptyTotals(),
          };
        }
        const group = groups[r.location_code];
        if (!group.employees.has(r.employee_id)) {
          group.employees.set(r.employee_id, newEmployee(r));
        }
        addInto(group.employees.get(r.employee_id), r.row);
        addInto(group.totals, r.row);

        if (!byEmployee.has(r.employee_id)) {
          byEmployee.set(r.employee_id, newEmployee(r));
        }
        addInto(byEmployee.get(r.employee_id), r.row);
        addInto(grand, r.row);
      }

      const locations = Object.values(groups)
        .sort((a, b) => locationRank(a.location) - locationRank(b.location))
        .map((g) => ({
          location: g.location,
          employees: Array.from(g.employees.values()),
          totals: g.totals,
        }));

      const employees = Array.from(byEmployee.values())
        .sort((a, b) => (a.staff_name || "").localeCompare(b.staff_name || ""))
        .map((e, index) => ({ no: index + 1, ...e }));

      res.json({
        year,
        month: null,
        locations,
        grand_totals: grand,
        location_map: locationMap,
        employees,
        employees_grand_totals: grand,
        total_records: employees.length,
      });
    } catch (error) {
      console.error("Error building GT yearly salary report:", error);
      res.status(500).json({
        message: "Error building yearly salary report",
        error: error.message,
      });
    }
  });

  /**
   * GET /greentarget/api/salary-report/annual?year
   * Annual summary: per-month totals + per-location totals + grand totals.
   */
  router.get("/annual", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    if (!year) return res.status(400).json({ message: "year is required" });
    try {
      const [rows, locationMap] = await Promise.all([
        loadYearRows(year),
        loadLocationMap(),
      ]);
      const monthlyMap = {};
      const locMap = {};
      const grand = emptyTotals();
      for (const r of rows) {
        if (!monthlyMap[r.month]) monthlyMap[r.month] = emptyTotals();
        addInto(monthlyMap[r.month], r.row);
        if (!locMap[r.location_code]) locMap[r.location_code] = emptyTotals();
        addInto(locMap[r.location_code], r.row);
        addInto(grand, r.row);
      }
      const monthly = Object.keys(monthlyMap)
        .map((m) => ({ month: Number(m), totals: monthlyMap[m] }))
        .sort((a, b) => a.month - b.month);
      const locations = Object.keys(locMap)
        .map((l) => ({ location: l, totals: locMap[l] }))
        .sort((a, b) => locationRank(a.location) - locationRank(b.location));
      res.json({
        year,
        monthly,
        locations,
        grand_totals: grand,
        location_map: locationMap,
      });
    } catch (error) {
      console.error("Error building GT annual salary report:", error);
      res.status(500).json({
        message: "Error building annual salary report",
        error: error.message,
      });
    }
  });

  /**
   * GET /greentarget/api/salary-report/annual-breakdown?year
   * Per location, each employee expanded into one row per processed month.
   */
  router.get("/annual-breakdown", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    if (!year) return res.status(400).json({ message: "year is required" });
    try {
      const rows = await loadYearRows(year);
      const locMap = {};
      const grand = emptyTotals();
      for (const r of rows) {
        if (!locMap[r.location_code]) {
          locMap[r.location_code] = {
            location: r.location_code,
            employees: new Map(),
            totals: emptyTotals(),
          };
        }
        const loc = locMap[r.location_code];
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
        .sort((a, b) => locationRank(a.location) - locationRank(b.location))
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
      console.error("Error building GT annual breakdown:", error);
      res.status(500).json({
        message: "Error building annual breakdown",
        error: error.message,
      });
    }
  });

  return router;
}
