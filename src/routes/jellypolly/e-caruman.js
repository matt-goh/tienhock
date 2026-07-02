// src/routes/jellypolly/e-caruman.js
// Jelly Polly E-Caruman statutory exports (Phase 6): EPF (KWSP CSV),
// combined SOCSO + EIS/SIP + SKBBK (PERKESO fixed-width), PCB (LHDN CP39).
//
// Mirrors src/routes/payroll/e-caruman.js but on the jellypolly schema. The
// fixed-width / CSV format generators are copied verbatim from the TH route so
// the statutory file layouts stay byte-identical (compliance-critical) and the
// TH route is left untouched. Employer registration codes are GT-specific and
// stored in jellypolly.payroll_settings (editable on the JP E-Caruman page).
import { Router } from "express";

const SETTING_KEYS = {
  perkeso_employer_code: "ecaruman_perkeso_employer_code",
  mycoid_ssm: "ecaruman_mycoid_ssm",
  lhdn_e_number: "ecaruman_lhdn_e_number",
};

export default function (pool) {
  const router = Router();

  // ---- Format helpers + generators (verbatim from the Tien Hock route) ----
  const formatIC = (ic) => {
    if (!ic) return "";
    const digits = ic.replace(/\D/g, "");
    if (digits.length !== 12) return ic;
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 12)}`;
  };

  const generateCSVContent = (rows) => {
    let csvContent = "Member No,IC No,Name,Salary,EM Share,EMP Share\n";
    rows.forEach((row) => {
      const memberNo = row.member_no || "";
      const icNo = formatIC(row.ic_no);
      const name = (row.name || "").replace(/,/g, " ");
      const salary = parseFloat(row.salary || 0).toFixed(2);
      const emShare = Math.round(parseFloat(row.em_share || 0));
      const empShare = Math.round(parseFloat(row.emp_share || 0));
      csvContent += `${memberNo},${icNo},${name},${salary},${emShare},${empShare}\n`;
    });
    return csvContent;
  };

  const stripIC = (ic) => (ic ? ic.replace(/\D/g, "") : "");
  const padLeft = (str, length) =>
    String(str || "").substring(0, length).padEnd(length, " ");
  const padRight = (str, length) =>
    String(str || "").substring(0, length).padStart(length, "0");
  const toCents = (amount) => Math.round(parseFloat(amount || 0) * 100);

  const generateCombinedSOCSOSIPContent = (
    rows,
    employerCode,
    myCoId,
    month,
    year
  ) => {
    const lines = [];
    const monthContribution = String(month).padStart(2, "0") + String(year);
    rows.forEach((row) => {
      const isForeign = (row.nationality || "").toLowerCase() !== "malaysian";
      const idNumber = isForeign ? row.socso_no || row.ic_no : row.ic_no;
      const field1 = padLeft(employerCode, 12);
      const field2 = padLeft(myCoId || "", 20);
      const field3 = padLeft(stripIC(idNumber), 12);
      const field4 = padLeft(row.name, 150);
      const field5 = monthContribution;
      const field6 = padRight(toCents(row.salary), 14);
      const field7 = padRight(toCents(row.socso_employer), 6);
      const field8 = padRight(toCents(row.keilatan_amount), 6);
      const field9 = padRight(toCents(row.eis_employer), 6);
      const field10 = padRight(toCents(row.eis_employee), 6);
      const field11 = padRight(toCents(row.skbbk_amount), 6);
      const field12 = "".padEnd(14, " ");
      const field13 = "".padEnd(20, " ");
      lines.push(
        field1 + field2 + field3 + field4 + field5 + field6 + field7 +
          field8 + field9 + field10 + field11 + field12 + field13
      );
    });
    return lines.join("\n");
  };

  const stripTaxPrefix = (taxNo) =>
    taxNo ? taxNo.replace(/^[A-Za-z]+-/, "") : "";
  const normalizeEmployerNumber = (employerNumber) =>
    padRight(String(employerNumber || "").replace(/\D/g, ""), 10);
  const normalizeTaxNumber = (taxNo) => {
    const valueWithoutPrefix = stripTaxPrefix(taxNo);
    const explicitWifeCode = valueWithoutPrefix.match(/\((\d)\)\s*$/)?.[1];
    const digits = valueWithoutPrefix.replace(/\D/g, "");
    if (!digits) return "00000000000";
    if (explicitWifeCode) {
      const taxReference = digits.slice(0, -1).padStart(10, "0").slice(-10);
      return `${taxReference}${explicitWifeCode}`;
    }
    if (digits.length <= 10) {
      return `${digits.padStart(10, "0").slice(-10)}0`;
    }
    return digits.padStart(11, "0").slice(-11);
  };
  const normalizePassport = (passport) =>
    String(passport || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const normalizeNewICNumber = (icNo) => {
    const digits = stripIC(icNo);
    return digits.length === 12 ? digits : "";
  };
  const isMalaysianNationality = (nationality) =>
    String(nationality || "").toLowerCase() === "malaysian";
  const getCountryCode = (nationality) => {
    const n = String(nationality || "").trim().toLowerCase();
    const codes = {
      bangladesh: "BD", bangladeshi: "BD", cambodia: "KH", cambodian: "KH",
      china: "CN", chinese: "CN", india: "IN", indian: "IN", indonesia: "ID",
      indonesian: "ID", myanmar: "MM", nepal: "NP", nepalese: "NP",
      pakistani: "PK", pakistan: "PK", philippines: "PH", filipino: "PH",
      philippine: "PH", thailand: "TH", thai: "TH", vietnam: "VN",
      vietnamese: "VN",
    };
    return codes[n] || "";
  };

  const generateLHDNContent = (rows, eNumber, month, year, hqENumber = eNumber) => {
    const lines = [];
    let totalPCBCents = 0;
    rows.forEach((row) => {
      totalPCBCents += toCents(row.pcb_amount || 0);
    });
    const headerLine =
      "H" +
      normalizeEmployerNumber(hqENumber) +
      normalizeEmployerNumber(eNumber) +
      String(year) +
      String(month).padStart(2, "0") +
      padRight(totalPCBCents, 10) +
      padRight(rows.length, 5) +
      padRight(0, 10) +
      padRight(0, 5);
    lines.push(headerLine);
    rows.forEach((row) => {
      const taxNumber = normalizeTaxNumber(row.income_tax_no);
      const taxReference = taxNumber.slice(0, 10);
      const wifeCode = taxNumber.slice(10, 11);
      const name = padLeft((row.name || "").toUpperCase(), 60);
      const isMalaysian = isMalaysianNationality(row.nationality);
      const oldICNumber = padLeft("", 12);
      const newICNumber = isMalaysian
        ? padLeft(normalizeNewICNumber(row.ic_no), 12)
        : padLeft("", 12);
      const passportNumber = !isMalaysian
        ? padLeft(normalizePassport(row.ic_no), 12)
        : padLeft("", 12);
      const countryCode = !isMalaysian
        ? padLeft(getCountryCode(row.nationality), 2)
        : padLeft("", 2);
      const pcbAmountCents = padRight(toCents(row.pcb_amount || 0), 8);
      const cp38AmountCents = padRight(0, 8);
      const employeeId = padLeft(String(row.employee_id || "").toUpperCase(), 10);
      lines.push(
        "D" + taxReference + wifeCode + name + oldICNumber + newICNumber +
          passportNumber + countryCode + pcbAmountCents + cp38AmountCents +
          employeeId
      );
    });
    return lines.join("\n");
  };

  // ---- Settings (JP employer registration codes, stored in payroll_settings) ----
  router.get("/settings", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT setting_key, setting_value FROM jellypolly.payroll_settings
         WHERE setting_key = ANY($1)`,
        [Object.values(SETTING_KEYS)]
      );
      const byKey = {};
      result.rows.forEach((r) => {
        byKey[r.setting_key] = r.setting_value;
      });
      res.json({
        perkeso_employer_code: byKey[SETTING_KEYS.perkeso_employer_code] || "",
        mycoid_ssm: byKey[SETTING_KEYS.mycoid_ssm] || "",
        lhdn_e_number: byKey[SETTING_KEYS.lhdn_e_number] || "",
      });
    } catch (error) {
      console.error("Error fetching JP e-caruman settings:", error);
      res.status(500).json({ message: "Error fetching settings", error: error.message });
    }
  });

  router.put("/settings", async (req, res) => {
    const { perkeso_employer_code, mycoid_ssm, lhdn_e_number } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const upsert = `
        INSERT INTO jellypolly.payroll_settings (setting_key, setting_value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (setting_key) DO UPDATE
          SET setting_value = EXCLUDED.setting_value, updated_at = now()
      `;
      await client.query(upsert, [
        SETTING_KEYS.perkeso_employer_code,
        perkeso_employer_code || "",
        "PERKESO employer code for E-Caruman SOCSO/EIS export",
      ]);
      await client.query(upsert, [
        SETTING_KEYS.mycoid_ssm,
        mycoid_ssm || "",
        "MyCoID / SSM number for E-Caruman SOCSO/EIS export",
      ]);
      await client.query(upsert, [
        SETTING_KEYS.lhdn_e_number,
        lhdn_e_number || "",
        "LHDN E-number for E-Caruman PCB export",
      ]);
      await client.query("COMMIT");
      res.json({ message: "Settings saved" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving JP e-caruman settings:", error);
      res.status(500).json({ message: "Error saving settings", error: error.message });
    } finally {
      client.release();
    }
  });

  // ---- Combined preview ----
  router.get("/preview", async (req, res) => {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }
    try {
      const epfQuery = `
        SELECT DISTINCT ON (s.id)
          s.id as employee_id, s.epf_no as member_no, s.ic_no, s.name,
          pd.wage_amount as salary, pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        JOIN jellypolly.payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1 AND mp.year = $2
          AND s.epf_no IS NOT NULL AND s.epf_no != '' AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;
      const missingEpfNoQuery = `
        SELECT DISTINCT ON (s.id)
          s.id as employee_id, s.name, s.nationality,
          pd.employee_amount as emp_share, pd.employer_amount as em_share
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        JOIN jellypolly.payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1 AND mp.year = $2
          AND (s.epf_no IS NULL OR s.epf_no = '') AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;
      const socsoQuery = `
        SELECT
          s.id as employee_id, s.ic_no, s.socso_no, s.nationality, s.name,
          COALESCE(socso.wage_amount, sip.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee,
          COALESCE((socso.rate_info->>'keilatan_amount')::numeric, socso.employee_amount, 0) as keilatan_amount,
          COALESCE((socso.rate_info->>'skbbk_amount')::numeric, 0) as skbbk_amount,
          COALESCE(sip.employer_amount, 0) as eis_employer,
          COALESCE(sip.employee_amount, 0) as eis_employee
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        LEFT JOIN jellypolly.payroll_deductions socso ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN jellypolly.payroll_deductions sip ON sip.employee_payroll_id = ep.id AND sip.deduction_type = 'sip'
        WHERE mp.month = $1 AND mp.year = $2
          AND ((s.ic_no IS NOT NULL AND s.ic_no != '') OR (s.socso_no IS NOT NULL AND s.socso_no != ''))
          AND ((socso.employer_amount IS NOT NULL AND socso.employer_amount > 0)
               OR (socso.employee_amount IS NOT NULL AND socso.employee_amount > 0))
        ORDER BY s.name
      `;
      const sipQuery = `
        SELECT
          s.id as employee_id, s.ic_no, s.name, s.date_joined,
          COALESCE(sip.employer_amount, 0) as eis_employer,
          COALESCE(sip.employee_amount, 0) as eis_employee
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        JOIN jellypolly.payroll_deductions sip ON sip.employee_payroll_id = ep.id AND sip.deduction_type = 'sip'
        WHERE mp.month = $1 AND mp.year = $2
          AND s.ic_no IS NOT NULL AND s.ic_no != '' AND s.nationality = 'Malaysian'
          AND ((sip.employer_amount IS NOT NULL AND sip.employer_amount > 0)
               OR (sip.employee_amount IS NOT NULL AND sip.employee_amount > 0))
        ORDER BY s.name
      `;
      const incomeTaxQuery = `
        SELECT
          s.id as employee_id, s.ic_no, s.income_tax_no, s.nationality, s.name,
          COALESCE(pcb.employee_amount, 0) as pcb_amount
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        JOIN jellypolly.payroll_deductions pcb ON pcb.employee_payroll_id = ep.id AND pcb.deduction_type = 'income_tax'
        WHERE mp.month = $1 AND mp.year = $2
          AND s.income_tax_no IS NOT NULL AND s.income_tax_no != ''
          AND pcb.employee_amount IS NOT NULL AND pcb.employee_amount > 0
        ORDER BY s.name
      `;

      const [epfResult, socsoResult, sipResult, incomeTaxResult, missingEpfNoResult] =
        await Promise.all([
          pool.query(epfQuery, [month, year]),
          pool.query(socsoQuery, [month, year]),
          pool.query(sipQuery, [month, year]),
          pool.query(incomeTaxQuery, [month, year]),
          pool.query(missingEpfNoQuery, [month, year]),
        ]);

      const epfTotals = epfResult.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.em_share += parseFloat(row.em_share || 0);
          acc.emp_share += parseFloat(row.emp_share || 0);
          return acc;
        },
        { salary: 0, em_share: 0, emp_share: 0 }
      );
      const socsoTotals = socsoResult.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.socso_employer += parseFloat(row.socso_employer || 0);
          acc.socso_employee += parseFloat(row.socso_employee || 0);
          acc.keilatan_amount += parseFloat(row.keilatan_amount || 0);
          acc.skbbk_amount += parseFloat(row.skbbk_amount || 0);
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        { salary: 0, socso_employer: 0, socso_employee: 0, keilatan_amount: 0, skbbk_amount: 0, eis_employer: 0, eis_employee: 0 }
      );
      const sipTotals = sipResult.rows.reduce(
        (acc, row) => {
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        { eis_employer: 0, eis_employee: 0 }
      );
      const incomeTaxTotals = incomeTaxResult.rows.reduce(
        (acc, row) => {
          acc.pcb_amount += parseFloat(row.pcb_amount || 0);
          return acc;
        },
        { pcb_amount: 0 }
      );

      res.json({
        epf: epfResult.rows.length > 0 ? {
          count: epfResult.rows.length,
          data: epfResult.rows.map((row) => ({
            ...row,
            salary: parseFloat(row.salary || 0),
            em_share: parseFloat(row.em_share || 0),
            emp_share: parseFloat(row.emp_share || 0),
          })),
          totals: {
            salary: epfTotals.salary,
            em_share: Math.round(epfTotals.em_share),
            emp_share: Math.round(epfTotals.emp_share),
            total_contribution: Math.round(epfTotals.em_share + epfTotals.emp_share),
          },
        } : null,
        socso: socsoResult.rows.length > 0 ? {
          count: socsoResult.rows.length,
          data: socsoResult.rows.map((row) => ({
            ...row,
            salary: parseFloat(row.salary || 0),
            socso_employer: parseFloat(row.socso_employer || 0),
            socso_employee: parseFloat(row.socso_employee || 0),
            keilatan_amount: parseFloat(row.keilatan_amount || 0),
            skbbk_amount: parseFloat(row.skbbk_amount || 0),
            eis_employer: parseFloat(row.eis_employer || 0),
            eis_employee: parseFloat(row.eis_employee || 0),
          })),
          totals: {
            salary: socsoTotals.salary,
            socso_employer: Math.round(socsoTotals.socso_employer * 100) / 100,
            socso_employee: Math.round(socsoTotals.socso_employee * 100) / 100,
            socso_total: Math.round((socsoTotals.socso_employer + socsoTotals.socso_employee) * 100) / 100,
            keilatan_amount: Math.round(socsoTotals.keilatan_amount * 100) / 100,
            skbbk_amount: Math.round(socsoTotals.skbbk_amount * 100) / 100,
            eis_employer: Math.round(socsoTotals.eis_employer * 100) / 100,
            eis_employee: Math.round(socsoTotals.eis_employee * 100) / 100,
            eis_total: Math.round((socsoTotals.eis_employer + socsoTotals.eis_employee) * 100) / 100,
            total_contribution: Math.round((socsoTotals.socso_employer + socsoTotals.socso_employee + socsoTotals.eis_employer + socsoTotals.eis_employee) * 100) / 100,
          },
        } : null,
        sip: sipResult.rows.length > 0 ? {
          count: sipResult.rows.length,
          data: sipResult.rows.map((row) => ({
            ...row,
            eis_employer: parseFloat(row.eis_employer || 0),
            eis_employee: parseFloat(row.eis_employee || 0),
            sip_total: parseFloat(row.eis_employer || 0) + parseFloat(row.eis_employee || 0),
          })),
          totals: {
            eis_employer: Math.round(sipTotals.eis_employer * 100) / 100,
            eis_employee: Math.round(sipTotals.eis_employee * 100) / 100,
            sip_total: Math.round((sipTotals.eis_employer + sipTotals.eis_employee) * 100) / 100,
          },
        } : null,
        income_tax: incomeTaxResult.rows.length > 0 ? {
          count: incomeTaxResult.rows.length,
          data: incomeTaxResult.rows.map((row) => ({
            ...row,
            pcb_amount: parseFloat(row.pcb_amount || 0),
          })),
          totals: { pcb_amount: Math.round(incomeTaxTotals.pcb_amount * 100) / 100 },
        } : null,
        missing_epf_no: missingEpfNoResult.rows.length > 0 ? {
          count: missingEpfNoResult.rows.length,
          data: missingEpfNoResult.rows.map((row) => ({
            employee_id: row.employee_id,
            name: row.name,
            nationality: row.nationality,
            emp_share: parseFloat(row.emp_share || 0),
            em_share: parseFloat(row.em_share || 0),
          })),
        } : null,
      });
    } catch (error) {
      console.error("Error fetching JP e-caruman preview:", error);
      res.status(500).json({ message: "Error fetching preview data", error: error.message });
    }
  });

  // ---- EPF export (EPFORMA2.csv, WARGANEGARA / WARGA ASING) ----
  router.get("/epf/export", async (req, res) => {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }
    try {
      const query = `
        SELECT DISTINCT ON (s.id)
          s.epf_no as member_no, s.ic_no, s.name, s.nationality,
          pd.wage_amount as salary, pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        JOIN jellypolly.payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1 AND mp.year = $2
          AND s.epf_no IS NOT NULL AND s.epf_no != '' AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;
      const result = await pool.query(query, [month, year]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "No EPF contribution data found for the specified period" });
      }
      const localRows = result.rows.filter(
        (row) => (row.nationality || "").toLowerCase() === "malaysian"
      );
      const foreignRows = result.rows.filter(
        (row) => (row.nationality || "").toLowerCase() !== "malaysian"
      );
      const monthStr = String(month).padStart(2, "0");
      const files = [];
      if (localRows.length > 0) {
        files.push({
          path: `EPF/${year}/GT/${monthStr}/WARGANEGARA`,
          filename: "EPFORMA2.csv",
          content: generateCSVContent(localRows),
          count: localRows.length,
        });
      }
      if (foreignRows.length > 0) {
        files.push({
          path: `EPF/${year}/GT/${monthStr}/WARGA ASING`,
          filename: "EPFORMA2.csv",
          content: generateCSVContent(foreignRows),
          count: foreignRows.length,
        });
      }
      res.json({
        success: true, year, month: monthStr, company: "GT", files,
        totalLocal: localRows.length, totalForeign: foreignRows.length,
      });
    } catch (error) {
      console.error("Error generating JP EPF export:", error);
      res.status(500).json({ message: "Error generating EPF export data", error: error.message });
    }
  });

  // ---- Combined SOCSO + EIS/SIP export (PERKESO .TXT) ----
  router.get("/socso-sip/export", async (req, res) => {
    const { month, year, employerCode, myCoId } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }
    if (!employerCode) {
      return res.status(400).json({ message: "Employer code is required for SOCSO-SIP export" });
    }
    try {
      const query = `
        SELECT
          s.id as employee_id, s.ic_no, s.socso_no, s.nationality, s.name,
          COALESCE(socso.wage_amount, sip.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee_total,
          COALESCE((socso.rate_info->>'keilatan_amount')::numeric, socso.employee_amount, 0) as keilatan_amount,
          COALESCE((socso.rate_info->>'skbbk_amount')::numeric, 0) as skbbk_amount,
          COALESCE(sip.employer_amount, 0) as eis_employer,
          COALESCE(sip.employee_amount, 0) as eis_employee
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        LEFT JOIN jellypolly.payroll_deductions socso ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN jellypolly.payroll_deductions sip ON sip.employee_payroll_id = ep.id AND sip.deduction_type = 'sip'
        WHERE mp.month = $1 AND mp.year = $2
          AND ((s.ic_no IS NOT NULL AND s.ic_no != '') OR (s.socso_no IS NOT NULL AND s.socso_no != ''))
          AND (COALESCE(socso.employer_amount, 0) > 0 OR COALESCE(socso.employee_amount, 0) > 0
               OR COALESCE(sip.employer_amount, 0) > 0 OR COALESCE(sip.employee_amount, 0) > 0)
        ORDER BY s.name
      `;
      const result = await pool.query(query, [month, year]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "No SOCSO / EIS contribution data found for the specified period" });
      }
      const monthStr = String(month).padStart(2, "0");
      const filePrefix = `${monthStr}${String(year).slice(-2)}`;
      const content = generateCombinedSOCSOSIPContent(result.rows, employerCode, myCoId, month, year);
      res.json({
        success: true, year, month: monthStr, company: "GT", employerCode, myCoId,
        files: [{
          path: `SOCSO-SIP/${year}/GT/${monthStr}`,
          filename: `SOCSO-SIP${filePrefix}.TXT`,
          content, count: result.rows.length,
        }],
        totalEmployees: result.rows.length,
      });
    } catch (error) {
      console.error("Error generating JP SOCSO-SIP export:", error);
      res.status(500).json({ message: "Error generating SOCSO-SIP export data", error: error.message });
    }
  });

  // ---- PCB / income tax export (LHDN CP39 .TXT) ----
  router.get("/income-tax/export", async (req, res) => {
    const { month, year, eNumber, hqENumber } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }
    if (!eNumber) {
      return res.status(400).json({ message: "E Number is required for Income Tax export" });
    }
    try {
      const query = `
        SELECT
          s.id as employee_id, s.ic_no, s.income_tax_no, s.nationality, s.name,
          COALESCE(pcb.employee_amount, 0) as pcb_amount
        FROM jellypolly.employee_payrolls ep
        JOIN jellypolly.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN public.staffs s ON ep.employee_id = s.id
        JOIN jellypolly.payroll_deductions pcb ON pcb.employee_payroll_id = ep.id AND pcb.deduction_type = 'income_tax'
        WHERE mp.month = $1 AND mp.year = $2
          AND s.income_tax_no IS NOT NULL AND s.income_tax_no != ''
          AND pcb.employee_amount IS NOT NULL AND pcb.employee_amount > 0
        ORDER BY s.name
      `;
      const result = await pool.query(query, [month, year]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "No Income Tax/PCB contribution data found for the specified period" });
      }
      const monthStr = String(month).padStart(2, "0");
      const content = generateLHDNContent(result.rows, eNumber, month, year, hqENumber || eNumber);
      const filePrefix = `${monthStr}${String(year).slice(-2)}`;
      res.json({
        success: true, year, month: monthStr, company: "GT",
        eNumber, hqENumber: hqENumber || eNumber,
        files: [{
          path: `PCB/${year}/GT/${monthStr}`,
          filename: `LHDN${filePrefix}.TXT`,
          content, count: result.rows.length,
        }],
        totalEmployees: result.rows.length,
        totals: { pcb_amount: Math.round(result.rows.reduce((a, r) => a + parseFloat(r.pcb_amount || 0), 0) * 100) / 100 },
      });
    } catch (error) {
      console.error("Error generating JP Income Tax export:", error);
      res.status(500).json({ message: "Error generating Income Tax export data", error: error.message });
    }
  });

  return router;
}
