// src/routes/accounting/payroll-payments.js
// Payroll Bank Payment (settlement) — turns a month's payroll into the bank-payment
// journals that the Voucher Generator's JVSL/JVDR don't post. Each category settles an
// accrual: DR accrual (ACW_*/ACD_*) / CR bank (BANK_PBB). Defaults come from payroll
// (take-home − pinjam, statutory totals, half-month) but every amount is editable so the
// posted figure matches the ACTUAL bank transfer (cash-paid workers, rounding, period mix).
import { Router } from "express";

export default function (pool) {
  const router = Router();

  const pad = (n) => String(n).padStart(2, "0");

  // Resolve the JVSL (location 00) accrual account for a mapping_type, with a hardcoded
  // fallback so the screen still works if a mapping row is missing.
  const FALLBACK_ACCRUAL = {
    accrual_salary: "ACW_SAL",
    accrual_epf: "ACW_EPF",
    accrual_socso: "ACW_SC",
    accrual_sip: "ACW_SIP",
    accrual_pcb: "ACW_PCB",
  };

  // GET /preview/:year/:month - default payment rows with payroll-sourced amounts
  router.get("/preview/:year/:month", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }

      // Accrual account map from location_account_mappings (JVSL/location 00)
      const mapResult = await pool.query(
        `SELECT mapping_type, account_code
           FROM location_account_mappings
          WHERE voucher_type = 'JVSL' AND location_id = '00'
            AND is_active = true AND mapping_type LIKE 'accrual%'`
      );
      const accrual = { ...FALLBACK_ACCRUAL };
      mapResult.rows.forEach((r) => {
        accrual[r.mapping_type] = r.account_code;
      });

      // Take-home (Σ setelah_digenapkan) and monthly pinjam — net salary = the difference,
      // matching the Bank/Pinjam tab's final_total at the grand-total level.
      const takeHomeResult = await pool.query(
        `SELECT COALESCE(SUM(ep.setelah_digenapkan), 0) AS take_home
           FROM employee_payrolls ep
           JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
          WHERE mp.year = $1 AND mp.month = $2`,
        [year, month]
      );
      const pinjamResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS pinjam
           FROM pinjam_records
          WHERE year = $1 AND month = $2 AND pinjam_type = 'monthly'`,
        [year, month]
      );
      const takeHome = parseFloat(takeHomeResult.rows[0].take_home) || 0;
      const pinjam = parseFloat(pinjamResult.rows[0].pinjam) || 0;
      const netSalary = Math.max(takeHome - pinjam, 0);

      // Statutory totals (employee + employer where applicable)
      const dedResult = await pool.query(
        `SELECT pd.deduction_type,
                COALESCE(SUM(pd.employee_amount), 0) AS emp,
                COALESCE(SUM(pd.employer_amount), 0) AS empr
           FROM payroll_deductions pd
           JOIN employee_payrolls ep ON ep.id = pd.employee_payroll_id
           JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
          GROUP BY pd.deduction_type`,
        [year, month]
      );
      const ded = {};
      dedResult.rows.forEach((r) => {
        ded[r.deduction_type] = {
          emp: parseFloat(r.emp) || 0,
          empr: parseFloat(r.empr) || 0,
        };
      });
      const epf = (ded.epf?.emp || 0) + (ded.epf?.empr || 0);
      const socso = (ded.socso?.emp || 0) + (ded.socso?.empr || 0);
      const sip = (ded.sip?.emp || 0) + (ded.sip?.empr || 0);
      const pcb = ded.income_tax?.emp || 0;

      const halfResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS half_month
           FROM mid_month_payrolls
          WHERE year = $1 AND month = $2`,
        [year, month]
      );
      const halfMonth = parseFloat(halfResult.rows[0].half_month) || 0;

      // Which categories already have a posted/draft payroll-payment journal this period
      const genResult = await pool.query(
        `SELECT description, status FROM journal_entries
          WHERE description LIKE $1 AND status <> 'cancelled'`,
        [`PRP:%:${year}-${pad(month)}`]
      );
      const generated = new Set(
        genResult.rows
          .map((r) => {
            const m = String(r.description).match(/^PRP:([a-z_]+):/);
            return m ? m[1] : null;
          })
          .filter(Boolean)
      );

      const mm = pad(month);
      const rows = [
        {
          category: "net_salary",
          label: "Net Salary (Staff/Workers/Director)",
          amount: netSalary,
          contra_account: accrual.accrual_salary,
          particulars: `PBB-MONTHLY SALARY STAFFS/WORKERS/DIRECTOR(${mm}/${year})`,
          basis: `Take-home ${takeHome.toFixed(2)} − pinjam ${pinjam.toFixed(2)}`,
        },
        {
          category: "epf",
          label: "EPF (KWSP)",
          amount: epf,
          contra_account: accrual.accrual_epf,
          particulars: `K.W.S.P-EPF(${mm}/${year})`,
          basis: `Employee ${(ded.epf?.emp || 0).toFixed(2)} + employer ${(ded.epf?.empr || 0).toFixed(2)}`,
        },
        {
          category: "socso",
          label: "SOCSO (PERKESO)",
          amount: socso,
          contra_account: accrual.accrual_socso,
          particulars: `PERKESO-SOCSO(${mm}/${year})`,
          basis: `Employee ${(ded.socso?.emp || 0).toFixed(2)} + employer ${(ded.socso?.empr || 0).toFixed(2)}`,
        },
        {
          category: "sip",
          label: "SIP (PERKESO)",
          amount: sip,
          contra_account: accrual.accrual_sip,
          particulars: `PERKESO-SIP(${mm}/${year})`,
          basis: `Employee ${(ded.sip?.emp || 0).toFixed(2)} + employer ${(ded.sip?.empr || 0).toFixed(2)}`,
        },
        {
          category: "pcb",
          label: "PCB (LHDN)",
          amount: pcb,
          contra_account: accrual.accrual_pcb,
          particulars: `LHDN-PCB(${mm}/${year})`,
          basis: `Income tax withheld ${pcb.toFixed(2)}`,
        },
        {
          category: "half_month",
          label: "Half-Month Salary",
          amount: halfMonth,
          contra_account: accrual.accrual_salary,
          particulars: `PBB-HALF MONTH SALARY STAFFS/WORKERS(${mm}/${year})`,
          basis: `Mid-month advances ${halfMonth.toFixed(2)}`,
        },
      ].map((r) => ({
        ...r,
        amount: Math.round(r.amount * 100) / 100,
        already_generated: generated.has(r.category),
      }));

      res.json({ year, month, bank_account: "BANK_PBB", rows });
    } catch (error) {
      console.error("Error building payroll payment preview:", error);
      res.status(500).json({
        message: "Error building payroll payment preview",
        error: error.message,
      });
    }
  });

  // POST /generate - create & post one bank-payment journal per included row
  // body: { year, month, lines: [{ category, amount, payment_date, bank_account,
  //         contra_account, reference, particulars }] }
  router.post("/generate", async (req, res) => {
    const { year, month, lines } = req.body;
    if (!year || !month || !Array.isArray(lines) || lines.length === 0) {
      return res
        .status(400)
        .json({ message: "year, month and at least one line are required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Next PBE sequence per payment month (incremented locally so a multi-line
      // generate doesn't collide on the unique reference_no).
      const counters = {};
      const nextReference = async (paymentDate) => {
        const mm = paymentDate.slice(5, 7); // yyyy-MM-dd -> MM
        if (counters[mm] === undefined) {
          const r = await client.query(
            `SELECT reference_no FROM journal_entries
              WHERE reference_no LIKE $1 ORDER BY reference_no DESC LIMIT 1`,
            [`PBE%/${mm}`]
          );
          let base = 0;
          if (r.rows.length > 0) {
            const m = r.rows[0].reference_no.match(/^PBE(\d+)\//);
            if (m) base = parseInt(m[1]);
          }
          counters[mm] = base;
        }
        counters[mm] += 1;
        return `PBE${String(counters[mm]).padStart(3, "0")}/${mm}`;
      };

      const created = [];
      for (const line of lines) {
        const amount = Math.round((parseFloat(line.amount) || 0) * 100) / 100;
        if (amount <= 0) continue; // skip zero/empty rows
        if (!line.payment_date || !line.contra_account || !line.bank_account) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message:
              "Each line needs payment_date, contra_account and bank_account",
          });
        }

        // Validate accounts exist
        for (const code of [line.contra_account, line.bank_account]) {
          const ac = await client.query(
            `SELECT 1 FROM account_codes WHERE code = $1`,
            [code]
          );
          if (ac.rows.length === 0) {
            await client.query("ROLLBACK");
            return res
              .status(400)
              .json({ message: `Account code '${code}' does not exist` });
          }
        }

        const referenceNo = await nextReference(line.payment_date);
        const marker = `PRP:${line.category}:${year}-${pad(month)}`;

        const entryResult = await client.query(
          `INSERT INTO journal_entries
             (reference_no, entry_type, entry_date, description,
              total_debit, total_credit, status, created_by, posted_at, posted_by)
           VALUES ($1, 'B', $2, $3, $4, $4, 'posted', $5, CURRENT_TIMESTAMP, $5)
           RETURNING id`,
          [referenceNo, line.payment_date, marker, amount, req.staffId || null]
        );
        const entryId = entryResult.rows[0].id;

        // DR accrual, CR bank
        await client.query(
          `INSERT INTO journal_entry_lines
             (journal_entry_id, line_number, account_code, debit_amount,
              credit_amount, reference, particulars)
           VALUES ($1, 1, $2, $3, 0, $4, $5), ($1, 2, $6, 0, $3, $4, $5)`,
          [
            entryId,
            line.contra_account,
            amount,
            line.reference || null,
            line.particulars || null,
            line.bank_account,
          ]
        );

        created.push({ id: entryId, reference_no: referenceNo, category: line.category });
      }

      if (created.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "No lines with a positive amount to post" });
      }

      await client.query("COMMIT");
      res.status(201).json({
        message: `Posted ${created.length} payroll payment journal(s)`,
        created,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error generating payroll payments:", error);
      res.status(500).json({
        message: "Error generating payroll payments",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
