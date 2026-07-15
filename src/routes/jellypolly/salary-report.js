// src/routes/jellypolly/salary-report.js
// Jelly Polly Salary Report. Groups employees by location (jellypolly.locations
// via jellypolly.job_location_mappings + employee direct locations), mirroring
// the Tien Hock report. The per-employee column buckets are computed in JS from
// the stored payroll (employee_payrolls + payroll_items + payroll_deductions +
// mid-month).
//
// Output shapes match what the shared TH PDF generator
// (src/utils/payroll/SalaryReportPDF.tsx) consumes, with `location` = location code.
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

// Sort location groups by their two-digit code (unknown/empty codes last).
const locationRank = (code) => {
  const n = parseInt(code, 10);
  return Number.isNaN(n) ? 999 : n;
};

// Location assigned to rows with no resolvable location (Office default).
const DEFAULT_LOCATION = "01";

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
// items) are already deducted from net_pay by jpPayrollProcessor. Summing them
// back out here reproduces the processor's commissionAdvanceCents.
const advanceTotalOf = (items) =>
  round2(
    items.reduce(
      (sum, item) =>
        item.work_log_type === "advance" ? sum + (Number(item.amount) || 0) : sum,
      0
    )
  );

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
  leaveDateSet = null,
  advanceTotal = 0
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
  // GAJI BERSIH / JUMLAH / S.DIGENAP show the TOTAL earned salary, adding back
  // advances already paid out, so the report reflects full salary rather than
  // cash-in-hand (same convention as TH). The Bank/Pinjam tabs subtract the
  // advance again via gaji_genap to get the actual take-home. Rounding is
  // derived (not read from the stored row) so it stays consistent with the
  // added-back jumlah; with no advances it equals what the processor stored.
  row.gaji_bersih = (Number(ep.net_pay) || 0) + advanceTotal;
  row.setengah_bulan = Number(midMonthAmount) || 0;
  const jumlah = row.gaji_bersih - row.setengah_bulan;
  row.jumlah = jumlah;
  row.setelah_digenapkan = Math.ceil(jumlah);
  row.digenapkan = row.setelah_digenapkan - jumlah;
  for (const k of TOTAL_KEYS) row[k] = round2(row[k]);
  return row;
};

