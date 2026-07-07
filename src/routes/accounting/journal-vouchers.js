// src/routes/accounting/journal-vouchers.js
import { Router } from "express";
import { computeMonthlySalaryReport } from "../payroll/salary-report.js";

export default function (pool) {
  const router = Router();

  // ==================== SHARED VOUCHER LINE BUILDERS ====================
  // Single source of truth for the posted journal lines. BOTH the preview and the
  // generate endpoints call these, so what the Voucher Generator shows is exactly
  // what gets posted (1:1). Each returns ordered lines
  // [{ account_code, particulars, debit, credit }], the DR/CR totals, and any
  // components that have an amount but no account mapping (block generation).

  const round2 = (n) => Math.round(n * 100) / 100;

  // Type ordering within the JVSL debit block (all salary rows, then EPF, SOCSO, SIP).
  const JVSL_TYPE_PRIORITY = {
    salary: 1,
    epf_employer: 2,
    socso_employer: 3,
    sip_employer: 4,
  };

  // Per-employee net rounded UP to the whole ringgit (digenapkan), summed PER JOB
  // LOCATION (same location derivation as the salary rows). The rounding folds into
  // salary on BOTH sides — each location's Salary debit is grown by its rounding and
  // ACW_SAL credits the rounded net — so there is no separate rounding line/mapping.
  // Returns a map { location_id: rounding } (directors excluded).
  const computeJvslRoundingByLocation = async (db, year, month) => {
    const r = await db.query(
      `WITH jlm AS (
         SELECT job_id, location_code FROM job_location_mappings WHERE is_active = true
       ),
       per_emp AS (
         SELECT COALESCE(jlm.location_code, '02') AS loc,
                ep.gross_pay - COALESCE(SUM(pd.employee_amount), 0) AS net
           FROM employee_payrolls ep
           JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
           LEFT JOIN jlm ON ep.job_type = jlm.job_id
           LEFT JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id
          WHERE mp.year = $1 AND mp.month = $2
            AND ep.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
          GROUP BY ep.id, ep.gross_pay, COALESCE(jlm.location_code, '02')
       )
       SELECT loc, COALESCE(SUM(CEIL(net) - net), 0) AS rounding
         FROM per_emp WHERE net > 0
        GROUP BY loc`,
      [year, month]
    );
    const map = {};
    r.rows.forEach((row) => {
      map[row.loc] = round2(parseFloat(row.rounding) || 0);
    });
    return map;
  };

  // JVDR: director remuneration. directorRows carry gross/net/statutory per director.
  const buildJvdrLines = (directorRows, directorMappings) => {
    const nets = directorRows.map((d) => {
      const gross = parseFloat(d.gross_pay) || 0;
      const epfEmp = parseFloat(d.epf_employee) || 0;
      const socsoEmp = parseFloat(d.socso_employee) || 0;
      const sipEmp = parseFloat(d.sip_employee) || 0;
      const pcbAmt = parseFloat(d.pcb) || 0;
      const net = round2(gross - epfEmp - socsoEmp - sipEmp - pcbAmt);
      const rounded = net > 0 ? Math.ceil(net) : net;
      return { particulars: d.particulars, rounded, roundingDiff: rounded - net };
    });
    const t = { gross: 0, epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, sipEr: 0, sipEe: 0, pcb: 0 };
    directorRows.forEach((d) => {
      t.gross += parseFloat(d.gross_pay) || 0;
      t.epfEr += parseFloat(d.epf_employer) || 0;
      t.epfEe += parseFloat(d.epf_employee) || 0;
      t.socsoEr += parseFloat(d.socso_employer) || 0;
      t.socsoEe += parseFloat(d.socso_employee) || 0;
      t.sipEr += parseFloat(d.sip_employer) || 0;
      t.sipEe += parseFloat(d.sip_employee) || 0;
      t.pcb += parseFloat(d.pcb) || 0;
    });
    const rounding = round2(nets.reduce((s, n) => s + n.roundingDiff, 0));

    const unmapped = [];
    const debitCandidates = [
      { account: directorMappings.salary, amount: t.gross, desc: "Salary", type: "salary" },
      { account: directorMappings.salary, amount: rounding, desc: "Rounding Adjustment", type: "rounding" },
      { account: directorMappings.epf_employer, amount: t.epfEr, desc: "EPF Employer", type: "epf_employer" },
      { account: directorMappings.socso_employer, amount: t.socsoEr, desc: "SOCSO Employer", type: "socso_employer" },
      { account: directorMappings.sip_employer, amount: t.sipEr, desc: "SIP Employer", type: "sip_employer" },
    ];
    for (const l of debitCandidates) {
      if (l.amount > 0 && !l.account) unmapped.push(`${l.type} (director): ${l.amount.toFixed(2)}`);
    }
    const debits = debitCandidates.filter((l) => l.account && l.amount > 0);

    const credits = [];
    for (const n of nets) {
      if (directorMappings.accrual_salary && n.rounded > 0) {
        credits.push({ account: directorMappings.accrual_salary, amount: n.rounded, desc: n.particulars });
      }
    }
    const otherCredits = [
      { account: directorMappings.accrual_epf, amount: round2(t.epfEr + t.epfEe), desc: "EPF Payable" },
      { account: directorMappings.accrual_socso, amount: round2(t.socsoEr + t.socsoEe), desc: "SOCSO Payable" },
      { account: directorMappings.accrual_sip, amount: round2(t.sipEr + t.sipEe), desc: "SIP Payable" },
      { account: directorMappings.accrual_pcb, amount: round2(t.pcb), desc: "PCB Payable" },
    ].filter((l) => l.account && l.amount > 0);
    credits.push(...otherCredits);

    const lines = [
      ...debits.map((l) => ({ account_code: l.account, particulars: l.desc, debit: round2(l.amount), credit: 0 })),
      ...credits.map((l) => ({ account_code: l.account, particulars: l.desc, debit: 0, credit: round2(l.amount) })),
    ];
    return {
      lines,
      totalDebit: round2(debits.reduce((s, l) => s + l.amount, 0)),
      totalCredit: round2(credits.reduce((s, l) => s + l.amount, 0)),
      unmapped,
    };
  };

  // JVSL: staff salary wages. staffData = per-location salary rows (location 01/00
  // already excluded).
  //
  // Debit model (matches the legacy voucher): per location, ONE Salary row + the
  // three employer statutory rows (EPF/SOCSO/SIP). The Salary row carries the
  // location's FULL gross pay (salary + OT + commissions + cuti/leave + bonus +
  // product/packing pay + Others) PLUS the location's digenapkan rounding — the
  // rounding folds into salary on both sides (Salary debit grows by it; ACW_SAL
  // credits the rounded net), so there is NO separate rounding line or mapping.
  // The only JVSL mappings needed per location are salary + epf/socso/sip_employer.
  // Credit side: the 5 accruals, ACW_SAL a single line = rounded net of everyone.
  const buildJvslLines = (staffData, mappingsByLocation, staffAccruals, roundingByLocation = {}, locationNames = {}) => {
    const debitEntries = [];
    const unmapped = [];
    let totalGross = 0, totalEpf = 0, totalEpfEmp = 0, totalSocso = 0, totalSocsoEmp = 0;
    let totalSip = 0, totalSipEmp = 0, totalPcb = 0, totalRounding = 0;

    for (const loc of staffData) {
      const m = mappingsByLocation[`JVSL_${loc.location_id}`] || {};
      // Prefer the department/location name; fall back to "Location NN"
      const locName = locationNames[loc.location_id] || `Location ${loc.location_id}`;
      const gross = parseFloat(loc.total_gaji_kasar) || 0;
      const epf = parseFloat(loc.total_epf_majikan) || 0;
      const epfEmp = parseFloat(loc.total_epf_pekerja) || 0;
      const socso = parseFloat(loc.total_socso_majikan) || 0;
      const socsoEmp = parseFloat(loc.total_socso_pekerja) || 0;
      const sip = parseFloat(loc.total_sip_majikan) || 0;
      const sipEmp = parseFloat(loc.total_sip_pekerja) || 0;
      const pcb = parseFloat(loc.total_pcb) || 0;
      const rounding = round2(roundingByLocation[loc.location_id] || 0);
      // Salary debit = the location's gross grown by its digenapkan rounding.
      const salary = round2(gross + rounding);

      totalGross += gross;
      totalEpf += epf; totalEpfEmp += epfEmp;
      totalSocso += socso; totalSocsoEmp += socsoEmp;
      totalSip += sip; totalSipEmp += sipEmp;
      totalPcb += pcb; totalRounding += rounding;

      const candidates = [
        { account: m.salary, amount: salary, desc: `Salary - ${locName}`, type: "salary", locationId: loc.location_id },
        { account: m.epf_employer, amount: epf, desc: `EPF - ${locName}`, type: "epf_employer", locationId: loc.location_id },
        { account: m.socso_employer, amount: socso, desc: `SOCSO - ${locName}`, type: "socso_employer", locationId: loc.location_id },
        { account: m.sip_employer, amount: sip, desc: `SIP - ${locName}`, type: "sip_employer", locationId: loc.location_id },
      ];
      for (const l of candidates) {
        if (l.amount > 0 && !l.account) unmapped.push(`${l.type} @ location ${l.locationId}: ${l.amount.toFixed(2)}`);
      }
      debitEntries.push(...candidates.filter((l) => l.account && l.amount > 0));
    }

    debitEntries.sort((a, b) => {
      const d = (JVSL_TYPE_PRIORITY[a.type] || 99) - (JVSL_TYPE_PRIORITY[b.type] || 99);
      return d !== 0 ? d : a.locationId.localeCompare(b.locationId);
    });

    const debits = debitEntries.map((l) => ({ account_code: l.account, particulars: l.desc, debit: round2(l.amount), credit: 0 }));

    // ACW_SAL = rounded net of everyone = (gross − employee statutory − PCB) + rounding
    const calculatedTotalNet = round2(totalGross - totalEpfEmp - totalSocsoEmp - totalSipEmp - totalPcb + totalRounding);
    const creditCandidates = [
      { account: staffAccruals.accrual_salary, amount: calculatedTotalNet, desc: "Total Salary Payable" },
      { account: staffAccruals.accrual_epf, amount: round2(totalEpf + totalEpfEmp), desc: "Total EPF Payable" },
      { account: staffAccruals.accrual_socso, amount: round2(totalSocso + totalSocsoEmp), desc: "Total SOCSO Payable" },
      { account: staffAccruals.accrual_sip, amount: round2(totalSip + totalSipEmp), desc: "Total SIP Payable" },
      { account: staffAccruals.accrual_pcb, amount: round2(totalPcb), desc: "Total PCB Payable" },
    ].filter((l) => l.account && l.amount > 0);
    const credits = creditCandidates.map((l) => ({ account_code: l.account, particulars: l.desc, debit: 0, credit: round2(l.amount) }));

    return {
      lines: [...debits, ...credits],
      totalDebit: round2(debits.reduce((s, l) => s + l.debit, 0)),
      totalCredit: round2(credits.reduce((s, l) => s + l.credit, 0)),
      unmapped,
    };
  };

  // ==================== JVSL DEPARTMENT MODEL (legacy 1:1) ====================
  //
  // The legacy JVSL is the monthly Salary Report, transposed into GL lines. So the
  // voucher is built from the EXACT salary-report per-location figures (single
  // source of truth) — see computeMonthlySalaryReport in payroll/salary-report.js.
  //
  // Each legacy "department" line aggregates one or more salary-report locations and
  // is composed by component TYPE (all Salary/Commission first, then Bonus, OT, RND,
  // then employer EPF/SOCSO/SIP, then the ACW_* accrual credits) — matching the
  // printed voucher's ordering. Rules reverse-engineered from the legacy print:
  //   - A department's Salary line = gaji + comm + cuti (+ bonus, unless a dedicated
  //     bonus account is mapped, e.g. Office).
  //   - OT is always its own line; RND (= the department's per-employee digenapkan)
  //     is always its own line, both on the department's primary salary account.
  //   - Salesman / Ikut Lori (split5050): the department's salary is booked 50/50 to
  //     a MEE and a BIHUN commission account, and their OT and RND split the same
  //     way. Ikut Lori's "Others" = its salary-report commission column.
  //   - Jelly pay is treated as ordinary Tien Hock payroll (folded into the
  //     salesman/ikut-lori 50/50 split — no separate jelly line).
  //   - Directors (location 01) are excluded (they go to JVDR).
  const JVSL_DEPARTMENTS = [
    { id: "02", name: "Office", locs: ["02"] },
    { id: "03", name: "Salesman", locs: ["03"], split5050: true, jelly: true, jellyLabel: "Commission Jelly" },
    { id: "04", name: "Ikut Lori", locs: ["04"], split5050: true, othersLine: true, jelly: true, jellyLabel: "Salary Salesman (Jelly)" },
    { id: "06", name: "Jaga Boiler", locs: ["06"] },
    { id: "07", name: "Mesin & Sangkut Mee", locs: ["07"] },
    { id: "08", name: "Packing Mee", locs: ["08"] },
    { id: "09", name: "Mesin & Sangkut Bihun", locs: ["09", "10"] },
    { id: "11", name: "Packing Bihun", locs: ["11"] },
    { id: "13", name: "Tukang Sapu", locs: ["13"] },
    { id: "14", name: "Maintenance", locs: ["14"] },
  ];
  // Locations that belong to a JVSL department (everything else — 01 directors,
  // 05/12/15, and the 16-24 commission buckets — is not part of the legacy JVSL).
  const JVSL_DEPT_LOCS = new Set(JVSL_DEPARTMENTS.flatMap((d) => d.locs));

  // Split an amount 50/50: MEE gets the floored half, BIHUN the remainder. Matches
  // the legacy salesman split (12,787.05 -> 6,393.52 / 6,393.53).
  const splitHalf = (amt) => {
    const a = round2(amt);
    const first = Math.floor((a / 2) * 100) / 100;
    return [first, round2(a - first)];
  };

  // Aggregate the salary-report per-location totals into the department shape.
  const aggregateDepartments = (locationsByIdTotals) => {
    return JVSL_DEPARTMENTS.map((dept) => {
      const t = {
        gaji: 0, ot: 0, bonus: 0, comm: 0, cuti: 0, gaji_kasar: 0,
        epf_er: 0, epf_ee: 0, socso_er: 0, socso_ee: 0, sip_er: 0, sip_ee: 0,
        pcb: 0, gaji_bersih: 0, digenap: 0,
      };
      for (const locId of dept.locs) {
        const lt = locationsByIdTotals[locId];
        if (!lt) continue;
        t.gaji += parseFloat(lt.gaji) || 0;
        t.ot += parseFloat(lt.ot) || 0;
        t.bonus += parseFloat(lt.bonus) || 0;
        t.comm += parseFloat(lt.comm) || 0;
        t.cuti += parseFloat(lt.cuti) || 0;
        t.gaji_kasar += parseFloat(lt.gaji_kasar) || 0;
        t.epf_er += parseFloat(lt.epf_majikan) || 0;
        t.epf_ee += parseFloat(lt.epf_pekerja) || 0;
        t.socso_er += parseFloat(lt.socso_majikan) || 0;
        t.socso_ee += parseFloat(lt.socso_pekerja) || 0;
        t.sip_er += parseFloat(lt.sip_majikan) || 0;
        t.sip_ee += parseFloat(lt.sip_pekerja) || 0;
        t.pcb += parseFloat(lt.pcb) || 0;
        t.gaji_bersih += parseFloat(lt.gaji_bersih) || 0;
        t.digenap += parseFloat(lt.digenapkan) || 0;
      }
      Object.keys(t).forEach((k) => (t[k] = round2(t[k])));
      return { ...dept, totals: t };
    });
  };

  // Jelly (Ice-Polly cup) SALES pay booked by the salesman/ikut-lori as ordinary Tien
  // Hock payroll. In the legacy voucher it is carved OUT of the salesman/ikut-lori
  // 50/50 commission split into its own line (Salesman -> "Commission Jelly" THJ_CK;
  // Ikut Lori -> "Salary Salesman (Jelly)" THJ_SM). Identified by pay-code description:
  // an Ice-Polly SALES code (excludes MUAT loading codes and the ME-Q mee/bihun/ramen
  // codes). Returns { location_id: jelly_amount } using the SAME per-employee location
  // grouping as the salary report, so the carve-out never double-counts.
  const JELLY_SALES_DESC = "%ICE-POLLY%";
  const computeJellyByLocation = async (db, year, month, salaryReport) => {
    const staffLoc = {};
    (salaryReport?.comprehensive?.locations || []).forEach((l) => {
      (l.employees || []).forEach((e) => {
        if (e.staff_id != null) staffLoc[e.staff_id] = l.location;
      });
    });
    const r = await db.query(
      `SELECT ep.employee_id, ROUND(SUM(pi.amount), 2) AS amt
         FROM employee_payrolls ep
         JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
         JOIN payroll_items pi ON pi.employee_payroll_id = ep.id
         JOIN pay_codes pc ON pc.id = pi.pay_code_id
        WHERE mp.year = $1 AND mp.month = $2
          AND pc.description ILIKE $3
          AND pc.description ILIKE '%SALES%'
          AND pc.description NOT ILIKE '%MUAT%'
        GROUP BY ep.employee_id`,
      [year, month, JELLY_SALES_DESC]
    );
    const byLoc = {};
    r.rows.forEach((row) => {
      const loc = staffLoc[row.employee_id];
      if (!loc) return;
      byLoc[loc] = round2((byLoc[loc] || 0) + (parseFloat(row.amt) || 0));
    });
    return byLoc;
  };

  // Build the JVSL journal lines (and the per-department preview rows) from the
  // salary report. mappingsByLocation is keyed `JVSL_<deptId>`; staffAccruals is the
  // JVSL_00 accrual map. jellyByLocation carves Ice-Polly jelly sales out of the
  // salesman/ikut-lori split. Returns lines, totals, unmapped, and preview `locations`.
  const buildJvslFromSalaryReport = (salaryReport, mappingsByLocation, staffAccruals, jellyByLocation = {}) => {
    const locTotals = {};
    let commissionOnly = 0; // 16-24 amounts that fall outside the department model
    (salaryReport?.comprehensive?.locations || []).forEach((l) => {
      locTotals[l.location] = l.totals;
      if (!JVSL_DEPT_LOCS.has(l.location) && l.location !== "01") {
        commissionOnly += parseFloat(l.totals?.gaji_bersih) || 0;
      }
    });

    const departments = aggregateDepartments(locTotals);
    const unmapped = [];
    const salaryLines = [];
    const bonusLines = [];
    const otLines = [];
    const rndLines = [];
    const epfLines = [];
    const socsoLines = [];
    const sipLines = [];
    const previewLocations = [];

    // Running credit-side staff totals (sum across departments).
    let cGajiBersih = 0, cDigenap = 0, cEpfEr = 0, cEpfEe = 0, cSocsoEr = 0,
      cSocsoEe = 0, cSipEr = 0, cSipEe = 0, cPcb = 0;

    const need = (acct, amt, label) => {
      if (round2(amt) > 0 && !acct) unmapped.push(`${label}: ${round2(amt).toFixed(2)}`);
    };

    for (const dept of departments) {
      const t = dept.totals;
      const m = mappingsByLocation[`JVSL_${dept.id}`] || {};
      const salaryAcct = m.salary || null;
      const bonusAcct = m.bonus || null; // dedicated bonus line only where mapped
      const otAcct = m.overtime || salaryAcct;
      const meeAcct = m.commission_mee || null;
      const bhAcct = m.commission_bh || null;
      const othersAcct = m.others || null;

      cGajiBersih += t.gaji_bersih;
      cDigenap += t.digenap;
      cEpfEr += t.epf_er; cEpfEe += t.epf_ee;
      cSocsoEr += t.socso_er; cSocsoEe += t.socso_ee;
      cSipEr += t.sip_er; cSipEe += t.sip_ee;
      cPcb += t.pcb;

      // ----- Salary / Commission -----
      let deptSalaryDebit = 0; // for the preview row
      if (dept.split5050) {
        // Carve Ice-Polly jelly sales out of the 50/50 split into its own line.
        const jellyAmt = dept.jelly
          ? round2(dept.locs.reduce((s, loc) => s + (jellyByLocation[loc] || 0), 0))
          : 0;
        const jellyAcct = m.commission_jelly || null;
        const othersAmt = round2(t.comm);
        // Anchor to actual gross_pay (gaji_kasar), NOT the salary report's re-rounded
        // GAJI/COMM/CUTI columns — those can drift a few cents from real gross. The
        // 50/50 base is the residual gross after carving OT (own lines), jelly and
        // others, so each department ties out to the legacy voucher to the cent.
        const splitBase = round2(t.gaji_kasar - t.ot - jellyAmt - othersAmt);
        const [meeAmt, bhAmt] = splitHalf(splitBase);
        need(meeAcct, meeAmt, `commission_mee @ ${dept.name}`);
        need(bhAcct, bhAmt, `commission_bh @ ${dept.name}`);
        if (meeAcct && meeAmt > 0)
          salaryLines.push({ account_code: meeAcct, particulars: `${dept.name}-Commission Mee`, debit: meeAmt, credit: 0 });
        if (bhAcct && bhAmt > 0)
          salaryLines.push({ account_code: bhAcct, particulars: `${dept.name}-Commission Bihun`, debit: bhAmt, credit: 0 });
        if (dept.jelly && jellyAmt > 0) {
          need(jellyAcct, jellyAmt, `commission_jelly @ ${dept.name}`);
          if (jellyAcct)
            salaryLines.push({ account_code: jellyAcct, particulars: dept.jellyLabel, debit: jellyAmt, credit: 0 });
        }
        if (dept.othersLine && othersAmt > 0) {
          need(othersAcct, othersAmt, `others @ ${dept.name}`);
          if (othersAcct)
            salaryLines.push({ account_code: othersAcct, particulars: `${dept.name}-Others`, debit: othersAmt, credit: 0 });
        }
        deptSalaryDebit = round2(splitBase + jellyAmt + othersAmt);

        // ----- OT (split 50/50) -----
        if (t.ot > 0) {
          const [meeOt, bhOt] = splitHalf(t.ot);
          if (meeAcct && meeOt > 0)
            otLines.push({ account_code: meeAcct, particulars: `${dept.name}-Commission Mee (OT)`, debit: meeOt, credit: 0 });
          if (bhAcct && bhOt > 0)
            otLines.push({ account_code: bhAcct, particulars: `${dept.name}-Commission Bihun (OT)`, debit: bhOt, credit: 0 });
        }
        // ----- RND (split 50/50) -----
        if (t.digenap > 0) {
          const [meeR, bhR] = splitHalf(t.digenap);
          if (meeAcct && meeR > 0)
            rndLines.push({ account_code: meeAcct, particulars: `${dept.name}-Commission Mee (RND)`, debit: meeR, credit: 0 });
          if (bhAcct && bhR > 0)
            rndLines.push({ account_code: bhAcct, particulars: `${dept.name}-Commission Bihun (RND)`, debit: bhR, credit: 0 });
        }
      } else {
        // Anchor to actual gross_pay (gaji_kasar), not the re-rounded GAJI/COMM/CUTI
        // columns. Salary residual = gross − OT (own line) − bonus (own line, if a
        // dedicated bonus account is mapped; otherwise bonus stays folded in).
        const salaryAmt = round2(t.gaji_kasar - t.ot - (bonusAcct ? t.bonus : 0));
        need(salaryAcct, salaryAmt, `salary @ ${dept.name}`);
        if (salaryAcct && salaryAmt > 0)
          salaryLines.push({ account_code: salaryAcct, particulars: dept.name, debit: salaryAmt, credit: 0 });
        deptSalaryDebit = salaryAmt;

        if (bonusAcct && t.bonus > 0) {
          bonusLines.push({ account_code: bonusAcct, particulars: `${dept.name} (Bonus)`, debit: round2(t.bonus), credit: 0 });
          deptSalaryDebit = round2(deptSalaryDebit + t.bonus);
        }
        if (t.ot > 0) {
          need(otAcct, t.ot, `overtime @ ${dept.name}`);
          if (otAcct)
            otLines.push({ account_code: otAcct, particulars: `${dept.name} (OT)`, debit: round2(t.ot), credit: 0 });
          deptSalaryDebit = round2(deptSalaryDebit + t.ot);
        }
        if (t.digenap > 0 && salaryAcct) {
          rndLines.push({ account_code: salaryAcct, particulars: `${dept.name} (RND)`, debit: round2(t.digenap), credit: 0 });
          deptSalaryDebit = round2(deptSalaryDebit + t.digenap);
        }
      }

      // ----- Employer statutory -----
      need(m.epf_employer, t.epf_er, `epf_employer @ ${dept.name}`);
      need(m.socso_employer, t.socso_er, `socso_employer @ ${dept.name}`);
      need(m.sip_employer, t.sip_er, `sip_employer @ ${dept.name}`);
      if (m.epf_employer && t.epf_er > 0)
        epfLines.push({ account_code: m.epf_employer, particulars: `${dept.name} (EPF)`, debit: t.epf_er, credit: 0 });
      if (m.socso_employer && t.socso_er > 0)
        socsoLines.push({ account_code: m.socso_employer, particulars: `${dept.name} (SOCSO)`, debit: t.socso_er, credit: 0 });
      if (m.sip_employer && t.sip_er > 0)
        sipLines.push({ account_code: m.sip_employer, particulars: `${dept.name} (SIP)`, debit: t.sip_er, credit: 0 });

      previewLocations.push({
        location_id: dept.id,
        location_name: dept.name,
        salary: deptSalaryDebit,
        epf_employer: t.epf_er,
        socso_employer: t.socso_er,
        sip_employer: t.sip_er,
        pcb: t.pcb,
        net_salary: round2(t.gaji_bersih + t.digenap),
        accounts: {
          salary: salaryAcct,
          epf_employer: m.epf_employer || null,
          socso_employer: m.socso_employer || null,
          sip_employer: m.sip_employer || null,
        },
      });
    }

    const debitLines = [
      ...salaryLines, ...bonusLines, ...otLines, ...rndLines,
      ...epfLines, ...socsoLines, ...sipLines,
    ];
    const totalDebit = round2(debitLines.reduce((s, l) => s + l.debit, 0));

    // ----- Credit accruals (staff totals) -----
    // The statutory accruals are the both-portion totals; ACW_SAL (net salary
    // payable) is the balancing figure = total debit − the statutory accruals, so
    // the voucher always ties out. This equals Σ(net + rounding) before advance/
    // mid-month deductions and reproduces the legacy ACW_SAL (143,513.00) exactly.
    const accEpf = round2(cEpfEr + cEpfEe);
    const accSocso = round2(cSocsoEr + cSocsoEe);
    const accSip = round2(cSipEr + cSipEe);
    const accPcb = round2(cPcb);
    const acwSal = round2(totalDebit - accEpf - accSocso - accSip - accPcb);
    const creditCandidates = [
      { account: staffAccruals.accrual_epf, amount: accEpf, desc: "Accrual (EPF)" },
      { account: staffAccruals.accrual_socso, amount: accSocso, desc: "Accrual (SOCSO)" },
      { account: staffAccruals.accrual_salary, amount: acwSal, desc: "Accrual (Salary Payables)" },
      { account: staffAccruals.accrual_pcb, amount: accPcb, desc: "Accrual (PCB Payables)" },
      { account: staffAccruals.accrual_sip, amount: accSip, desc: "Accrual (SIP)" },
    ];
    creditCandidates.forEach((c) => {
      if (c.amount > 0 && !c.account) unmapped.push(`${c.desc} (accrual): ${c.amount.toFixed(2)}`);
    });
    const creditLines = creditCandidates
      .filter((c) => c.account && c.amount > 0)
      .map((c) => ({ account_code: c.account, particulars: c.desc, debit: 0, credit: round2(c.amount) }));

    if (round2(commissionOnly) > 0) {
      unmapped.push(`commission-only (loc 16-24) net not in any JVSL department: ${round2(commissionOnly).toFixed(2)}`);
    }

    const lines = [...debitLines, ...creditLines];

    return {
      lines,
      locations: previewLocations,
      totalDebit: round2(debitLines.reduce((s, l) => s + l.debit, 0)),
      totalCredit: round2(creditLines.reduce((s, l) => s + l.credit, 0)),
      unmapped,
      totals: {
        salary: round2(previewLocations.reduce((s, l) => s + l.salary, 0)),
        epf_employer: round2(cEpfEr),
        socso_employer: round2(cSocsoEr),
        sip_employer: round2(cSipEr),
        pcb: round2(cPcb),
        accrual_salary: acwSal,
        accrual_accounts: staffAccruals,
      },
    };
  };

  // ==================== LOCATION ACCOUNT MAPPINGS CRUD ====================

  // GET /mappings - Get all location-account mappings
  router.get("/mappings", async (req, res) => {
    try {
      const { voucher_type, location_id, is_active } = req.query;

      let query = `
        SELECT
          lam.id,
          lam.location_id,
          lam.location_name,
          lam.mapping_type,
          lam.account_code,
          ac.description as account_description,
          lam.voucher_type,
          lam.is_active,
          lam.created_at,
          lam.updated_at
        FROM location_account_mappings lam
        LEFT JOIN account_codes ac ON lam.account_code = ac.code
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (voucher_type) {
        query += ` AND lam.voucher_type = $${paramIndex}`;
        params.push(voucher_type);
        paramIndex++;
      }

      if (location_id) {
        query += ` AND lam.location_id = $${paramIndex}`;
        params.push(location_id);
        paramIndex++;
      }

      if (is_active !== undefined && is_active !== "") {
        query += ` AND lam.is_active = $${paramIndex}`;
        params.push(is_active === "true" || is_active === true);
        paramIndex++;
      }

      query += ` ORDER BY lam.voucher_type, lam.location_id, lam.mapping_type`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching location account mappings:", error);
      res.status(500).json({
        message: "Error fetching location account mappings",
        error: error.message,
      });
    }
  });

  // GET /mappings/:id - Get single mapping by ID
  router.get("/mappings/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const query = `
        SELECT
          lam.*,
          ac.description as account_description
        FROM location_account_mappings lam
        LEFT JOIN account_codes ac ON lam.account_code = ac.code
        WHERE lam.id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Mapping not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching mapping:", error);
      res.status(500).json({
        message: "Error fetching mapping",
        error: error.message,
      });
    }
  });

  // POST /mappings - Create new mapping
  router.post("/mappings", async (req, res) => {
    const {
      location_id,
      location_name,
      mapping_type,
      account_code,
      voucher_type,
      is_active = true,
    } = req.body;

    // Validation
    if (!location_id || !location_name || !mapping_type || !account_code || !voucher_type) {
      return res.status(400).json({
        message: "location_id, location_name, mapping_type, account_code, and voucher_type are required",
      });
    }

    // Validate mapping_type. JVSL follows the legacy voucher, which books each
    // department by component: the Salary line (gaji+comm+cuti, plus bonus unless a
    // dedicated bonus account is mapped), OT, and RND on the primary salary account;
    // Salesman/Ikut Lori split their commission 50/50 into commission_mee /
    // commission_bh (with Ikut Lori's "others" column on its own account). "overtime"
    // and "bonus" are optional overrides (they default to the salary account).
    // Accruals are configured at location 00.
    const validMappingTypes = [
      // Expense types
      "salary", "overtime", "bonus",
      "commission_mee", "commission_bh", "commission_jelly", "others",
      "epf_employer", "socso_employer", "sip_employer",
      // Accrual types (location 00)
      "accrual_salary", "accrual_epf", "accrual_socso", "accrual_sip", "accrual_pcb",
    ];
    if (!validMappingTypes.includes(mapping_type)) {
      return res.status(400).json({
        message: `Invalid mapping_type. Must be one of: ${validMappingTypes.join(", ")}`,
      });
    }

    // Validate voucher_type
    if (!["JVDR", "JVSL"].includes(voucher_type)) {
      return res.status(400).json({
        message: "Invalid voucher_type. Must be 'JVDR' or 'JVSL'",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if account code exists
      const accountCheck = await client.query(
        "SELECT 1 FROM account_codes WHERE code = $1",
        [account_code]
      );
      if (accountCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Account code '${account_code}' does not exist`,
        });
      }

      // Check for duplicate mapping
      const duplicateCheck = await client.query(
        "SELECT 1 FROM location_account_mappings WHERE location_id = $1 AND mapping_type = $2 AND voucher_type = $3",
        [location_id, mapping_type, voucher_type]
      );
      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Mapping already exists for location ${location_id}, type ${mapping_type}, voucher ${voucher_type}`,
        });
      }

      const insertQuery = `
        INSERT INTO location_account_mappings (
          location_id, location_name, mapping_type, account_code, voucher_type, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        location_id,
        location_name.toUpperCase().trim(),
        mapping_type,
        account_code.toUpperCase().trim(),
        voucher_type,
        is_active,
        req.staffId || null,
      ]);

      await client.query("COMMIT");

      res.status(201).json({
        message: "Mapping created successfully",
        mapping: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating mapping:", error);
      res.status(500).json({
        message: "Error creating mapping",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /mappings/:id - Update mapping
  router.put("/mappings/:id", async (req, res) => {
    const { id } = req.params;
    const {
      location_name,
      account_code,
      is_active,
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if mapping exists
      const existingCheck = await client.query(
        "SELECT * FROM location_account_mappings WHERE id = $1",
        [id]
      );
      if (existingCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Mapping not found" });
      }

      // If account_code is being updated, verify it exists
      if (account_code) {
        const accountCheck = await client.query(
          "SELECT 1 FROM account_codes WHERE code = $1",
          [account_code]
        );
        if (accountCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Account code '${account_code}' does not exist`,
          });
        }
      }

      const updateQuery = `
        UPDATE location_account_mappings
        SET
          location_name = COALESCE($1, location_name),
          account_code = COALESCE($2, account_code),
          is_active = COALESCE($3, is_active),
          updated_by = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `;

      const result = await client.query(updateQuery, [
        location_name ? location_name.toUpperCase().trim() : null,
        account_code ? account_code.toUpperCase().trim() : null,
        is_active,
        req.staffId || null,
        id,
      ]);

      await client.query("COMMIT");

      res.json({
        message: "Mapping updated successfully",
        mapping: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating mapping:", error);
      res.status(500).json({
        message: "Error updating mapping",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // DELETE /mappings/:id - Delete mapping
  router.delete("/mappings/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if mapping exists
      const existingCheck = await client.query(
        "SELECT * FROM location_account_mappings WHERE id = $1",
        [id]
      );
      if (existingCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Mapping not found" });
      }

      await client.query("DELETE FROM location_account_mappings WHERE id = $1", [id]);

      await client.query("COMMIT");

      res.json({
        message: "Mapping deleted successfully",
        id: parseInt(id),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting mapping:", error);
      res.status(500).json({
        message: "Error deleting mapping",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // ==================== VOUCHER PREVIEW & GENERATION ====================

  // GET /preview/:year/:month - Preview voucher data for a month
  router.get("/preview/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);

      if (isNaN(yearInt) || isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }

      // Get salary data by location from employee_payrolls using job-based location mapping
      const salaryQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        employee_data AS (
          SELECT
            ep.id as employee_payroll_id,
            ep.employee_id,
            ep.job_type,
            COALESCE(jlm.location_code, '02') as location_id,
            ep.gross_pay,
            ep.net_pay
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          LEFT JOIN job_location_map jlm ON ep.job_type = jlm.job_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        -- Directors data (for JVDR) - separate from staff
        director_data AS (
          SELECT
            ed.*
          FROM employee_data ed
          WHERE ed.employee_id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        -- Staff data (for JVSL) - excludes directors
        staff_data AS (
          SELECT
            ed.*
          FROM employee_data ed
          WHERE ed.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        deductions_data AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        -- Commission MEE/BH split for locations 03 and 04
        commission_split AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(CASE WHEN p.type = 'MEE' THEN pi.amount ELSE 0 END), 0) as commission_mee,
            COALESCE(SUM(CASE WHEN p.type = 'BH' THEN pi.amount ELSE 0 END), 0) as commission_bh
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          LEFT JOIN product_pay_codes ppc ON pi.pay_code_id = ppc.pay_code_id
          LEFT JOIN products p ON ppc.product_id = p.id
          WHERE sd.location_id IN ('03', '04')
            AND p.type IN ('MEE', 'BH')
          GROUP BY sd.location_id
        ),
        -- Cuti Tahunan by location
        cuti_tahunan_data AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(lr.amount_paid), 0) as cuti_tahunan_amount
          FROM staff_data sd
          JOIN leave_records lr ON sd.employee_id = lr.employee_id
          WHERE lr.leave_type = 'cuti_tahunan'
            AND lr.status = 'approved'
            AND lr.amount_paid > 0
            AND EXTRACT(YEAR FROM lr.leave_date) = $1
            AND EXTRACT(MONTH FROM lr.leave_date) = $2
          GROUP BY sd.location_id
        ),
        -- Salary amounts by location (excluding overtime and commission-related pay codes)
        salary_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as salary_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          LEFT JOIN product_pay_codes ppc ON pi.pay_code_id = ppc.pay_code_id
          WHERE pc.pay_type IN ('Base', 'Tambahan')
            AND ppc.pay_code_id IS NULL  -- Exclude commission-related pay codes linked to products
          GROUP BY sd.location_id
        ),
        -- Overtime amounts by location
        overtime_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as overtime_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pc.pay_type = 'Overtime'
          GROUP BY sd.location_id
        ),
        -- Commission records data (bonus and commission from commission_records table)
        -- Bonuses (location_code IS NULL) go to employee's primary location with 'bonus' mapping
        bonus_by_location AS (
          SELECT
            TRIM(BOTH '"' FROM (s.location::jsonb->0)::text) as location_id,
            COALESCE(SUM(cr.amount), 0) as bonus_amount
          FROM commission_records cr
          JOIN staffs s ON cr.employee_id = s.id
          WHERE cr.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
            AND cr.location_code IS NULL
            AND EXTRACT(YEAR FROM cr.commission_date) = $1
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY TRIM(BOTH '"' FROM (s.location::jsonb->0)::text)
        ),
        -- Located commissions (16-24) grouped by the employee's JOB location — used to
        -- carve them out of the residual salary line, since they get their own debit
        -- lines at their commission location
        commission_by_job_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(cr.amount), 0) as commission_amount
          FROM commission_records cr
          JOIN staff_data sd ON cr.employee_id = sd.employee_id
          WHERE cr.location_code IS NOT NULL
            AND EXTRACT(YEAR FROM cr.commission_date) = $1
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY sd.location_id
        ),
        employee_summary AS (
          SELECT
            sd.employee_id,
            sd.location_id,
            sd.gross_pay,
            sd.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employee,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employee,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employee,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
          FROM staff_data sd
        ),
        -- Director summary for JVDR
        director_summary AS (
          SELECT
            dd.employee_id,
            dd.location_id,
            dd.gross_pay,
            dd.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'epf'), 0) as epf_employee,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'socso'), 0) as socso_employee,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'sip'), 0) as sip_employee,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'income_tax'), 0) as pcb
          FROM director_data dd
        )
        SELECT
          es.location_id,
          SUM(es.gross_pay) as total_gaji_kasar,
          SUM(es.epf_employer) as total_epf_majikan,
          SUM(es.epf_employee) as total_epf_pekerja,
          SUM(es.socso_employer) as total_socso_majikan,
          SUM(es.socso_employee) as total_socso_pekerja,
          SUM(es.sip_employer) as total_sip_majikan,
          SUM(es.sip_employee) as total_sip_pekerja,
          SUM(es.pcb) as total_pcb,
          SUM(es.net_pay) as total_gaji_bersih,
          COALESCE((SELECT cs.commission_mee FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_mee,
          COALESCE((SELECT cs.commission_bh FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_bh,
          COALESCE((SELECT ct.cuti_tahunan_amount FROM cuti_tahunan_data ct WHERE ct.location_id = es.location_id), 0) as cuti_tahunan,
          COALESCE((SELECT sl.salary_amount FROM salary_by_location sl WHERE sl.location_id = es.location_id), 0) as salary_amount,
          COALESCE((SELECT ol.overtime_amount FROM overtime_by_location ol WHERE ol.location_id = es.location_id), 0) as overtime_amount,
          COALESCE((SELECT bl.bonus_amount FROM bonus_by_location bl WHERE bl.location_id = es.location_id), 0) as bonus_amount,
          COALESCE((SELECT cj.commission_amount FROM commission_by_job_location cj WHERE cj.location_id = es.location_id), 0) as located_commission_amount
        FROM employee_summary es
        GROUP BY es.location_id
        ORDER BY es.location_id
      `;

      // Also get commission_records by their own location codes (16-24) for preview
      const commissionQuery = `
        SELECT
          cr.location_code as location_id,
          COALESCE(SUM(cr.amount), 0) as commission_amount
        FROM commission_records cr
        WHERE cr.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
          AND cr.location_code IS NOT NULL
          AND EXTRACT(YEAR FROM cr.commission_date) = $1
          AND EXTRACT(MONTH FROM cr.commission_date) = $2
        GROUP BY cr.location_code
      `;

      const salaryResult = await pool.query(salaryQuery, [yearInt, monthInt]);
      const commissionResult = await pool.query(commissionQuery, [yearInt, monthInt]);

      // Build a map of commission amounts by location
      const commissionByLocation = {};
      commissionResult.rows.forEach(row => {
        commissionByLocation[row.location_id] = parseFloat(row.commission_amount) || 0;
      });

      // Get individual director data for JVDR
      const directorQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        director_payroll AS (
          SELECT
            s.id as employee_id,
            s.name as employee_name,
            ep.gross_pay,
            ep.net_pay,
            CASE
              WHEN s.id = 'GOH' THEN 'GTH'
              WHEN s.id = 'WONG' THEN 'WSF'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'WG'
            END as director_code,
            CASE
              WHEN s.id = 'GOH' THEN 'Salary Director - GOH'
              WHEN s.id = 'WONG' THEN 'Salary Director - WONG'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'Salary Ex.Director - WINNIE.G'
            END as particulars
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          WHERE mp.year = $1 AND mp.month = $2
            AND s.id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        director_deductions AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
            AND ep.employee_id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        )
        SELECT
          dp.employee_id,
          dp.employee_name,
          dp.director_code,
          dp.particulars,
          dp.gross_pay,
          dp.net_pay,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employee,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employee,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employee,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
        FROM director_payroll dp
        ORDER BY dp.director_code
      `;

      const directorResult = await pool.query(directorQuery, [yearInt, monthInt]);

      // Get location-account mappings
      const mappingsQuery = `
        SELECT * FROM location_account_mappings
        WHERE is_active = true
        ORDER BY voucher_type, location_id, mapping_type
      `;
      const mappingsResult = await pool.query(mappingsQuery);

      // Get all locations for name lookup
      const locationsQuery = `SELECT id, name FROM locations ORDER BY id`;
      const locationsResult = await pool.query(locationsQuery);
      const locationNames = {};
      locationsResult.rows.forEach(l => {
        locationNames[l.id] = l.name;
      });

      // Build voucher preview
      const jvdrData = [];
      const jvslData = [];

      // Group mappings by location and voucher type
      const mappingsByLocation = {};
      const locationNamesByMapping = {};
      mappingsResult.rows.forEach(m => {
        const key = `${m.voucher_type}_${m.location_id}`;
        if (!mappingsByLocation[key]) {
          mappingsByLocation[key] = {};
          locationNamesByMapping[key] = m.location_name;
        }
        mappingsByLocation[key][m.mapping_type] = m.account_code;
      });

      // Get accrual accounts for staff (location 00)
      const staffAccruals = mappingsByLocation["JVSL_00"] || {};

      // Process salary data for each location (JVSL - staff only, directors excluded)
      salaryResult.rows.forEach(location => {
        const locationId = location.location_id;
        // Skip location 01 (directors are handled separately)
        if (locationId === "01") return;

        const mappingKey = `JVSL_${locationId}`;
        const locationMappings = mappingsByLocation[mappingKey] || {};

        // Debit model: Salary = the location's FULL gross (all earnings). Only
        // employer EPF/SOCSO/SIP are broken out. Everything else (OT, commissions,
        // cuti/leave, bonus, product pay, Others) is inside the Salary row.
        const grossPay = parseFloat(location.total_gaji_kasar) || 0;
        const epfAmount = parseFloat(location.total_epf_majikan) || 0;
        const socsoAmount = parseFloat(location.total_socso_majikan) || 0;
        const sipAmount = parseFloat(location.total_sip_majikan) || 0;
        const pcbAmount = parseFloat(location.total_pcb) || 0;
        const epfEmployee = parseFloat(location.total_epf_pekerja) || 0;
        const socsoEmployee = parseFloat(location.total_socso_pekerja) || 0;
        const sipEmployee = parseFloat(location.total_sip_pekerja) || 0;
        // Net payable = gross - employee deductions - PCB (what flows to ACW_SAL)
        const netSalary = Math.round(
          (grossPay - epfEmployee - socsoEmployee - sipEmployee - pcbAmount) * 100
        ) / 100;

        const entry = {
          location_id: locationId,
          location_name: locationNamesByMapping[mappingKey] || locationNames[locationId] || locationId,
          gross_pay: grossPay,
          salary: Math.round(grossPay * 100) / 100,
          epf_employer: epfAmount,
          socso_employer: socsoAmount,
          sip_employer: sipAmount,
          pcb: pcbAmount,
          net_salary: netSalary,
          accounts: {
            salary: locationMappings.salary || null,
            epf_employer: locationMappings.epf_employer || null,
            socso_employer: locationMappings.socso_employer || null,
            sip_employer: locationMappings.sip_employer || null,
          },
        };

        jvslData.push(entry);
      });

      // Process individual director data for JVDR
      const directorMappings = mappingsByLocation["JVDR_01"] || {};
      if (directorResult.rows.length > 0) {
        // Calculate totals for JVDR debit lines
        const directorTotals = {
          gross_pay: 0,
          net_pay: 0,
          epf_employer: 0,
          socso_employer: 0,
          sip_employer: 0,
          pcb: 0,
        };

        directorResult.rows.forEach(director => {
          directorTotals.gross_pay += parseFloat(director.gross_pay) || 0;
          directorTotals.net_pay += parseFloat(director.net_pay) || 0;
          directorTotals.epf_employer += parseFloat(director.epf_employer) || 0;
          directorTotals.socso_employer += parseFloat(director.socso_employer) || 0;
          directorTotals.sip_employer += parseFloat(director.sip_employer) || 0;
          directorTotals.pcb += parseFloat(director.pcb) || 0;
        });

        const jvdrEntry = {
          location_id: "01",
          location_name: locationNamesByMapping["JVDR_01"] || "DIRECTOR'S REMUNERATION",
          salary: directorTotals.gross_pay,
          epf_employer: directorTotals.epf_employer,
          socso_employer: directorTotals.socso_employer,
          sip_employer: directorTotals.sip_employer,
          pcb: directorTotals.pcb,
          net_salary: directorTotals.net_pay,
          directors: directorResult.rows.map(d => ({
            employee_id: d.employee_id,
            employee_name: d.employee_name,
            director_code: d.director_code,
            particulars: d.particulars,
            net_pay: parseFloat(d.net_pay) || 0,
          })),
          accounts: {
            salary: directorMappings.salary || null,
            epf_employer: directorMappings.epf_employer || null,
            socso_employer: directorMappings.socso_employer || null,
            sip_employer: directorMappings.sip_employer || null,
            accrual_salary: directorMappings.accrual_salary || null,
            accrual_epf: directorMappings.accrual_epf || null,
            accrual_socso: directorMappings.accrual_socso || null,
            accrual_sip: directorMappings.accrual_sip || null,
            accrual_pcb: directorMappings.accrual_pcb || null,
          },
        };
        jvdrData.push(jvdrEntry);
      }

      // Calculate JVSL totals
      const jvslTotals = {
        salary: jvslData.reduce((sum, e) => sum + e.salary, 0),
        epf_employer: jvslData.reduce((sum, e) => sum + e.epf_employer, 0),
        socso_employer: jvslData.reduce((sum, e) => sum + e.socso_employer, 0),
        sip_employer: jvslData.reduce((sum, e) => sum + e.sip_employer, 0),
        pcb: jvslData.reduce((sum, e) => sum + e.pcb, 0),
        accrual_accounts: staffAccruals,
      };

      // Check if vouchers already exist for this month
      const existingVouchersQuery = `
        SELECT id, reference_no FROM journal_entries
        WHERE reference_no LIKE $1 OR reference_no LIKE $2
      `;
      const monthStr = monthInt.toString().padStart(2, "0");
      const yearStr = yearInt.toString().slice(-2);
      const existingResult = await pool.query(existingVouchersQuery, [
        `JVDR/${monthStr}/${yearStr}`,
        `JVSL/${monthStr}/${yearStr}`,
      ]);

      // Build a map of reference_no -> id
      const existingVouchersMap = {};
      existingResult.rows.forEach(r => {
        existingVouchersMap[r.reference_no] = r.id;
      });

      const jvdrRef = `JVDR/${monthStr}/${yearStr}`;
      const jvslRef = `JVSL/${monthStr}/${yearStr}`;

      // Build the exact journal lines the generate endpoint would post (1:1), via
      // the shared builders — so the Voucher Generator can show the real voucher.
      const jvdrMappingsForLines = mappingsByLocation["JVDR_01"] || {};
      const jvdrBuilt =
        directorResult.rows.length > 0
          ? buildJvdrLines(directorResult.rows, jvdrMappingsForLines)
          : { lines: [], totalDebit: 0, totalCredit: 0, unmapped: [] };
      // JVSL is built 1:1 from the monthly Salary Report (single source of truth).
      const salaryReport = await computeMonthlySalaryReport(pool, yearInt, monthInt);
      const jellyByLoc = await computeJellyByLocation(pool, yearInt, monthInt, salaryReport);
      const jvslBuilt = buildJvslFromSalaryReport(
        salaryReport,
        mappingsByLocation,
        staffAccruals,
        jellyByLoc
      );

      res.json({
        year: yearInt,
        month: monthInt,
        jvdr: {
          reference: jvdrRef,
          exists: !!existingVouchersMap[jvdrRef],
          entry_id: existingVouchersMap[jvdrRef] || null,
          locations: jvdrData,
          lines: jvdrBuilt.lines,
          total_debit: jvdrBuilt.totalDebit,
          total_credit: jvdrBuilt.totalCredit,
          balanced:
            Math.abs(jvdrBuilt.totalDebit - jvdrBuilt.totalCredit) <= 0.01 &&
            jvdrBuilt.unmapped.length === 0,
          unmapped: jvdrBuilt.unmapped,
        },
        jvsl: {
          reference: jvslRef,
          exists: !!existingVouchersMap[jvslRef],
          entry_id: existingVouchersMap[jvslRef] || null,
          locations: jvslBuilt.locations,
          totals: jvslBuilt.totals,
          lines: jvslBuilt.lines,
          total_debit: jvslBuilt.totalDebit,
          total_credit: jvslBuilt.totalCredit,
          balanced:
            Math.abs(jvslBuilt.totalDebit - jvslBuilt.totalCredit) <= 0.01 &&
            jvslBuilt.unmapped.length === 0,
          unmapped: jvslBuilt.unmapped,
        },
      });
    } catch (error) {
      console.error("Error fetching voucher preview:", error);
      res.status(500).json({
        message: "Error fetching voucher preview",
        error: error.message,
      });
    }
  });

  // GET /payroll-summary/:year/:month - Payroll reconciliation breakdown split into
  // DIRECTOR vs WORKERS (the "Jumlah Gaji / Digenapkan / Gaji Bersih" sheet that
  // reconciles to the JVDR/JVSL voucher totals). Purely payroll-derived — no account
  // mappings needed — so it works before the vouchers are generated.
  router.get("/payroll-summary/:year/:month", async (req, res) => {
    try {
      const yearInt = parseInt(req.params.year);
      const monthInt = parseInt(req.params.month);
      if (isNaN(yearInt) || isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }

      const summaryQuery = `
        WITH emp AS (
          SELECT ep.id, ep.gross_pay,
            CASE WHEN ep.employee_id IN ('GOH','WONG','WINNIE','WINNIE.G') THEN 'director' ELSE 'workers' END AS grp
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        ded AS (
          SELECT pd.employee_payroll_id AS epid,
            SUM(CASE WHEN pd.deduction_type='epf'        THEN pd.employer_amount ELSE 0 END) AS epf_m,
            SUM(CASE WHEN pd.deduction_type='epf'        THEN pd.employee_amount ELSE 0 END) AS epf_p,
            SUM(CASE WHEN pd.deduction_type='socso'      THEN pd.employer_amount ELSE 0 END) AS socso_m,
            SUM(CASE WHEN pd.deduction_type='socso'      THEN pd.employee_amount ELSE 0 END) AS socso_p,
            SUM(CASE WHEN pd.deduction_type='sip'        THEN pd.employer_amount ELSE 0 END) AS sip_m,
            SUM(CASE WHEN pd.deduction_type='sip'        THEN pd.employee_amount ELSE 0 END) AS sip_p,
            SUM(CASE WHEN pd.deduction_type='income_tax' THEN pd.employee_amount ELSE 0 END) AS pcb
          FROM payroll_deductions pd
          GROUP BY pd.employee_payroll_id
        ),
        bonus AS (
          SELECT pi.employee_payroll_id AS epid, COALESCE(SUM(pi.amount),0) AS bonus
          FROM payroll_items pi
          JOIN pay_codes pc ON pc.id = pi.pay_code_id
          WHERE UPPER(pc.description) LIKE '%BONUS%'
          GROUP BY pi.employee_payroll_id
        ),
        per AS (
          SELECT emp.grp, emp.gross_pay, COALESCE(b.bonus,0) AS bonus,
            COALESCE(d.epf_m,0) AS epf_m, COALESCE(d.epf_p,0) AS epf_p,
            COALESCE(d.socso_m,0) AS socso_m, COALESCE(d.socso_p,0) AS socso_p,
            COALESCE(d.sip_m,0) AS sip_m, COALESCE(d.sip_p,0) AS sip_p,
            COALESCE(d.pcb,0) AS pcb,
            round((emp.gross_pay - COALESCE(d.epf_p,0) - COALESCE(d.socso_p,0) - COALESCE(d.sip_p,0) - COALESCE(d.pcb,0))::numeric, 2) AS net
          FROM emp
          LEFT JOIN ded d ON d.epid = emp.id
          LEFT JOIN bonus b ON b.epid = emp.id
        )
        SELECT grp,
          SUM(gross_pay) AS gaji_kasar,
          SUM(bonus) AS bonus,
          SUM(gross_pay) - SUM(bonus) AS gaji,
          SUM(epf_m) AS epf_m, SUM(epf_p) AS epf_p,
          SUM(socso_m) AS socso_m, SUM(socso_p) AS socso_p,
          SUM(sip_m) AS sip_m, SUM(sip_p) AS sip_p,
          SUM(pcb) AS pcb,
          SUM(net) AS jumlah_gaji,
          SUM(CASE WHEN net > 0 THEN CEIL(net) ELSE net END) AS gaji_bersih
        FROM per
        GROUP BY grp
      `;
      const result = await pool.query(summaryQuery, [yearInt, monthInt]);

      const num = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
      const buildRow = (r) => {
        const row = {
          gaji: num(r.gaji),
          bonus: num(r.bonus),
          gaji_kasar: num(r.gaji_kasar),
          epf_m: num(r.epf_m),
          epf_p: num(r.epf_p),
          epf_total: num(num(r.epf_m) + num(r.epf_p)),
          socso_m: num(r.socso_m),
          socso_p: num(r.socso_p),
          socso_total: num(num(r.socso_m) + num(r.socso_p)),
          sip_m: num(r.sip_m),
          sip_p: num(r.sip_p),
          sip_total: num(num(r.sip_m) + num(r.sip_p)),
          pcb: num(r.pcb),
          jumlah_gaji: num(r.jumlah_gaji),
          digenapkan: num(num(r.gaji_bersih) - num(r.jumlah_gaji)),
          gaji_bersih: num(r.gaji_bersih),
        };
        // Voucher total = gross + rounding + employer contributions (matches the
        // JVDR/JVSL voucher's balancing total, independent of account mappings).
        row.jv_total = num(
          row.gaji_kasar + row.digenapkan + row.epf_m + row.socso_m + row.sip_m
        );
        return row;
      };

      const emptyRow = () =>
        buildRow({
          gaji: 0, bonus: 0, gaji_kasar: 0, epf_m: 0, epf_p: 0, socso_m: 0,
          socso_p: 0, sip_m: 0, sip_p: 0, pcb: 0, jumlah_gaji: 0, gaji_bersih: 0,
        });

      const director = result.rows.find((r) => r.grp === "director");
      const workers = result.rows.find((r) => r.grp === "workers");
      const directorRow = director ? buildRow(director) : emptyRow();
      const workersRow = workers ? buildRow(workers) : emptyRow();

      const totalRow = {};
      Object.keys(directorRow).forEach((k) => {
        totalRow[k] = num(directorRow[k] + workersRow[k]);
      });

      const monthStr = monthInt.toString().padStart(2, "0");
      const yearStr = yearInt.toString().slice(-2);

      res.json({
        year: yearInt,
        month: monthInt,
        jvdr_ref: `JVDR/${monthStr}/${yearStr}`,
        jvsl_ref: `JVSL/${monthStr}/${yearStr}`,
        director: directorRow,
        workers: workersRow,
        total: totalRow,
        jvdr_total: directorRow.jv_total,
        jvsl_total: workersRow.jv_total,
        grand_total: num(directorRow.jv_total + workersRow.jv_total),
      });
    } catch (error) {
      console.error("Error building payroll summary:", error);
      res.status(500).json({
        message: "Error building payroll summary",
        error: error.message,
      });
    }
  });

  // POST /generate - Generate journal vouchers for a month
  router.post("/generate", async (req, res) => {
    const { year, month, voucher_types = ["JVDR", "JVSL"] } = req.body;

    if (!year || !month) {
      return res.status(400).json({ message: "year and month are required" });
    }

    const yearInt = parseInt(year);
    const monthInt = parseInt(month);
    const monthStr = monthInt.toString().padStart(2, "0");
    const yearStr = yearInt.toString().slice(-2);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const results = {
        jvdr: null,
        jvsl: null,
      };

      // Get salary data by location from employee_payrolls using job-based location mapping
      // Directors are excluded from JVSL (they go to JVDR with individual breakdown)
      const salaryQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        employee_data AS (
          SELECT
            ep.id as employee_payroll_id,
            ep.employee_id,
            ep.job_type,
            COALESCE(jlm.location_code, '02') as location_id,
            ep.gross_pay,
            ep.net_pay
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          LEFT JOIN job_location_map jlm ON ep.job_type = jlm.job_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        -- Staff data (for JVSL) - excludes directors
        staff_data AS (
          SELECT
            ed.*
          FROM employee_data ed
          WHERE ed.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        deductions_data AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        -- Commission MEE/BH split for locations 03 and 04
        commission_split AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(CASE WHEN p.type = 'MEE' THEN pi.amount ELSE 0 END), 0) as commission_mee,
            COALESCE(SUM(CASE WHEN p.type = 'BH' THEN pi.amount ELSE 0 END), 0) as commission_bh
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          LEFT JOIN product_pay_codes ppc ON pi.pay_code_id = ppc.pay_code_id
          LEFT JOIN products p ON ppc.product_id = p.id
          WHERE sd.location_id IN ('03', '04')
            AND p.type IN ('MEE', 'BH')
          GROUP BY sd.location_id
        ),
        -- Cuti Tahunan by location
        cuti_tahunan_data AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(lr.amount_paid), 0) as cuti_tahunan_amount
          FROM staff_data sd
          JOIN leave_records lr ON sd.employee_id = lr.employee_id
          WHERE lr.leave_type = 'cuti_tahunan'
            AND lr.status = 'approved'
            AND lr.amount_paid > 0
            AND EXTRACT(YEAR FROM lr.leave_date) = $1
            AND EXTRACT(MONTH FROM lr.leave_date) = $2
          GROUP BY sd.location_id
        ),
        -- Salary amounts by location (excluding overtime and commission-related pay codes)
        salary_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as salary_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          LEFT JOIN product_pay_codes ppc ON pi.pay_code_id = ppc.pay_code_id
          WHERE pc.pay_type IN ('Base', 'Tambahan')
            AND ppc.pay_code_id IS NULL  -- Exclude commission-related pay codes linked to products
          GROUP BY sd.location_id
        ),
        -- Overtime amounts by location
        overtime_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as overtime_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pc.pay_type = 'Overtime'
          GROUP BY sd.location_id
        ),
        -- Commission records data (bonus and commission from commission_records table)
        -- Bonuses (location_code IS NULL) go to employee's job-based location (same as payroll)
        -- This ensures bonuses align with payroll data and have matching account mappings
        -- Commissions (location_code 16-24) go to their specific location with 'salary' mapping
        bonus_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(cr.amount), 0) as bonus_amount
          FROM commission_records cr
          JOIN staff_data sd ON cr.employee_id = sd.employee_id
          WHERE cr.location_code IS NULL
            AND EXTRACT(YEAR FROM cr.commission_date) = $1
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY sd.location_id
        ),
        commission_by_location AS (
          SELECT
            cr.location_code as location_id,
            COALESCE(SUM(cr.amount), 0) as commission_amount
          FROM commission_records cr
          WHERE cr.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
            AND cr.location_code IS NOT NULL
            AND EXTRACT(YEAR FROM cr.commission_date) = $1
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY cr.location_code
        ),
        -- Located commissions (16-24) grouped by the employee's JOB location — used to
        -- carve them out of the residual salary line, since they get their own debit
        -- lines at their commission location
        commission_by_job_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(cr.amount), 0) as commission_amount
          FROM commission_records cr
          JOIN staff_data sd ON cr.employee_id = sd.employee_id
          WHERE cr.location_code IS NOT NULL
            AND EXTRACT(YEAR FROM cr.commission_date) = $1
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY sd.location_id
        ),
        employee_summary AS (
          SELECT
            sd.employee_id,
            sd.location_id,
            sd.gross_pay,
            sd.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employee,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employee,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employee,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
          FROM staff_data sd
        )
        SELECT
          es.location_id,
          SUM(es.gross_pay) as total_gaji_kasar,
          SUM(es.epf_employer) as total_epf_majikan,
          SUM(es.epf_employee) as total_epf_pekerja,
          SUM(es.socso_employer) as total_socso_majikan,
          SUM(es.socso_employee) as total_socso_pekerja,
          SUM(es.sip_employer) as total_sip_majikan,
          SUM(es.sip_employee) as total_sip_pekerja,
          SUM(es.pcb) as total_pcb,
          SUM(es.net_pay) as total_gaji_bersih,
          COALESCE((SELECT cs.commission_mee FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_mee,
          COALESCE((SELECT cs.commission_bh FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_bh,
          COALESCE((SELECT ct.cuti_tahunan_amount FROM cuti_tahunan_data ct WHERE ct.location_id = es.location_id), 0) as cuti_tahunan,
          COALESCE((SELECT sl.salary_amount FROM salary_by_location sl WHERE sl.location_id = es.location_id), 0) as salary_amount,
          COALESCE((SELECT ol.overtime_amount FROM overtime_by_location ol WHERE ol.location_id = es.location_id), 0) as overtime_amount,
          COALESCE((SELECT bl.bonus_amount FROM bonus_by_location bl WHERE bl.location_id = es.location_id), 0) as bonus_amount,
          COALESCE((SELECT cj.commission_amount FROM commission_by_job_location cj WHERE cj.location_id = es.location_id), 0) as located_commission_amount
        FROM employee_summary es
        GROUP BY es.location_id
        ORDER BY es.location_id
      `;

      // Also get commission_records by their own location codes (16-24)
      const commissionQuery = `
        SELECT
          cr.location_code as location_id,
          COALESCE(SUM(cr.amount), 0) as commission_amount
        FROM commission_records cr
        WHERE cr.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
          AND cr.location_code IS NOT NULL
          AND EXTRACT(YEAR FROM cr.commission_date) = $1
          AND EXTRACT(MONTH FROM cr.commission_date) = $2
        GROUP BY cr.location_code
      `;

      const salaryResult = await client.query(salaryQuery, [yearInt, monthInt]);
      const commissionResult = await client.query(commissionQuery, [yearInt, monthInt]);

      // Build a map of commission amounts by location
      const commissionByLocation = {};
      commissionResult.rows.forEach(row => {
        commissionByLocation[row.location_id] = parseFloat(row.commission_amount) || 0;
      });

      // Get individual director data for JVDR
      const directorQuery = `
        WITH director_payroll AS (
          SELECT
            s.id as employee_id,
            s.name as employee_name,
            ep.gross_pay,
            ep.net_pay,
            CASE
              WHEN s.id = 'GOH' THEN 'GTH'
              WHEN s.id = 'WONG' THEN 'WSF'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'WG'
            END as director_code,
            CASE
              WHEN s.id = 'GOH' THEN 'Salary Director - GOH'
              WHEN s.id = 'WONG' THEN 'Salary Director - WONG'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'Salary Ex.Director - WINNIE.G'
            END as particulars
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          WHERE mp.year = $1 AND mp.month = $2
            AND s.id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        director_deductions AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
            AND ep.employee_id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        )
        SELECT
          dp.employee_id,
          dp.employee_name,
          dp.director_code,
          dp.particulars,
          dp.gross_pay,
          dp.net_pay,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employee,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employee,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employee,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
        FROM director_payroll dp
        ORDER BY dp.director_code
      `;
      const directorResult = await client.query(directorQuery, [yearInt, monthInt]);

      // Get mappings
      const mappingsResult = await client.query(
        "SELECT * FROM location_account_mappings WHERE is_active = true"
      );
      const mappingsByLocation = {};
      // location_id -> display name (from the mapping's location_name, e.g. "SALESMAN")
      const genLocationNames = {};
      mappingsResult.rows.forEach(m => {
        const key = `${m.voucher_type}_${m.location_id}`;
        if (!mappingsByLocation[key]) {
          mappingsByLocation[key] = {};
        }
        mappingsByLocation[key][m.mapping_type] = m.account_code;
        if (m.voucher_type === "JVSL" && m.location_name && !genLocationNames[m.location_id]) {
          genLocationNames[m.location_id] = m.location_name;
        }
      });
      // Fall back to the locations master table for any name not on a mapping
      const genLocResult = await client.query(`SELECT id, name FROM locations`);
      genLocResult.rows.forEach((l) => {
        if (!genLocationNames[l.id]) genLocationNames[l.id] = l.name;
      });

      const staffAccruals = mappingsByLocation["JVSL_00"] || {};
      // Use direct string formatting to avoid timezone issues with Date.toISOString()
      const entryDate = `${yearInt}-${monthStr}-01`;

      // Generate JVDR if requested
      if (voucher_types.includes("JVDR")) {
        const jvdrRef = `JVDR/${monthStr}/${yearStr}`;

        // Check if exists
        const existingJvdr = await client.query(
          "SELECT id FROM journal_entries WHERE reference_no = $1",
          [jvdrRef]
        );

        if (existingJvdr.rows.length > 0) {
          results.jvdr = { skipped: true, message: "JVDR already exists for this month" };
        } else {
          // Create JVDR entry using individual director data
          if (directorResult.rows.length > 0) {
            const directorMappings = mappingsByLocation["JVDR_01"] || {};

            // Build the exact posting lines with the shared builder (same output the
            // preview shows). Guard before inserting anything.
            const jvdr = buildJvdrLines(directorResult.rows, directorMappings);
            if (jvdr.unmapped.length > 0 || Math.abs(jvdr.totalDebit - jvdr.totalCredit) > 0.01) {
              await client.query("ROLLBACK");
              const detail = jvdr.unmapped.length > 0 ? ` Unmapped amounts: ${jvdr.unmapped.join("; ")}.` : "";
              return res.status(400).json({
                message: `JVDR voucher is out of balance (DR ${jvdr.totalDebit.toFixed(2)} vs CR ${jvdr.totalCredit.toFixed(2)}). Check the JVDR account mappings in Location Account Mappings, then generate again.${detail}`,
              });
            }

            const entryResult = await client.query(
              `INSERT INTO journal_entries (reference_no, entry_date, entry_type, description, status, created_by, posted_at, posted_by)
               VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $6) RETURNING id`,
              [jvdrRef, entryDate, "JVDR", `Director's Remuneration - ${monthStr}/${yearInt}`, "posted", req.staffId || null]
            );
            const entryId = entryResult.rows[0].id;

            let lineNumber = 1;
            for (const line of jvdr.lines) {
              await client.query(
                `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entryId, lineNumber++, line.account_code, line.debit, line.credit, line.particulars]
              );
            }

            await client.query(
              `UPDATE journal_entries SET total_debit = $1, total_credit = $2 WHERE id = $3`,
              [jvdr.totalDebit, jvdr.totalCredit, entryId]
            );

            results.jvdr = { created: true, id: entryId, reference: jvdrRef };
          } else {
            results.jvdr = { skipped: true, message: "No director salary data for this month" };
          }
        }
      }

      // Generate JVSL if requested
      if (voucher_types.includes("JVSL")) {
        const jvslRef = `JVSL/${monthStr}/${yearStr}`;

        const existingJvsl = await client.query(
          "SELECT id FROM journal_entries WHERE reference_no = $1",
          [jvslRef]
        );

        if (existingJvsl.rows.length > 0) {
          results.jvsl = { skipped: true, message: "JVSL already exists for this month" };
        } else {
          // Build the exact posting lines with the shared builder (same output the
          // preview shows) from the monthly Salary Report. Guard before inserting.
          const salaryReport = await computeMonthlySalaryReport(pool, yearInt, monthInt);
          const jellyByLoc = await computeJellyByLocation(pool, yearInt, monthInt, salaryReport);
          const jvsl = buildJvslFromSalaryReport(salaryReport, mappingsByLocation, staffAccruals, jellyByLoc);
          const hasStaff = jvsl.lines.length > 0;

          if (hasStaff) {
            if (jvsl.unmapped.length > 0 || Math.abs(jvsl.totalDebit - jvsl.totalCredit) > 0.01) {
              await client.query("ROLLBACK");
              const detail = jvsl.unmapped.length > 0 ? ` Unmapped amounts: ${jvsl.unmapped.join("; ")}.` : "";
              return res.status(400).json({
                message: `JVSL voucher is out of balance (DR ${jvsl.totalDebit.toFixed(2)} vs CR ${jvsl.totalCredit.toFixed(2)}). Configure the missing mappings in Location Account Mappings, then generate again.${detail}`,
              });
            }

            const entryResult = await client.query(
              `INSERT INTO journal_entries (reference_no, entry_date, entry_type, description, status, created_by, posted_at, posted_by)
               VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $6) RETURNING id`,
              [jvslRef, entryDate, "JVSL", `Staff Salary Wages - ${monthStr}/${yearInt}`, "posted", req.staffId || null]
            );
            const entryId = entryResult.rows[0].id;

            let lineNumber = 1;
            for (const line of jvsl.lines) {
              await client.query(
                `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entryId, lineNumber++, line.account_code, line.debit, line.credit, line.particulars]
              );
            }

            await client.query(
              `UPDATE journal_entries SET total_debit = $1, total_credit = $2 WHERE id = $3`,
              [jvsl.totalDebit, jvsl.totalCredit, entryId]
            );

            results.jvsl = { created: true, id: entryId, reference: jvslRef };
          } else {
            results.jvsl = { skipped: true, message: "No staff salary data for this month" };
          }
        }
      }

      await client.query("COMMIT");

      res.json({
        message: "Voucher generation completed",
        results,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error generating vouchers:", error);
      res.status(500).json({
        message: "Error generating vouchers",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // GET /check/:year/:month - Check if vouchers exist for a month
  router.get("/check/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);
      const monthStr = monthInt.toString().padStart(2, "0");
      const yearStr = yearInt.toString().slice(-2);

      const query = `
        SELECT reference_no, id, entry_date, status
        FROM journal_entries
        WHERE reference_no IN ($1, $2)
      `;

      const result = await pool.query(query, [
        `JVDR/${monthStr}/${yearStr}`,
        `JVSL/${monthStr}/${yearStr}`,
      ]);

      const vouchers = {};
      result.rows.forEach(row => {
        if (row.reference_no.startsWith("JVDR")) {
          vouchers.jvdr = row;
        } else if (row.reference_no.startsWith("JVSL")) {
          vouchers.jvsl = row;
        }
      });

      res.json(vouchers);
    } catch (error) {
      console.error("Error checking vouchers:", error);
      res.status(500).json({
        message: "Error checking vouchers",
        error: error.message,
      });
    }
  });

  return router;
}
