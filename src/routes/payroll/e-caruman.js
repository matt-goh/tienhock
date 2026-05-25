// src/routes/payroll/e-caruman.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Format IC number as ######-##-#### (remove existing dashes first, then format)
  const formatIC = (ic) => {
    if (!ic) return "";
    // Remove all non-digits
    const digits = ic.replace(/\D/g, "");
    if (digits.length !== 12) return ic; // Return as-is if not 12 digits
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 12)}`;
  };

  // Generate CSV content from rows (for EPF)
  const generateCSVContent = (rows) => {
    let csvContent = "Member No,IC No,Name,Salary,EM Share,EMP Share\n";

    rows.forEach((row) => {
      const memberNo = row.member_no || "";
      const icNo = formatIC(row.ic_no);
      const name = (row.name || "").replace(/,/g, " "); // Replace commas in name
      const salary = parseFloat(row.salary || 0).toFixed(2);
      const emShare = Math.round(parseFloat(row.em_share || 0)); // Integer, no decimals
      const empShare = Math.round(parseFloat(row.emp_share || 0)); // Integer, no decimals

      csvContent += `${memberNo},${icNo},${name},${salary},${emShare},${empShare}\n`;
    });

    return csvContent;
  };

  // Remove dashes from IC number (for SOCSO format)
  const stripIC = (ic) => {
    if (!ic) return "";
    return ic.replace(/\D/g, "");
  };

  // Pad string left (for text fields)
  const padLeft = (str, length) => {
    const s = String(str || "");
    return s.substring(0, length).padEnd(length, " ");
  };

  // Pad string right (for numeric fields)
  const padRight = (str, length) => {
    const s = String(str || "");
    return s.substring(0, length).padStart(length, "0");
  };

  // Convert amount to cents (integer, no decimals)
  const toCents = (amount) => {
    return Math.round(parseFloat(amount || 0) * 100);
  };

  /**
   * Generate the combined SOCSO + EIS + SKBBK fixed-width text file
   * (PERKESO 2026 gazette format).
   * 278 characters per line, detail records only (no header/footer).
   *
   * Field layout (per PERKESO spec):
   *   1  Employer Code              12  pos 1-12     alphanumeric, left-justified
   *   2  MyCoID/SSM Number          20  pos 13-32    alphanumeric, left-justified (blank allowed)
   *   3  ID / SSFW No.              12  pos 33-44    IC for Malaysians, socso_no for foreigners
   *   4  Employee Name             150  pos 45-194   left-justified
   *   5  Month Contribution MMYYYY   6  pos 195-200
   *   6  Employee Salary (cents)    14  pos 201-214  numeric, right-justified (zero padded)
   *   7  SOCSO Employer (cents)      6  pos 215-220  numeric, right-justified
   *   8  SOCSO Employee (Keilatan)   6  pos 221-226  numeric, right-justified
   *   9  EIS Employer (cents)        6  pos 227-232  numeric, right-justified
   *  10  EIS Employee (cents)        6  pos 233-238  numeric, right-justified
   *  11  SKBBK Employee (cents)      6  pos 239-244  numeric, right-justified
   *  12  Filler 1                   14  pos 245-258  blank
   *  13  Filler 2                   20  pos 259-278  blank
   */
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
        field1 +
          field2 +
          field3 +
          field4 +
          field5 +
          field6 +
          field7 +
          field8 +
          field9 +
          field10 +
          field11 +
          field12 +
          field13
      );
    });

    return lines.join("\n");
  };

  /**
   * Strip prefix from tax number (e.g., "OG-07139779051" -> "07139779051")
   */
  const stripTaxPrefix = (taxNo) => {
    if (!taxNo) return "";
    // Remove any prefix like "OG-", "SG-", etc.
    return taxNo.replace(/^[A-Za-z]+-/, "");
  };

  const normalizeEmployerNumber = (employerNumber) => {
    return padRight(String(employerNumber || "").replace(/\D/g, ""), 10);
  };

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

  const normalizePassport = (passport) => {
    return String(passport || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
  };

  const normalizeNewICNumber = (icNo) => {
    const digits = stripIC(icNo);
    return digits.length === 12 ? digits : "";
  };

  const isMalaysianNationality = (nationality) => {
    return String(nationality || "").toLowerCase() === "malaysian";
  };

  const getCountryCode = (nationality) => {
    const normalizedNationality = String(nationality || "")
      .trim()
      .toLowerCase();

    const countryCodes = {
      bangladesh: "BD",
      bangladeshi: "BD",
      cambodia: "KH",
      cambodian: "KH",
      china: "CN",
      chinese: "CN",
      india: "IN",
      indian: "IN",
      indonesia: "ID",
      indonesian: "ID",
      myanmar: "MM",
      nepal: "NP",
      nepalese: "NP",
      pakistani: "PK",
      pakistan: "PK",
      philippines: "PH",
      filipino: "PH",
      philippine: "PH",
      thailand: "TH",
      thai: "TH",
      vietnam: "VN",
      vietnamese: "VN",
    };

    return countryCodes[normalizedNationality] || "";
  };

  /**
   * Generate LHDN fixed-width text file content (LHDN*.TXT).
   * Format follows the CP39 PCB fixed-width specification.
   *
   * Header Record (57 chars):
   * - H (1) pos 1
   * - E Number HQ (10) pos 2-11 - right justify with zeros
   * - E Number (10) pos 12-21 - right justify with zeros
   * - Year (4) pos 22-25
   * - Month (2) pos 26-27
   * - Total MTD Amount (10) pos 28-37 - cents, right justify with zeros
   * - Total MTD Records (5) pos 38-42 - right justify with zeros
   * - Total CP38 Amount (10) pos 43-52 - cents, right justify with zeros
   * - Total CP38 Records (5) pos 53-57 - right justify with zeros
   *
   * Detail Record (136 chars):
   * - D (1) pos 1
   * - Tax Reference No. (10) pos 2-11 - without prefix like "OG-"
   * - Wife Code (1) pos 12
   * - Employee Name (60) pos 13-72
   * - Old IC Number (12) pos 73-84
   * - New IC Number (12) pos 85-96
   * - Passport Number (12) pos 97-108
   * - Country Code (2) pos 109-110
   * - PCB Amount cents (8) pos 111-118
   * - CP38 Amount cents (8) pos 119-126
   * - Employee ID (10) pos 127-136
   */
  const generateLHDNContent = (
    rows,
    eNumber,
    month,
    year,
    hqENumber = eNumber
  ) => {
    const lines = [];

    // Calculate totals for header
    let totalPCBCents = 0;
    rows.forEach((row) => {
      totalPCBCents += toCents(row.pcb_amount || 0);
    });

    // Build Header Record (H) - 57 chars total
    const headerType = "H";
    const hqENumPadded = normalizeEmployerNumber(hqENumber);
    const eNumPadded = normalizeEmployerNumber(eNumber);
    const yearStr = String(year);
    const monthStr = String(month).padStart(2, "0");
    const totalMTDAmount = padRight(totalPCBCents, 10); // Total MTD Amount (10)
    const totalMTDRecords = padRight(rows.length, 5); // Total MTD Records (5)
    const totalCP38Amount = padRight(0, 10); // Total CP38 Amount (10)
    const totalCP38Records = padRight(0, 5); // Total CP38 Records (5)

    const headerLine =
      headerType +
      hqENumPadded +
      eNumPadded +
      yearStr +
      monthStr +
      totalMTDAmount +
      totalMTDRecords +
      totalCP38Amount +
      totalCP38Records;

    lines.push(headerLine);

    // Build Detail Records (D) - 136 chars total
    rows.forEach((row) => {
      const detailType = "D";
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

      const detailLine =
        detailType +
        taxReference +
        wifeCode +
        name +
        oldICNumber +
        newICNumber +
        passportNumber +
        countryCode +
        pcbAmountCents +
        cp38AmountCents +
        employeeId;

      lines.push(detailLine);
    });

    return lines.join("\n");
  };

  /**
   * Combined preview endpoint - returns EPF and SOCSO/EIS data in one response
   * @query month - Month (1-12)
   * @query year - Year
   */
  router.get("/preview", async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      // EPF Query
      const epfQuery = `
        SELECT DISTINCT ON (s.id)
          s.id as employee_id,
          s.epf_no as member_no,
          s.ic_no,
          s.name,
          pd.wage_amount as salary,
          pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.epf_no IS NOT NULL
          AND s.epf_no != ''
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      // Query for employees with EPF contributions but missing EPF number
      const missingEpfNoQuery = `
        SELECT DISTINCT ON (s.id)
          s.id as employee_id,
          s.name,
          s.nationality,
          pd.employee_amount as emp_share,
          pd.employer_amount as em_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND (s.epf_no IS NULL OR s.epf_no = '')
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      // SOCSO Query.
      // employee_amount is the COMBINED Keilatan+SKBBK. Pull the split out
      // of rate_info so the preview can show the breakdown. For historical
      // pre-SKBBK deductions, keilatan defaults to the full employee_amount
      // and skbbk defaults to 0.
      const socsoQuery = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.socso_no,
          s.nationality,
          s.name,
          COALESCE(socso.wage_amount, eis.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee,
          COALESCE(
            (socso.rate_info->>'keilatan_amount')::numeric,
            socso.employee_amount,
            0
          ) as keilatan_amount,
          COALESCE((socso.rate_info->>'skbbk_amount')::numeric, 0) as skbbk_amount,
          COALESCE(eis.employer_amount, 0) as eis_employer,
          COALESCE(eis.employee_amount, 0) as eis_employee
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        LEFT JOIN payroll_deductions socso ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN payroll_deductions eis ON eis.employee_payroll_id = ep.id AND eis.deduction_type = 'eis'
        WHERE mp.month = $1
          AND mp.year = $2
          AND (
            (s.ic_no IS NOT NULL AND s.ic_no != '')
            OR (s.socso_no IS NOT NULL AND s.socso_no != '')
          )
          AND (
            (socso.employer_amount IS NOT NULL AND socso.employer_amount > 0)
            OR (socso.employee_amount IS NOT NULL AND socso.employee_amount > 0)
          )
        ORDER BY s.name
      `;

      // SIP/EIS Query - Note: deduction_type is 'sip' in the database
      // SIP only applies to Malaysian citizens
      const sipQuery = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.name,
          s.date_joined,
          COALESCE(sip.employer_amount, 0) as eis_employer,
          COALESCE(sip.employee_amount, 0) as eis_employee
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions sip ON sip.employee_payroll_id = ep.id AND sip.deduction_type = 'sip'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.ic_no IS NOT NULL
          AND s.ic_no != ''
          AND s.nationality = 'Malaysian'
          AND (
            (sip.employer_amount IS NOT NULL AND sip.employer_amount > 0)
            OR (sip.employee_amount IS NOT NULL AND sip.employee_amount > 0)
          )
        ORDER BY s.name
      `;

      // Income Tax / PCB Query
      const incomeTaxQuery = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.income_tax_no,
          s.nationality,
          s.name,
          COALESCE(pcb.employee_amount, 0) as pcb_amount
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pcb ON pcb.employee_payroll_id = ep.id AND pcb.deduction_type = 'income_tax'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.income_tax_no IS NOT NULL
          AND s.income_tax_no != ''
          AND pcb.employee_amount IS NOT NULL
          AND pcb.employee_amount > 0
        ORDER BY s.name
      `;

      // Execute all queries in parallel
      const [epfResult, socsoResult, sipResult, incomeTaxResult, missingEpfNoResult] = await Promise.all([
        pool.query(epfQuery, [month, year]),
        pool.query(socsoQuery, [month, year]),
        pool.query(sipQuery, [month, year]),
        pool.query(incomeTaxQuery, [month, year]),
        pool.query(missingEpfNoQuery, [month, year]),
      ]);

      // Calculate EPF totals
      const epfTotals = epfResult.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.em_share += parseFloat(row.em_share || 0);
          acc.emp_share += parseFloat(row.emp_share || 0);
          return acc;
        },
        { salary: 0, em_share: 0, emp_share: 0 }
      );

      // Calculate SOCSO totals
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
        {
          salary: 0,
          socso_employer: 0,
          socso_employee: 0,
          keilatan_amount: 0,
          skbbk_amount: 0,
          eis_employer: 0,
          eis_employee: 0,
        }
      );

      // Calculate SIP totals
      const sipTotals = sipResult.rows.reduce(
        (acc, row) => {
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        { eis_employer: 0, eis_employee: 0 }
      );

      // Calculate Income Tax totals
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
            total_contribution: Math.round(
              (socsoTotals.socso_employer + socsoTotals.socso_employee + socsoTotals.eis_employer + socsoTotals.eis_employee) * 100
            ) / 100,
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
          totals: {
            pcb_amount: Math.round(incomeTaxTotals.pcb_amount * 100) / 100,
          },
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
      console.error("Error fetching preview data:", error);
      res.status(500).json({
        message: "Error fetching preview data",
        error: error.message,
      });
    }
  });

  /**
   * Generate EPF CSV file for e-Caruman
   * @query month - Month (1-12)
   * @query year - Year
   * @query type - "local" for WARGANEGARA (Malaysian), "foreign" for WARGA ASING
   * Format: Member No, IC No, Name, Salary, EM Share, EMP Share
   */
  router.get("/epf", async (req, res) => {
    const { month, year, type } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    if (!type || !["local", "foreign"].includes(type)) {
      return res.status(400).json({
        message: "Type must be 'local' or 'foreign'",
      });
    }

    try {
      // Query to get EPF contribution data for the specified month/year
      // Include nationality to filter local or foreign workers
      const query = `
        SELECT DISTINCT ON (s.id)
          s.epf_no as member_no,
          s.ic_no,
          s.name,
          s.nationality,
          pd.wage_amount as salary,
          pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.epf_no IS NOT NULL
          AND s.epf_no != ''
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      const result = await pool.query(query, [month, year]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No EPF contribution data found for the specified period",
        });
      }

      // Filter based on type
      let filteredRows;
      let filename;

      if (type === "local") {
        filteredRows = result.rows.filter(
          (row) => (row.nationality || "").toLowerCase() === "malaysian"
        );
        filename = "EPFORMA2.csv"; // For WARGANEGARA
      } else {
        filteredRows = result.rows.filter(
          (row) => (row.nationality || "").toLowerCase() !== "malaysian"
        );
        filename = "EPFORMA2.csv"; // For WARGA ASING
      }

      if (filteredRows.length === 0) {
        return res.status(404).json({
          message: `No ${type === "local" ? "local (Malaysian)" : "foreign"} workers found for the specified period`,
        });
      }

      // Generate CSV content
      const csvContent = generateCSVContent(filteredRows);

      // Set response headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating EPF CSV:", error);
      res.status(500).json({
        message: "Error generating EPF CSV",
        error: error.message,
      });
    }
  });

  /**
   * Get EPF data for folder-based export (returns JSON with file content)
   * @query month - Month (1-12)
   * @query year - Year
   * @query company - Company code (default: TH)
   */
  router.get("/epf/export", async (req, res) => {
    const { month, year, company = "TH" } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      const query = `
        SELECT DISTINCT ON (s.id)
          s.epf_no as member_no,
          s.ic_no,
          s.name,
          s.nationality,
          pd.wage_amount as salary,
          pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.epf_no IS NOT NULL
          AND s.epf_no != ''
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      const result = await pool.query(query, [month, year]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No EPF contribution data found for the specified period",
        });
      }

      // Separate local and foreign workers
      const localRows = result.rows.filter(
        (row) => (row.nationality || "").toLowerCase() === "malaysian"
      );
      const foreignRows = result.rows.filter(
        (row) => (row.nationality || "").toLowerCase() !== "malaysian"
      );

      // Format month as 2 digits (01-12)
      const monthStr = String(month).padStart(2, "0");

      // Build response with folder structure info
      const files = [];

      if (localRows.length > 0) {
        files.push({
          path: `EPF/${year}/${company}/${monthStr}/WARGANEGARA`,
          filename: "EPFORMA2.csv",
          content: generateCSVContent(localRows),
          count: localRows.length,
        });
      }

      if (foreignRows.length > 0) {
        files.push({
          path: `EPF/${year}/${company}/${monthStr}/WARGA ASING`,
          filename: "EPFORMA2.csv",
          content: generateCSVContent(foreignRows),
          count: foreignRows.length,
        });
      }

      res.json({
        success: true,
        year,
        month: monthStr,
        company,
        files,
        totalLocal: localRows.length,
        totalForeign: foreignRows.length,
      });
    } catch (error) {
      console.error("Error generating EPF export data:", error);
      res.status(500).json({
        message: "Error generating EPF export data",
        error: error.message,
      });
    }
  });

  /**
   * Preview EPF data without downloading
   */
  router.get("/epf/preview", async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      const query = `
        SELECT DISTINCT ON (s.id)
          s.id as employee_id,
          s.epf_no as member_no,
          s.ic_no,
          s.name,
          pd.wage_amount as salary,
          pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.epf_no IS NOT NULL
          AND s.epf_no != ''
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      const result = await pool.query(query, [month, year]);

      // Calculate totals
      const totals = result.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.em_share += parseFloat(row.em_share || 0);
          acc.emp_share += parseFloat(row.emp_share || 0);
          return acc;
        },
        { salary: 0, em_share: 0, emp_share: 0 }
      );

      res.json({
        count: result.rows.length,
        data: result.rows.map((row) => ({
          ...row,
          salary: parseFloat(row.salary || 0),
          em_share: parseFloat(row.em_share || 0),
          emp_share: parseFloat(row.emp_share || 0),
        })),
        totals: {
          salary: totals.salary,
          em_share: Math.round(totals.em_share),
          emp_share: Math.round(totals.emp_share),
          total_contribution: Math.round(totals.em_share + totals.emp_share),
        },
      });
    } catch (error) {
      console.error("Error previewing EPF data:", error);
      res.status(500).json({
        message: "Error previewing EPF data",
        error: error.message,
      });
    }
  });

  // ============================================
  // SOCSO + EIS ROUTES
  // ============================================

  /**
   * Preview SOCSO+EIS data without downloading
   * Returns combined SOCSO and EIS contribution data
   */
  router.get("/socso/preview", async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      // Query to get SOCSO and EIS contribution data
      // Join payroll_deductions for both socso and eis types
      // Use wage_amount from socso or eis deduction record for salary
      const query = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.socso_no,
          s.nationality,
          s.name,
          COALESCE(socso.wage_amount, eis.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee,
          COALESCE(eis.employer_amount, 0) as eis_employer,
          COALESCE(eis.employee_amount, 0) as eis_employee
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        LEFT JOIN payroll_deductions socso ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN payroll_deductions eis ON eis.employee_payroll_id = ep.id AND eis.deduction_type = 'eis'
        WHERE mp.month = $1
          AND mp.year = $2
          AND (
            (s.ic_no IS NOT NULL AND s.ic_no != '')
            OR (s.socso_no IS NOT NULL AND s.socso_no != '')
          )
          AND (
            (socso.employer_amount IS NOT NULL AND socso.employer_amount > 0)
            OR (socso.employee_amount IS NOT NULL AND socso.employee_amount > 0)
          )
        ORDER BY s.name
      `;

      const result = await pool.query(query, [month, year]);

      // Calculate totals
      const totals = result.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.socso_employer += parseFloat(row.socso_employer || 0);
          acc.socso_employee += parseFloat(row.socso_employee || 0);
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        { salary: 0, socso_employer: 0, socso_employee: 0, eis_employer: 0, eis_employee: 0 }
      );

      res.json({
        count: result.rows.length,
        data: result.rows.map((row) => ({
          ...row,
          salary: parseFloat(row.salary || 0),
          socso_employer: parseFloat(row.socso_employer || 0),
          socso_employee: parseFloat(row.socso_employee || 0),
          eis_employer: parseFloat(row.eis_employer || 0),
          eis_employee: parseFloat(row.eis_employee || 0),
        })),
        totals: {
          salary: totals.salary,
          socso_employer: Math.round(totals.socso_employer * 100) / 100,
          socso_employee: Math.round(totals.socso_employee * 100) / 100,
          socso_total: Math.round((totals.socso_employer + totals.socso_employee) * 100) / 100,
          eis_employer: Math.round(totals.eis_employer * 100) / 100,
          eis_employee: Math.round(totals.eis_employee * 100) / 100,
          eis_total: Math.round((totals.eis_employer + totals.eis_employee) * 100) / 100,
          total_contribution: Math.round(
            (totals.socso_employer + totals.socso_employee + totals.eis_employer + totals.eis_employee) * 100
          ) / 100,
        },
      });
    } catch (error) {
      console.error("Error previewing SOCSO data:", error);
      res.status(500).json({
        message: "Error previewing SOCSO data",
        error: error.message,
      });
    }
  });

  /**
   * Get combined SOCSO + EIS + SKBBK data for folder-based export.
   * Replaces the old /socso/export (BRG8A.TXT) and /sip/export (SIP*.TXT, SIPE*.TXT)
   * with a single PERKESO 2026 combined file: SOCSO-SIP{MMYY}.TXT.
   *
   * @query month        Month (1-12)
   * @query year         Year
   * @query company      Company code (default: TH)
   * @query employerCode PERKESO employer code (required)
   * @query myCoId       Company SSM/MyCoID number (optional but recommended)
   */
  router.get("/socso-sip/export", async (req, res) => {
    const { month, year, company = "TH", employerCode, myCoId } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }
    if (!employerCode) {
      return res
        .status(400)
        .json({ message: "Employer code is required for SOCSO-SIP export" });
    }

    try {
      // Unified query: every employee with a SOCSO OR SIP deduction in the
      // month. Pull the Keilatan/SKBBK split from socso.rate_info JSON.
      // SIP rows are stored with deduction_type = 'sip' (Malaysian, under 60).
      const query = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.socso_no,
          s.nationality,
          s.name,
          COALESCE(socso.wage_amount, sip.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee_total,
          COALESCE(
            (socso.rate_info->>'keilatan_amount')::numeric,
            socso.employee_amount,
            0
          ) as keilatan_amount,
          COALESCE((socso.rate_info->>'skbbk_amount')::numeric, 0) as skbbk_amount,
          COALESCE(sip.employer_amount, 0) as eis_employer,
          COALESCE(sip.employee_amount, 0) as eis_employee
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        LEFT JOIN payroll_deductions socso
          ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN payroll_deductions sip
          ON sip.employee_payroll_id = ep.id AND sip.deduction_type = 'sip'
        WHERE mp.month = $1
          AND mp.year = $2
          AND (
            (s.ic_no IS NOT NULL AND s.ic_no != '')
            OR (s.socso_no IS NOT NULL AND s.socso_no != '')
          )
          AND (
            COALESCE(socso.employer_amount, 0) > 0
            OR COALESCE(socso.employee_amount, 0) > 0
            OR COALESCE(sip.employer_amount, 0) > 0
            OR COALESCE(sip.employee_amount, 0) > 0
          )
        ORDER BY s.name
      `;

      const result = await pool.query(query, [month, year]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "No SOCSO / EIS contribution data found for the specified period",
        });
      }

      const monthStr = String(month).padStart(2, "0");
      const filePrefix = `${monthStr}${String(year).slice(-2)}`;

      const content = generateCombinedSOCSOSIPContent(
        result.rows,
        employerCode,
        myCoId,
        month,
        year
      );

      const files = [
        {
          path: `SOCSO-SIP/${year}/${company}/${monthStr}`,
          filename: `SOCSO-SIP${filePrefix}.TXT`,
          content,
          count: result.rows.length,
        },
      ];

      const totals = result.rows.reduce(
        (acc, row) => {
          acc.socso_employer += parseFloat(row.socso_employer || 0);
          acc.socso_employee += parseFloat(row.socso_employee_total || 0);
          acc.keilatan_amount += parseFloat(row.keilatan_amount || 0);
          acc.skbbk_amount += parseFloat(row.skbbk_amount || 0);
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        {
          socso_employer: 0,
          socso_employee: 0,
          keilatan_amount: 0,
          skbbk_amount: 0,
          eis_employer: 0,
          eis_employee: 0,
        }
      );

      res.json({
        success: true,
        year,
        month: monthStr,
        company,
        employerCode,
        myCoId,
        files,
        totalEmployees: result.rows.length,
        totals: {
          socso_employer: Math.round(totals.socso_employer * 100) / 100,
          socso_employee: Math.round(totals.socso_employee * 100) / 100,
          keilatan_amount: Math.round(totals.keilatan_amount * 100) / 100,
          skbbk_amount: Math.round(totals.skbbk_amount * 100) / 100,
          eis_employer: Math.round(totals.eis_employer * 100) / 100,
          eis_employee: Math.round(totals.eis_employee * 100) / 100,
          combined_total:
            Math.round(
              (totals.socso_employer +
                totals.socso_employee +
                totals.eis_employer +
                totals.eis_employee) *
                100
            ) / 100,
        },
      });
    } catch (error) {
      console.error("Error generating SOCSO-SIP export data:", error);
      res.status(500).json({
        message: "Error generating SOCSO-SIP export data",
        error: error.message,
      });
    }
  });

  // Deprecated. PERKESO replaced the standalone BRG8A.TXT (SOCSO) format with
  // the combined SOCSO + EIS + SKBBK file at /socso-sip/export.
  router.get("/socso/export", (_req, res) => {
    res.status(410).json({
      message:
        "Replaced by /api/e-caruman/socso-sip/export (combined SOCSO+EIS+SKBBK).",
    });
  });

  // ============================================
  // SIP/EIS ROUTES
  // ============================================

  // Deprecated. PERKESO replaced the standalone SIP/SIPE files with the
  // combined SOCSO + EIS + SKBBK file at /socso-sip/export.
  router.get("/sip/export", (_req, res) => {
    res.status(410).json({
      message:
        "Replaced by /api/e-caruman/socso-sip/export (combined SOCSO+EIS+SKBBK).",
    });
  });

  // ============================================
  // INCOME TAX / PCB ROUTES
  // ============================================

  /**
   * Get Income Tax/PCB data for folder-based export (returns JSON with file content)
   * Generates LHDN*.TXT file for LHDN e-PCB submission
   * @query month - Month (1-12)
   * @query year - Year
   * @query company - Company code (default: TH)
   * @query eNumber - LHDN branch E Number (employer number) - required
   * @query hqENumber - LHDN HQ E Number - optional, defaults to eNumber
   */
  router.get("/income-tax/export", async (req, res) => {
    const { month, year, company = "TH", eNumber, hqENumber } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    if (!eNumber) {
      return res.status(400).json({
        message: "E Number is required for Income Tax export",
      });
    }

    try {
      const query = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.income_tax_no,
          s.nationality,
          s.name,
          COALESCE(pcb.employee_amount, 0) as pcb_amount
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pcb ON pcb.employee_payroll_id = ep.id AND pcb.deduction_type = 'income_tax'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.income_tax_no IS NOT NULL
          AND s.income_tax_no != ''
          AND pcb.employee_amount IS NOT NULL
          AND pcb.employee_amount > 0
        ORDER BY s.name
      `;

      const result = await pool.query(query, [month, year]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No Income Tax/PCB contribution data found for the specified period",
        });
      }

      // Format month as 2 digits (01-12)
      const monthStr = String(month).padStart(2, "0");

      // Generate the LHDN fixed-width text file content
      const content = generateLHDNContent(
        result.rows,
        eNumber,
        month,
        year,
        hqENumber || eNumber
      );

      // File naming: LHDN{MMYY}.TXT (e.g., LHDN1125.TXT for Nov 2025)
      const filePrefix = `${monthStr}${String(year).slice(-2)}`;
      const files = [
        {
          path: `PCB/${year}/${company}/${monthStr}`,
          filename: `LHDN${filePrefix}.TXT`,
          content: content,
          count: result.rows.length,
        },
      ];

      // Calculate totals for response
      const totalPCB = result.rows.reduce(
        (acc, row) => acc + parseFloat(row.pcb_amount || 0),
        0
      );

      res.json({
        success: true,
        year,
        month: monthStr,
        company,
        eNumber,
        hqENumber: hqENumber || eNumber,
        files,
        totalEmployees: result.rows.length,
        totals: {
          pcb_amount: Math.round(totalPCB * 100) / 100,
        },
      });
    } catch (error) {
      console.error("Error generating Income Tax export data:", error);
      res.status(500).json({
        message: "Error generating Income Tax export data",
        error: error.message,
      });
    }
  });

  return router;
}