export default function (pool) {
  const router = Router();

  // Fetch every processed employee payroll for a year as flat rows, each already
  // bucketed: { month, job_type, location_code, employee_id, employee_name, ep_id, row }.
  // Returns { rows, locationMap } — locationMap maps location code -> display name.
  const loadYearRows = async (year) => {
    // Location resolution data (locations, job mappings, exclusions, staff)
    const [locRes, jlmRes, exclRes, staffRes] = await Promise.all([
      pool.query("SELECT id, name FROM jellypolly.locations ORDER BY id"),
      pool.query(
        "SELECT job_id, location_code FROM jellypolly.job_location_mappings WHERE is_active = true"
      ),
      pool.query(
        "SELECT employee_id, job_id, location_code FROM jellypolly.employee_job_location_exclusions"
      ),
      pool.query(
        `SELECT id, head_staff_id, location, job,
                ic_no, bank_account_number, payment_preference
         FROM jellypolly.staffs`
      ),
    ]);

    const locationMap = {};
    locRes.rows.forEach((l) => {
      locationMap[l.id] = l.name;
    });
    const locByJob = {};
    jlmRes.rows.forEach((m) => {
      locByJob[m.job_id] = m.location_code;
    });
    const excluded = new Set();
    exclRes.rows.forEach((e) => {
      excluded.add(`${e.employee_id}|${e.job_id}|${e.location_code}`);
    });
    const staffById = {};
    staffRes.rows.forEach((s) => {
      staffById[s.id] = s;
    });

    const asArray = (v) => (Array.isArray(v) ? v : []);

    // Priority: HEAD/self direct location > first mapped (non-excluded) job > default.
    const resolveLocation = (employeeId) => {
      const s = staffById[employeeId];
      const head =
        s && s.head_staff_id ? staffById[s.head_staff_id] : null;

      const direct =
        asArray(head?.location)[0] || asArray(s?.location)[0] || null;
      if (direct) return direct;

      const jobList = asArray(head?.job).length
        ? asArray(head?.job)
        : asArray(s?.job);
      for (const jobId of jobList) {
        const loc = locByJob[jobId];
        if (loc && !excluded.has(`${employeeId}|${jobId}|${loc}`)) {
          return loc;
        }
      }
      return DEFAULT_LOCATION;
    };

    const mps = await pool.query(
      "SELECT id, month FROM jellypolly.monthly_payrolls WHERE year = $1",
      [year]
    );
    if (mps.rows.length === 0) return { rows: [], locationMap };
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
       LEFT JOIN jellypolly.staffs s ON ep.employee_id = s.id
       WHERE ep.monthly_payroll_id = ANY($1)`,
      [mpIds]
    );
    const epIds = eps.rows.map((e) => e.id);
    if (epIds.length === 0) return { rows: [], locationMap };

    const [items, deds, mid, leave, pinjam] = await Promise.all([
      pool.query(
        `SELECT pi.employee_payroll_id, pi.amount, pi.work_log_type,
                pi.source_employee_id,
                to_char(pi.source_date, 'YYYY-MM-DD') AS source_date,
                pc.pay_type, pc.report_column
         FROM jellypolly.payroll_items pi
         LEFT JOIN jellypolly.pay_codes pc ON pi.pay_code_id = pc.id
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
         FROM jellypolly.leave_records lr
         LEFT JOIN jellypolly.staffs s ON s.id = lr.employee_id
         WHERE EXTRACT(YEAR FROM lr.leave_date) = $1
           AND lr.status = 'approved'`,
        [year]
      ),
      // Monthly pinjam for the Pinjam/Bank tabs. Rolls up to the HEAD id (like
      // items/leave) so an amount recorded under any sub-ID lands on the one
      // payroll row that exists for the person. mid_month pinjam is excluded:
      // it is settled against the mid-month advance, not the month-end pay.
      pool.query(
        `SELECT COALESCE(NULLIF(s.head_staff_id, ''), pr.employee_id) AS canonical_id,
                pr.month,
                CAST(pr.amount AS NUMERIC(10,2)) AS amount,
                COALESCE(NULLIF(btrim(pr.description), ''), 'Pinjam') AS description
         FROM jellypolly.pinjam_records pr
         LEFT JOIN jellypolly.staffs s ON s.id = pr.employee_id
         WHERE pr.year = $1 AND pr.pinjam_type = 'monthly'
         ORDER BY pr.amount DESC`,
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

    const pinjamByEmpMonth = {};
    pinjam.rows.forEach((p) => {
      const key = `${p.canonical_id}_${p.month}`;
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

    const rows = eps.rows.map((ep) => {
      const month = monthByMp[ep.monthly_payroll_id];
      const epItems = itemsByEp[ep.id] || [];
      const advanceTotal = advanceTotalOf(epItems);
      const row = buildRow(
        ep,
        epItems,
        dedsByEp[ep.id] || [],
        midByEmpMonth[`${ep.employee_id}_${month}`] || 0,
        leaveTotalByEmpMonth[`${ep.employee_id}_${month}`] || 0,
        leaveDatesByEmpMonth[`${ep.employee_id}_${month}`] || null,
        advanceTotal
      );
      const staff = staffById[ep.employee_id] || {};
      const pinjamEntry = pinjamByEmpMonth[`${ep.employee_id}_${month}`];
      // Bank/Pinjam show the remaining gaji/genap after advances already paid.
      // It reconciles with the Salary tab: gaji_genap + advances = setelah_digenapkan.
      const gajiGenap = round2(row.setelah_digenapkan - advanceTotal);
      const totalPinjam = pinjamEntry ? pinjamEntry.total : 0;
      return {
        month,
        job_type: ep.job_type || "OTHER",
        location_code: resolveLocation(ep.employee_id),
        employee_id: ep.employee_id,
        employee_name: ep.employee_name || ep.employee_id,
        ep_id: ep.id,
        row,
        ic_no: staff.ic_no || null,
        bank_account_number: staff.bank_account_number || null,
        payment_preference: staff.payment_preference || null,
        gaji_genap: gajiGenap,
        total_pinjam: totalPinjam,
        pinjam_details: pinjamEntry ? pinjamEntry.details : [],
        final_total: round2(gajiGenap - totalPinjam),
      };
    });

    return { rows, locationMap };
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
      const { rows: all, locationMap } = await loadYearRows(year);
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
      // JP payroll rows are already one-per-canonical-employee, so no
      // dedup pass is needed (unlike TH's dual-location rows).
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
      const { rows, locationMap } = await loadYearRows(year);
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
      const { rows, locationMap } = await loadYearRows(year);
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
      res.json({ year, locations, grand_totals: grand, location_map: locationMap });
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
