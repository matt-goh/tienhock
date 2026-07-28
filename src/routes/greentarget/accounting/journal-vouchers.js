// src/routes/greentarget/accounting/journal-vouchers.js
//
// Green Target salary Voucher Generator. Posts the two monthly payroll
// journals into the GT ledger, reproducing the legacy voucher shapes proven
// from the imported Jan-Jun 2026 ledger:
//   - JWDR (Director Remuneration): directors GOH (GTH) + WONG (WSF).
//   - JBSL (Staff Salary Wages): everyone else, grouped Office / Lori Habuk.
// Lori Habuk (DRIVER) wages split between the BW_* (Bongawan) and SS_*
// account families per the configurable greentarget.salary_voucher_branches
// mapping; Office staff always use the BW Office family.
//
// Mirror of Tien Hock's src/routes/accounting/journal-vouchers.js, cloned
// (never shared) per the GT schema-isolation principle. Preview and generate
// call the SAME line builders, so what the page shows is exactly what posts.
import { Router } from "express";
import {
  ensureGTAccountsExist,
  insertGTJournal,
} from "./posting-utils.js";
import {
  assertGreenTargetAccountingDateUnlocked,
  isAccountingPeriodLockedError,
} from "./posting-lock.js";

// Directors (hardcoded — every legacy JWDR covers exactly these two).
const DIRECTORS = [
  { id: "GOH", code: "GTH" },
  { id: "WONG", code: "WSF" },
];
const DIRECTOR_IDS = DIRECTORS.map((d) => d.id);

// Account families (fixed legacy chart; validated at generate time).
const JWDR_ACCOUNTS = {
  salary: "BWDRS",
  epf_employer: "BWDRE",
  socso_employer: "BWDRSC",
  sip_employer: "BWDRSIP",
  accrual_salary: "BW_ADS",
  accrual_epf: "BW_ADE",
  accrual_socso: "BW_ADSC",
  accrual_sip: "BW_ADSIP",
  accrual_pcb: "BW_ADPCB",
};
const JBSL_GROUPS = {
  OFFICE: {
    salary: "BWS_O",
    epf_employer: "BWE_O",
    socso_employer: "BWSC_O",
    sip_employer: "BWSIP_O",
    particulars: {
      salary: "OFFICE",
      rounding: "OFFICE ROUNDING ADJ.",
      epf: "OFFICE EPF CONTRIBUTION",
      socso: "OFFICE SOCSO",
      sip: "OFFICE (SIP)",
    },
  },
  LH_BW: {
    salary: "BWS_LH",
    epf_employer: "BWE_LH",
    socso_employer: "BWSC_LH",
    sip_employer: "BWSIPC_LH",
    particulars: {
      salary: "PENGANGKUTAN (LORI HABUK)",
      rounding: "PENGANGKUTAN (HABUK) ROUNDING ADJ.",
      epf: "PENGANGKUTAN (HABUK) EPF",
      socso: "PENGANGKUTAN (HABUK) SOCSO",
      sip: "PENGANGKUTAN (LORI HABUK)",
    },
  },
  LH_SS: {
    salary: "SS_LH",
    epf_employer: "SE_LH",
    socso_employer: "SSC_LH",
    sip_employer: "SSIP_LH",
    particulars: {
      salary: "PENGANGKUTAN (SALARY)",
      rounding: "PENGANGKUTAN (RDN)",
      epf: "PENGANGKUTAN (EPF)",
      socso: "PENGANGKUTAN (SOCSO)",
      sip: "PENGANGKUTAN (SIP)",
    },
  },
};
const JBSL_ACCRUALS = {
  salary: "BW_AS",
  epf: "BW_AE",
  socso: "BW_ASC",
  sip: "BW_ASIP",
  pcb: "BW_APCB",
};

const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

const round2 = (n) => Math.round(n * 100) / 100;

export default function (pool) {
  const router = Router();

  const handleAccountingPeriodLock = (error, res) => {
    if (isAccountingPeriodLockedError(error)) {
      res.status(409).json({ code: error.code, message: error.message });
      return true;
    }
    return false;
  };

  // ==================== SHARED DATA + LINE BUILDERS ====================

  // Per-employee payroll row for the month: gross/net/rounding from
  // greentarget.employee_payrolls, statutory EE+ER sums from
  // greentarget.payroll_deductions (GT currently has epf/socso/sip only;
  // income_tax is read for future PCB).
  const fetchPayrollRows = async (db, year, month) => {
    const result = await db.query(
      `SELECT ep.employee_id,
              ep.job_type,
              ep.gross_pay,
              ep.net_pay,
              ep.digenapkan,
              COALESCE(SUM(CASE WHEN pd.deduction_type = 'epf' THEN pd.employer_amount END), 0) AS epf_employer,
              COALESCE(SUM(CASE WHEN pd.deduction_type = 'epf' THEN pd.employee_amount END), 0) AS epf_employee,
              COALESCE(SUM(CASE WHEN pd.deduction_type = 'socso' THEN pd.employer_amount END), 0) AS socso_employer,
              COALESCE(SUM(CASE WHEN pd.deduction_type = 'socso' THEN pd.employee_amount END), 0) AS socso_employee,
              COALESCE(SUM(CASE WHEN pd.deduction_type = 'sip' THEN pd.employer_amount END), 0) AS sip_employer,
              COALESCE(SUM(CASE WHEN pd.deduction_type = 'sip' THEN pd.employee_amount END), 0) AS sip_employee,
              COALESCE(SUM(CASE WHEN pd.deduction_type = 'income_tax' THEN pd.employee_amount END), 0) AS pcb
         FROM greentarget.employee_payrolls ep
         JOIN greentarget.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
         LEFT JOIN greentarget.payroll_deductions pd ON pd.employee_payroll_id = ep.id
        WHERE mp.year = $1 AND mp.month = $2
        GROUP BY ep.id
        ORDER BY ep.employee_id`,
      [year, month]
    );
    return result.rows;
  };

  const fetchBranchMap = async (db) => {
    const result = await db.query(
      "SELECT employee_id, branch FROM greentarget.salary_voucher_branches"
    );
    const map = {};
    result.rows.forEach((row) => {
      map[row.employee_id] = row.branch;
    });
    return map;
  };

  const num = (v) => parseFloat(v) || 0;

  // JWDR: director remuneration. DR gross + employer statutory; CR per-director
  // rounded net + ER&EE statutory accruals. Optional SIP/PCB lines only when > 0.
  const buildJwdrLines = (directorRows, monthLabel) => {
    const t = {
      gross: 0, rounding: 0,
      epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, sipEr: 0, sipEe: 0, pcb: 0,
    };
    const netCredits = [];
    for (const d of DIRECTORS) {
      const row = directorRows.find((r) => r.employee_id === d.id);
      if (!row) continue;
      const net = num(row.net_pay);
      const rounded = round2(net + num(row.digenapkan));
      t.gross += num(row.gross_pay);
      t.rounding += num(row.digenapkan);
      t.epfEr += num(row.epf_employer);
      t.epfEe += num(row.epf_employee);
      t.socsoEr += num(row.socso_employer);
      t.socsoEe += num(row.socso_employee);
      t.sipEr += num(row.sip_employer);
      t.sipEe += num(row.sip_employee);
      t.pcb += num(row.pcb);
      if (rounded > 0) {
        netCredits.push({
          account_code: JWDR_ACCOUNTS.accrual_salary,
          particulars: `AMOUNT DUE TO DIRECTOR (${d.code}), ,${monthLabel}`,
          debit: 0,
          credit: rounded,
        });
      }
    }
    t.rounding = round2(t.rounding);

    const debits = [
      { account_code: JWDR_ACCOUNTS.salary, particulars: `DIRECTORS REMUNERATION, ,${monthLabel}`, amount: round2(t.gross) },
      { account_code: JWDR_ACCOUNTS.salary, particulars: `ROUNDING ADJUSTMENT, ,${monthLabel}`, amount: t.rounding },
      { account_code: JWDR_ACCOUNTS.epf_employer, particulars: `EPF CONTRIBUTION-DIRECTOR'S, ,${monthLabel}`, amount: round2(t.epfEr) },
      { account_code: JWDR_ACCOUNTS.socso_employer, particulars: `SOCSO CONTRIBUTION-DIRECTOR'S, ,${monthLabel}`, amount: round2(t.socsoEr) },
      { account_code: JWDR_ACCOUNTS.sip_employer, particulars: `SIP CONTRIBUTION-DIRECTOR'S, ,${monthLabel}`, amount: round2(t.sipEr) },
    ].filter((l) => l.amount > 0);

    const credits = [
      ...netCredits,
      { account_code: JWDR_ACCOUNTS.accrual_epf, particulars: `ACCRUAL (EPF), ,${monthLabel}`, amount: round2(t.epfEr + t.epfEe) },
      { account_code: JWDR_ACCOUNTS.accrual_socso, particulars: `ACCRUAL (SOCSO), ,${monthLabel}`, amount: round2(t.socsoEr + t.socsoEe) },
      { account_code: JWDR_ACCOUNTS.accrual_sip, particulars: `ACCRUAL (SIP), ,${monthLabel}`, amount: round2(t.sipEr + t.sipEe) },
      { account_code: JWDR_ACCOUNTS.accrual_pcb, particulars: `ACCRUAL (PCB), ,${monthLabel}`, amount: round2(t.pcb) },
    ].filter((l) => l.credit !== undefined || l.amount > 0);

    const lines = [
      ...debits.map((l) => ({ account_code: l.account_code, particulars: l.particulars, debit: l.amount, credit: 0 })),
      ...credits.map((l) =>
        l.credit !== undefined
          ? l
          : { account_code: l.account_code, particulars: l.particulars, debit: 0, credit: l.amount }
      ),
    ];
    return {
      lines,
      totalDebit: round2(lines.reduce((s, l) => s + l.debit, 0)),
      totalCredit: round2(lines.reduce((s, l) => s + l.credit, 0)),
    };
  };

  // JBSL: staff salary wages. Per group (Office / Lori Habuk BW / Lori Habuk
  // SS) DR gross + rounding + employer statutory; CR the five BW_A* accruals.
  // Returns unmapped_drivers: DRIVER employees with no branch row (blocks
  // generation).
  const buildJbslLines = (staffRows, branchByEmployee, monthLabel) => {
    const groups = { OFFICE: [], LH_BW: [], LH_SS: [] };
    const unmappedDrivers = [];
    for (const row of staffRows) {
      if (row.job_type === "DRIVER") {
        const branch = branchByEmployee[row.employee_id];
        if (branch === "SS") groups.LH_SS.push(row);
        else if (branch === "BW") groups.LH_BW.push(row);
        else unmappedDrivers.push(row.employee_id);
      } else {
        groups.OFFICE.push(row);
      }
    }

    const debits = [];
    const t = { net: 0, epf: 0, socso: 0, sip: 0, pcb: 0 };
    for (const key of ["OFFICE", "LH_BW", "LH_SS"]) {
      const rows = groups[key];
      if (rows.length === 0) continue;
      const fam = JBSL_GROUPS[key];
      let gross = 0, rounding = 0, epfEr = 0, socsoEr = 0, sipEr = 0;
      for (const row of rows) {
        gross += num(row.gross_pay);
        rounding += num(row.digenapkan);
        epfEr += num(row.epf_employer);
        socsoEr += num(row.socso_employer);
        sipEr += num(row.sip_employer);
        t.net += round2(num(row.net_pay) + num(row.digenapkan));
        t.epf += num(row.epf_employer) + num(row.epf_employee);
        t.socso += num(row.socso_employer) + num(row.socso_employee);
        t.sip += num(row.sip_employer) + num(row.sip_employee);
        t.pcb += num(row.pcb);
      }
      const candidates = [
        { account_code: fam.salary, particulars: `${fam.particulars.salary}, ,${monthLabel}`, amount: round2(gross) },
        { account_code: fam.salary, particulars: `${fam.particulars.rounding}, ,${monthLabel}`, amount: round2(rounding) },
        { account_code: fam.epf_employer, particulars: `${fam.particulars.epf}, ,${monthLabel}`, amount: round2(epfEr) },
        { account_code: fam.socso_employer, particulars: `${fam.particulars.socso}, ,${monthLabel}`, amount: round2(socsoEr) },
        { account_code: fam.sip_employer, particulars: `${fam.particulars.sip}, ,${monthLabel}`, amount: round2(sipEr) },
      ];
      debits.push(...candidates.filter((l) => l.amount > 0));
    }

    const credits = [
      { account_code: JBSL_ACCRUALS.salary, particulars: `SALARY PAYABLES ACCRUALS, ,${monthLabel}`, amount: round2(t.net) },
      { account_code: JBSL_ACCRUALS.epf, particulars: `EPF ACCRUALS, ,${monthLabel}`, amount: round2(t.epf) },
      { account_code: JBSL_ACCRUALS.socso, particulars: `SOCSO ACCRUALS, ,${monthLabel}`, amount: round2(t.socso) },
      { account_code: JBSL_ACCRUALS.sip, particulars: `SIP ACCRUALS, ,${monthLabel}`, amount: round2(t.sip) },
      { account_code: JBSL_ACCRUALS.pcb, particulars: `PCB PAYABLES ACCRUALS, ,${monthLabel}`, amount: round2(t.pcb) },
    ].filter((l) => l.amount > 0);

    const lines = [
      ...debits.map((l) => ({ account_code: l.account_code, particulars: l.particulars, debit: l.amount, credit: 0 })),
      ...credits.map((l) => ({ account_code: l.account_code, particulars: l.particulars, debit: 0, credit: l.amount })),
    ];
    return {
      lines,
      totalDebit: round2(lines.reduce((s, l) => s + l.debit, 0)),
      totalCredit: round2(lines.reduce((s, l) => s + l.credit, 0)),
      unmappedDrivers,
    };
  };

  const voucherRefs = (year, month) => {
    const monthStr = String(month).padStart(2, "0");
    const yearStr = String(year).slice(-2);
    return {
      JWDR: `JWDR/${monthStr}/${yearStr}`,
      JBSL: `JBSL/${monthStr}/${yearStr}`,
    };
  };

  // Month-end entry date (legacy GT convention), built by string formatting
  // to avoid timezone issues.
  const monthEndDate = (year, month) => {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  };

  const findExisting = async (db, refs) => {
    const result = await db.query(
      `SELECT id, reference_no, status FROM greentarget.journal_entries
        WHERE reference_no = ANY($1)`,
      [refs]
    );
    const map = {};
    result.rows.forEach((row) => {
      map[row.reference_no] = row;
    });
    return map;
  };

  // ==================== ENDPOINTS ====================

  // GET /preview/:year/:month - exact lines both vouchers would post.
  router.get("/preview/:year/:month", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }
      const monthLabel = `${MONTH_ABBR[month - 1]}-${year}`;
      const refs = voucherRefs(year, month);

      const [payrollRows, branchByEmployee, existing] = await Promise.all([
        fetchPayrollRows(pool, year, month),
        fetchBranchMap(pool),
        findExisting(pool, [refs.JWDR, refs.JBSL]),
      ]);

      const directorRows = payrollRows.filter((r) =>
        DIRECTOR_IDS.includes(r.employee_id)
      );
      const staffRows = payrollRows.filter(
        (r) => !DIRECTOR_IDS.includes(r.employee_id)
      );

      let jwdr = null;
      if (directorRows.length > 0) {
        const built = buildJwdrLines(directorRows, monthLabel);
        jwdr = {
          reference_no: refs.JWDR,
          entry_date: monthEndDate(year, month),
          ...built,
        };
      }
      let jbsl = null;
      let unmappedDrivers = [];
      if (staffRows.length > 0) {
        const built = buildJbslLines(staffRows, branchByEmployee, monthLabel);
        unmappedDrivers = built.unmappedDrivers;
        jbsl = {
          reference_no: refs.JBSL,
          entry_date: monthEndDate(year, month),
          lines: built.lines,
          totalDebit: built.totalDebit,
          totalCredit: built.totalCredit,
        };
      }

      res.json({
        jwdr,
        jbsl,
        unmapped_drivers: unmappedDrivers,
        existing: {
          jwdr: existing[refs.JWDR] || null,
          jbsl: existing[refs.JBSL] || null,
        },
      });
    } catch (error) {
      console.error("Error previewing GT vouchers:", error);
      res.status(500).json({
        message: "Error previewing vouchers",
        error: error.message,
      });
    }
  });

  // POST /generate - post the vouchers in one transaction.
  router.post("/generate", async (req, res) => {
    const client = await pool.connect();
    try {
      const { year, month, voucher_types } = req.body;
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);
      if (!yearInt || !monthInt || monthInt < 1 || monthInt > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }
      const types = Array.isArray(voucher_types) ? voucher_types : [];
      if (types.length === 0 || types.some((t) => !["JBSL", "JWDR"].includes(t))) {
        return res
          .status(400)
          .json({ message: "voucher_types must contain JBSL and/or JWDR" });
      }

      const monthLabel = `${MONTH_ABBR[monthInt - 1]}-${yearInt}`;
      const refs = voucherRefs(yearInt, monthInt);
      const entryDate = monthEndDate(yearInt, monthInt);
      // R8 posting lock: vouchers are month-end dated, so every month from
      // July 2026 onward passes; anything earlier returns 409.
      assertGreenTargetAccountingDateUnlocked(
        entryDate,
        "Salary voucher generation"
      );

      await client.query("BEGIN");

      const payrollRows = await fetchPayrollRows(client, yearInt, monthInt);
      const branchByEmployee = await fetchBranchMap(client);
      const existing = await findExisting(client, [refs.JWDR, refs.JBSL]);

      const results = {};

      if (types.includes("JWDR")) {
        if (existing[refs.JWDR]) {
          results.jwdr = {
            skipped: true,
            message: "JWDR already exists for this month",
            id: existing[refs.JWDR].id,
          };
        } else {
          const directorRows = payrollRows.filter((r) =>
            DIRECTOR_IDS.includes(r.employee_id)
          );
          if (directorRows.length === 0) {
            results.jwdr = {
              skipped: true,
              message: "No director salary data for this month",
            };
          } else {
            const built = buildJwdrLines(directorRows, monthLabel);
            if (Math.abs(built.totalDebit - built.totalCredit) > 0.01) {
              await client.query("ROLLBACK");
              return res.status(400).json({
                message: `JWDR voucher is out of balance (DR ${built.totalDebit.toFixed(
                  2
                )} vs CR ${built.totalCredit.toFixed(2)}).`,
              });
            }
            await ensureGTAccountsExist(
              client,
              built.lines.map((l) => l.account_code)
            );
            const id = await insertGTJournal(client, {
              referenceNo: refs.JWDR,
              entryType: "JWDR",
              entryDate,
              description: `Director's Remuneration - ${String(monthInt).padStart(2, "0")}/${yearInt}`,
              displayReference: refs.JWDR,
              createdBy: req.staffId || null,
              lines: built.lines.map((l) => ({
                accountCode: l.account_code,
                debit: l.debit,
                credit: l.credit,
                particulars: l.particulars,
              })),
            });
            results.jwdr = { created: true, id, reference: refs.JWDR };
          }
        }
      }

      if (types.includes("JBSL")) {
        if (existing[refs.JBSL]) {
          results.jbsl = {
            skipped: true,
            message: "JBSL already exists for this month",
            id: existing[refs.JBSL].id,
          };
        } else {
          const staffRows = payrollRows.filter(
            (r) => !DIRECTOR_IDS.includes(r.employee_id)
          );
          if (staffRows.length === 0) {
            results.jbsl = {
              skipped: true,
              message: "No staff salary data for this month",
            };
          } else {
            const built = buildJbslLines(staffRows, branchByEmployee, monthLabel);
            if (built.unmappedDrivers.length > 0) {
              await client.query("ROLLBACK");
              return res.status(400).json({
                message: `No Lori Habuk branch (BW/SS) mapped for driver(s): ${built.unmappedDrivers.join(
                  ", "
                )}. Set the branch in Driver Branch Mapping, then generate again.`,
              });
            }
            if (Math.abs(built.totalDebit - built.totalCredit) > 0.01) {
              await client.query("ROLLBACK");
              return res.status(400).json({
                message: `JBSL voucher is out of balance (DR ${built.totalDebit.toFixed(
                  2
                )} vs CR ${built.totalCredit.toFixed(2)}).`,
              });
            }
            await ensureGTAccountsExist(
              client,
              built.lines.map((l) => l.account_code)
            );
            const id = await insertGTJournal(client, {
              referenceNo: refs.JBSL,
              entryType: "JBSL",
              entryDate,
              description: `Staff Salary Wages - ${String(monthInt).padStart(2, "0")}/${yearInt}`,
              displayReference: refs.JBSL,
              createdBy: req.staffId || null,
              lines: built.lines.map((l) => ({
                accountCode: l.account_code,
                debit: l.debit,
                credit: l.credit,
                particulars: l.particulars,
              })),
            });
            results.jbsl = { created: true, id, reference: refs.JBSL };
          }
        }
      }

      await client.query("COMMIT");
      res.json({ message: "Voucher generation completed", results });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error generating GT vouchers:", error);
      res.status(500).json({
        message: "Error generating vouchers",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // GET /check/:year/:month - existence check only.
  router.get("/check/:year/:month", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const refs = voucherRefs(year, month);
      const existing = await findExisting(pool, [refs.JWDR, refs.JBSL]);
      res.json({
        jwdr: existing[refs.JWDR] || null,
        jbsl: existing[refs.JBSL] || null,
      });
    } catch (error) {
      console.error("Error checking GT vouchers:", error);
      res.status(500).json({
        message: "Error checking vouchers",
        error: error.message,
      });
    }
  });

  // GET /branch-mappings - active GT DRIVER employees with their branch.
  router.get("/branch-mappings", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT pe.employee_id, s.name, b.branch
           FROM greentarget.payroll_employees pe
           JOIN public.staffs s ON s.id = pe.employee_id
           LEFT JOIN greentarget.salary_voucher_branches b ON b.employee_id = pe.employee_id
          WHERE pe.is_active = true AND pe.job_type = 'DRIVER'
          ORDER BY pe.employee_id`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching GT branch mappings:", error);
      res.status(500).json({
        message: "Error fetching branch mappings",
        error: error.message,
      });
    }
  });

  // PUT /branch-mappings/:employeeId - upsert a driver's BW/SS branch.
  router.put("/branch-mappings/:employeeId", async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { branch } = req.body;
      if (!["BW", "SS"].includes(branch)) {
        return res.status(400).json({ message: "branch must be BW or SS" });
      }
      const result = await pool.query(
        `INSERT INTO greentarget.salary_voucher_branches (employee_id, branch, created_by, updated_by)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (employee_id)
         DO UPDATE SET branch = EXCLUDED.branch, updated_at = CURRENT_TIMESTAMP, updated_by = EXCLUDED.updated_by
         RETURNING employee_id, branch`,
        [employeeId, branch, req.staffId || null]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error saving GT branch mapping:", error);
      res.status(500).json({
        message: "Error saving branch mapping",
        error: error.message,
      });
    }
  });

  return router;
}
