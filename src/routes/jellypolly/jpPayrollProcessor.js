// src/routes/jellypolly/jpPayrollProcessor.js
// Jelly Polly payroll processing core.
//
// JP data is small, so instead of Tien Hock's heavy month-wide reprocess this
// module reprocesses only the affected employees. Every JP save endpoint
// (work logs, others, incentives, mid-month, pinjam) calls
// reprocessJPEmployees() for the staff it touched; the Payrolls page's
// "Process month" simply calls it with no employeeIds (= all assigned staff).
//
// HEAD/sub-ID handling: staff with multiple IDs share a name and point at the
// HEAD via staffs.head_staff_id. Payroll rows exist only for the canonical
// (HEAD) id; work entered under sub IDs is rolled into the HEAD's payroll with
// payroll_items.source_employee_id preserving the sub ID (same spirit as TH).
//
// Statutory math is shared with Green Target (identical to TH):
// gtStatutoryCalc.js is the single source — do not fork it.
import {
  calculateGTStatutoryDeductions,
  fetchActiveContributionRates,
} from "../greentarget/gtStatutoryCalc.js";

// public.jobs id -> jellypolly.payroll_employees job_type
export const JP_JOB_ID_TO_TYPE = {
  JP_OFFICE: "OFFICE",
  JP_MAINTEN: "MAINTENANCE",
  JP_SALESMAN: "SALESMAN",
  JP_SALESMAN_IKUT: "SALESMAN_IKUT",
  JP_ICE_POLLY: "ICE_POLLY",
  JP_JELLY_CUP: "JELLY_CUP",
  JP_PLASTIC: "PLASTIC",
  JP_PACKING: "PRODUCTION",
};

const toCents = (value) => Math.round((parseFloat(value) || 0) * 100);

const monthDateRange = (year, month) => {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(
    lastDay
  ).padStart(2, "0")}`;
  return { startDate, endDate };
};

/**
 * Ensures the jellypolly.monthly_payrolls row for (year, month) exists.
 * Returns its id.
 */
export const ensureMonthlyPayroll = async (client, year, month, createdBy) => {
  const existing = await client.query(
    "SELECT id FROM jellypolly.monthly_payrolls WHERE year = $1 AND month = $2",
    [year, month]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO jellypolly.monthly_payrolls (year, month, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (year, month) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [year, month, createdBy || null]
  );
  return inserted.rows[0].id;
};

/**
 * Reprocesses JP payroll for the given month.
 *
 * @param {object} pool - pg pool
 * @param {object} options
 * @param {number} options.year
 * @param {number} options.month
 * @param {string[]|null} [options.employeeIds] - staff ids (sub or HEAD) whose
 *   payroll should be rebuilt. null/omitted = all actively assigned JP staff
 *   (a full "process month", which also prunes payrolls of unassigned staff).
 * @param {string|null} [options.createdBy]
 * @returns {Promise<{monthlyPayrollId:number, processed:Array, removed:string[]}>}
 */
export const reprocessJPEmployees = async (
  pool,
  { year, month, employeeIds = null, createdBy = null }
) => {
  const { startDate, endDate } = monthDateRange(year, month);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const monthlyPayrollId = await ensureMonthlyPayroll(
      client,
      year,
      month,
      createdBy
    );

    // Canonical (HEAD) mapping across all staff
    const canonicalRows = await client.query(
      `SELECT id, COALESCE(NULLIF(head_staff_id, ''), id) AS canonical_id
       FROM public.staffs`
    );
    const idToCanonical = new Map(
      canonicalRows.rows.map((r) => [r.id, r.canonical_id])
    );
    const canonicalToSiblings = new Map();
    for (const row of canonicalRows.rows) {
      if (!canonicalToSiblings.has(row.canonical_id)) {
        canonicalToSiblings.set(row.canonical_id, []);
      }
      canonicalToSiblings.get(row.canonical_id).push(row.id);
    }

    // Active JP assignments (job types per employee)
    const assignmentsResult = await client.query(
      `SELECT employee_id, job_type
       FROM jellypolly.payroll_employees
       WHERE is_active = true`
    );
    const assignedJobTypesByCanonical = new Map();
    for (const row of assignmentsResult.rows) {
      const canonical = idToCanonical.get(row.employee_id) || row.employee_id;
      if (!assignedJobTypesByCanonical.has(canonical)) {
        assignedJobTypesByCanonical.set(canonical, new Set());
      }
      assignedJobTypesByCanonical.get(canonical).add(row.job_type);
    }

    // Target canonical employees
    const isFullRun = !employeeIds || employeeIds.length === 0;
    const targetCanonicalIds = isFullRun
      ? [...assignedJobTypesByCanonical.keys()]
      : [
          ...new Set(
            employeeIds.map((id) => idToCanonical.get(id) || id)
          ),
        ];

    const processed = [];
    const removed = [];

    if (targetCanonicalIds.length > 0) {
      // All sibling ids whose work rolls up into the targets
      const targetSiblingIds = targetCanonicalIds.flatMap(
        (canonical) => canonicalToSiblings.get(canonical) || [canonical]
      );

      // Fetch everything for the month in parallel
      const [
        staffsResult,
        contributionRates,
        monthlyActivitiesResult,
        dailyActivitiesResult,
        commissionResult,
        othersResult,
        midMonthResult,
        manualItemsResult,
        leaveResult,
        holidaysResult,
        productionResult,
        productPayCodesResult,
      ] = await Promise.all([
        client.query(
          `SELECT id, name, birthdate, nationality, marital_status,
                  spouse_employment_status, number_of_children,
                  epf_age_override, epf_nationality_override,
                  socso_age_override, sip_age_override
           FROM public.staffs
           WHERE id = ANY($1)`,
          [targetCanonicalIds]
        ),
        fetchActiveContributionRates(client),
        // Monthly work log activities (Office / Maintenance)
        client.query(
          `SELECT mwl.id AS work_log_id, mwle.employee_id, mwle.job_id,
                  mwla.pay_code_id, COALESCE(mwla.description, pc.description) AS description,
                  pc.pay_type, pc.rate_unit,
                  mwla.hours_applied, mwla.units_produced,
                  mwla.rate_used, mwla.calculated_amount
           FROM jellypolly.monthly_work_logs mwl
           JOIN jellypolly.monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
           JOIN jellypolly.monthly_work_log_activities mwla ON mwla.monthly_entry_id = mwle.id
           LEFT JOIN public.pay_codes pc ON mwla.pay_code_id = pc.id
           WHERE mwl.log_month = $1 AND mwl.log_year = $2
             AND mwl.status = 'Submitted'
             AND mwle.employee_id = ANY($3)`,
          [month, year, targetSiblingIds]
        ),
        // Daily work log activities (Salesman / Ice-Polly / Jelly Cup / Plastic)
        client.query(
          `SELECT dwl.id AS work_log_id, dwl.section, dwl.log_date,
                  dwle.employee_id, dwle.job_id,
                  dwla.pay_code_id, pc.description, pc.pay_type, pc.rate_unit,
                  dwla.hours_applied, dwla.units_produced, dwla.foc_units,
                  dwla.rate_used, dwla.calculated_amount
           FROM jellypolly.daily_work_logs dwl
           JOIN jellypolly.daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
           JOIN jellypolly.daily_work_log_activities dwla ON dwla.log_entry_id = dwle.id
           LEFT JOIN public.pay_codes pc ON dwla.pay_code_id = pc.id
           WHERE dwl.log_date >= $1 AND dwl.log_date <= $2
             AND dwl.status <> 'Draft'
             AND dwle.employee_id = ANY($3)`,
          [startDate, endDate, targetSiblingIds]
        ),
        // Bonus / Advance
        client.query(
          `SELECT employee_id, amount, description, is_advance
           FROM jellypolly.commission_records
           WHERE DATE(commission_date) >= $1 AND DATE(commission_date) <= $2
             AND employee_id = ANY($3)`,
          [startDate, endDate, targetSiblingIds]
        ),
        // Others (Kerja Luar OT)
        client.query(
          `SELECT orec.employee_id, orec.pay_code_id, orec.description,
                  orec.rate, orec.rate_unit, orec.quantity, orec.amount,
                  pc.pay_type
           FROM jellypolly.others_records orec
           LEFT JOIN public.pay_codes pc ON orec.pay_code_id = pc.id
           WHERE DATE(orec.record_date) >= $1 AND DATE(orec.record_date) <= $2
             AND orec.employee_id = ANY($3)`,
          [startDate, endDate, targetSiblingIds]
        ),
        // Mid-month advances (deducted before rounding)
        client.query(
          `SELECT employee_id, amount
           FROM jellypolly.mid_month_payrolls
           WHERE year = $1 AND month = $2 AND status <> 'Cancelled'
             AND employee_id = ANY($3)`,
          [year, month, targetSiblingIds]
        ),
        // Existing manual items on the targets' payroll rows (kept + counted in gross)
        client.query(
          `SELECT ep.employee_id AS canonical_id, pi.amount, pc.pay_type
           FROM jellypolly.employee_payrolls ep
           JOIN jellypolly.payroll_items pi ON pi.employee_payroll_id = ep.id
           LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
           WHERE ep.monthly_payroll_id = $1
             AND ep.employee_id = ANY($2)
             AND pi.is_manual = true`,
          [monthlyPayrollId, targetCanonicalIds]
        ),
        // Approved leave for the month (SHARED public.leave_records — JP pages
        // write there too). amount_paid adds to gross; work items dated on a
        // leave day are stored but excluded from gross, mirroring TH.
        client.query(
          `SELECT employee_id, to_char(leave_date, 'YYYY-MM-DD') AS leave_date,
                  leave_type, CAST(amount_paid AS NUMERIC(10,2)) AS amount_paid
           FROM public.leave_records
           WHERE leave_date >= $1 AND leave_date <= $2
             AND status = 'approved'
             AND company = 'JP'
             AND employee_id = ANY($3)`,
          [startDate, endDate, targetSiblingIds]
        ),
        // Holidays for production day-type rates
        client.query(
          `SELECT holiday_date FROM public.holiday_calendar
           WHERE holiday_date BETWEEN $1 AND $2 AND is_active = true`,
          [startDate, endDate]
        ),
        // JP production entries (bags packed per worker per JP product)
        client.query(
          `SELECT pe.entry_date, to_char(pe.entry_date, 'YYYY-MM-DD') AS entry_date_str,
                  pe.product_id, pe.worker_id, pe.bags_packed
           FROM public.production_entries pe
           JOIN public.products p ON pe.product_id = p.id
           WHERE pe.entry_date BETWEEN $1 AND $2
             AND pe.bags_packed > 0
             AND p.type = 'JP'
             AND pe.worker_id = ANY($3)`,
          [startDate, endDate, targetSiblingIds]
        ),
        // Product -> pay code mappings for JP products (month-effective rates)
        client.query(
          `SELECT ppc.product_id, ppc.pay_code_id,
                  pc.description, pc.pay_type, pc.rate_unit,
                  CAST(eff.rate_biasa AS NUMERIC(10,2)) as rate_biasa,
                  CAST(eff.rate_ahad AS NUMERIC(10,2)) as rate_ahad,
                  CAST(eff.rate_umum AS NUMERIC(10,2)) as rate_umum
           FROM public.product_pay_codes ppc
           JOIN public.pay_codes pc ON ppc.pay_code_id = pc.id
           JOIN public.products p ON ppc.product_id = p.id
           LEFT JOIN LATERAL public.get_effective_pay_rate(
             NULL::varchar, NULL::varchar, ppc.pay_code_id, $1, $2
           ) eff ON true
           WHERE pc.is_active = true AND p.type = 'JP'`,
          [year, month]
        ),
      ]);

      const staffsMap = new Map(staffsResult.rows.map((s) => [s.id, s]));
      const { epfRates, socsoRates, sipRates, incomeTaxRates } =
        contributionRates;

      const canonicalOf = (id) => idToCanonical.get(id) || id;
      const groupByCanonical = (rows) => {
        const grouped = new Map();
        for (const row of rows) {
          const canonical = canonicalOf(row.employee_id);
          if (!grouped.has(canonical)) grouped.set(canonical, []);
          grouped.get(canonical).push(row);
        }
        return grouped;
      };

      const monthlyByCanonical = groupByCanonical(monthlyActivitiesResult.rows);
      const dailyByCanonical = groupByCanonical(dailyActivitiesResult.rows);
      const commissionsByCanonical = groupByCanonical(commissionResult.rows);
      const othersByCanonical = groupByCanonical(othersResult.rows);
      const leaveByCanonical = groupByCanonical(leaveResult.rows);
      const productionByCanonical = new Map();
      for (const row of productionResult.rows) {
        const canonical = canonicalOf(row.worker_id);
        if (!productionByCanonical.has(canonical)) {
          productionByCanonical.set(canonical, []);
        }
        productionByCanonical.get(canonical).push(row);
      }

      // Day type for production rates: Umum on holidays, Ahad on Sundays
      const holidaySet = new Set(
        holidaysResult.rows.map((r) => {
          const d = r.holiday_date;
          return d instanceof Date
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
            : String(d).split("T")[0];
        })
      );
      const dayTypeOf = (ymd) => {
        if (holidaySet.has(ymd)) return "Umum";
        const [y, m, d] = ymd.split("-").map(Number);
        return new Date(y, m - 1, d).getDay() === 0 ? "Ahad" : "Biasa";
      };

      // JP product -> Base production pay code (rate_unit Bag/Ctn)
      const productBaseCodeByProduct = new Map();
      for (const row of productPayCodesResult.rows) {
        if (
          row.pay_type === "Base" &&
          (row.rate_unit === "Bag" || row.rate_unit === "Ctn") &&
          !productBaseCodeByProduct.has(row.product_id)
        ) {
          productBaseCodeByProduct.set(row.product_id, row);
        }
      }

      const midMonthByCanonical = new Map();
      for (const row of midMonthResult.rows) {
        const canonical = canonicalOf(row.employee_id);
        midMonthByCanonical.set(
          canonical,
          (midMonthByCanonical.get(canonical) || 0) +
            (parseFloat(row.amount) || 0)
        );
      }

      const manualByCanonical = new Map();
      for (const row of manualItemsResult.rows) {
        if (!manualByCanonical.has(row.canonical_id)) {
          manualByCanonical.set(row.canonical_id, []);
        }
        manualByCanonical.get(row.canonical_id).push(row);
      }

      for (const canonicalId of targetCanonicalIds) {
        const staff = staffsMap.get(canonicalId);
        if (!staff) {
          // Canonical staff row missing — skip rather than fail the batch
          continue;
        }

        const combinedItems = [];

        // Monthly work log activities (Office / Maintenance)
        for (const activity of monthlyByCanonical.get(canonicalId) || []) {
          if (!activity.pay_code_id) continue;
          const quantity =
            activity.rate_unit === "Hour"
              ? parseFloat(activity.hours_applied) || 0
              : activity.units_produced != null
              ? parseFloat(activity.units_produced) || 1
              : 1;
          combinedItems.push({
            pay_code_id: activity.pay_code_id,
            description: activity.description || "",
            pay_type: activity.pay_type || "Tambahan",
            rate: parseFloat(activity.rate_used) || 0,
            rate_unit: activity.rate_unit || "Fixed",
            quantity,
            foc_units: 0,
            amount: Math.round((parseFloat(activity.calculated_amount) || 0) * 100) / 100,
            job_type: JP_JOB_ID_TO_TYPE[activity.job_id] || activity.job_id,
            source_employee_id: activity.employee_id,
            source_date: null,
            work_log_id: activity.work_log_id,
            work_log_type: "monthly",
          });
        }

        // Daily work log activities (Salesman / machines / plastic)
        for (const activity of dailyByCanonical.get(canonicalId) || []) {
          if (!activity.pay_code_id) continue;
          const quantity =
            activity.units_produced != null
              ? parseFloat(activity.units_produced) || 0
              : parseFloat(activity.hours_applied) || 1;
          combinedItems.push({
            pay_code_id: activity.pay_code_id,
            description: activity.description || "",
            pay_type: activity.pay_type || "Tambahan",
            rate: parseFloat(activity.rate_used) || 0,
            rate_unit: activity.rate_unit || "Fixed",
            quantity,
            foc_units: parseFloat(activity.foc_units) || 0,
            amount: Math.round((parseFloat(activity.calculated_amount) || 0) * 100) / 100,
            job_type: activity.section || JP_JOB_ID_TO_TYPE[activity.job_id] || null,
            source_employee_id: activity.employee_id,
            source_date: activity.log_date,
            work_log_id: activity.work_log_id,
            work_log_type: "daily",
          });
        }

        // Bonus / Advance (both raise gross; only advances reduce net)
        let commissionAdvanceCents = 0;
        for (const record of commissionsByCanonical.get(canonicalId) || []) {
          const amountCents = toCents(record.amount);
          combinedItems.push({
            pay_code_id: null,
            description:
              record.description || (record.is_advance ? "Advance" : "Bonus"),
            pay_type: "Tambahan",
            rate: amountCents / 100,
            rate_unit: "Fixed",
            quantity: 1,
            foc_units: 0,
            amount: amountCents / 100,
            job_type: null,
            source_employee_id: record.employee_id,
            source_date: null,
            work_log_id: null,
            work_log_type: record.is_advance ? "advance" : "bonus",
          });
          if (record.is_advance) commissionAdvanceCents += amountCents;
        }

        // Others (Kerja Luar OT) — raises gross only
        for (const record of othersByCanonical.get(canonicalId) || []) {
          combinedItems.push({
            pay_code_id: record.pay_code_id || null,
            description: record.description || "Others",
            pay_type: record.pay_type || "Tambahan",
            rate: parseFloat(record.rate) || 0,
            rate_unit: record.rate_unit,
            quantity: parseFloat(record.quantity) || 0,
            foc_units: 0,
            amount: toCents(record.amount) / 100,
            job_type: null,
            source_employee_id: record.employee_id,
            source_date: null,
            work_log_id: null,
            work_log_type: "others",
          });
        }

        // JP production pay: bags packed × the product's Base pay code rate
        // (product_pay_codes mapping, day-type aware). Mirrors TH's base
        // production pay; TH's BH/MEE threshold bonus tiers are TH-specific
        // and not applied for JP.
        for (const entry of productionByCanonical.get(canonicalId) || []) {
          const baseCode = productBaseCodeByProduct.get(entry.product_id);
          if (!baseCode) continue;
          const ymd = entry.entry_date_str;
          const dayType = dayTypeOf(ymd);
          let rate =
            dayType === "Ahad"
              ? parseFloat(baseCode.rate_ahad) || 0
              : dayType === "Umum"
              ? parseFloat(baseCode.rate_umum) || 0
              : parseFloat(baseCode.rate_biasa) || 0;
          if (rate === 0) rate = parseFloat(baseCode.rate_biasa) || 0;
          if (rate <= 0) continue;

          const bags = parseFloat(entry.bags_packed) || 0;
          combinedItems.push({
            pay_code_id: baseCode.pay_code_id,
            description: `${baseCode.description} - ${entry.product_id}`,
            pay_type: "Base",
            rate,
            rate_unit: baseCode.rate_unit,
            quantity: bags,
            foc_units: 0,
            amount: Math.round(bags * rate * 100) / 100,
            job_type: "PRODUCTION",
            source_employee_id: entry.worker_id,
            source_date: ymd,
            work_log_id: null,
            work_log_type: "production",
          });
        }

        // Leave: amount_paid adds to gross; work items dated on the leave
        // owner's leave day are stored but excluded from gross/EPF (the day is
        // paid via leave), mirroring TH.
        const leaveRecords = leaveByCanonical.get(canonicalId) || [];
        const leaveGrossCents = leaveRecords.reduce(
          (sum, record) => sum + toCents(record.amount_paid),
          0
        );
        const leaveDateSet = new Set(
          leaveRecords.map((record) => `${record.employee_id}|${record.leave_date}`)
        );
        const isLeaveDayWorkItem = (item) =>
          item.work_log_type === "daily" &&
          item.source_date &&
          leaveDateSet.has(
            `${item.source_employee_id}|${
              item.source_date instanceof Date
                ? `${item.source_date.getFullYear()}-${String(
                    item.source_date.getMonth() + 1
                  ).padStart(2, "0")}-${String(
                    item.source_date.getDate()
                  ).padStart(2, "0")}`
                : String(item.source_date).split("T")[0]
            }`
          );

        const manualItems = manualByCanonical.get(canonicalId) || [];

        // Nothing this month (and no kept manual items, no leave) → remove any stale row
        if (
          combinedItems.length === 0 &&
          manualItems.length === 0 &&
          leaveRecords.length === 0
        ) {
          const stale = await client.query(
            `SELECT id FROM jellypolly.employee_payrolls
             WHERE monthly_payroll_id = $1 AND employee_id = $2`,
            [monthlyPayrollId, canonicalId]
          );
          if (stale.rows.length > 0) {
            const staleId = stale.rows[0].id;
            await client.query(
              "DELETE FROM jellypolly.payroll_items WHERE employee_payroll_id = $1",
              [staleId]
            );
            await client.query(
              "DELETE FROM jellypolly.payroll_deductions WHERE employee_payroll_id = $1",
              [staleId]
            );
            await client.query(
              "DELETE FROM jellypolly.employee_payrolls WHERE id = $1",
              [staleId]
            );
            removed.push(canonicalId);
          }
          continue;
        }

        // Gross in integer cents (auto items + kept manual items + leave pay).
        // Daily work items on the owner's leave day are stored below but
        // excluded here (TH convention: the day is paid via leave).
        let grossCents = leaveGrossCents;
        let epfGrossCents = leaveGrossCents;
        for (const item of combinedItems) {
          if (isLeaveDayWorkItem(item)) continue;
          const cents = toCents(item.amount);
          grossCents += cents;
          // EPF base excludes Overtime (matches TH/GT)
          if ((item.pay_type || "Tambahan") !== "Overtime") {
            epfGrossCents += cents;
          }
        }
        for (const manual of manualItems) {
          const cents = toCents(manual.amount);
          grossCents += cents;
          if ((manual.pay_type || "Tambahan") !== "Overtime") {
            epfGrossCents += cents;
          }
        }

        const grossPay = grossCents / 100;
        const epfGrossPay = epfGrossCents / 100;

        const deductions = calculateGTStatutoryDeductions({
          staff,
          grossPay,
          epfGrossPay,
          year,
          month,
          epfRates,
          socsoRates,
          sipRates,
          incomeTaxRates,
        });

        const totalEmployeeDeductions = deductions.reduce(
          (sum, d) => sum + d.employee_amount,
          0
        );
        const netPay =
          Math.round(
            (grossPay - totalEmployeeDeductions - commissionAdvanceCents / 100) *
              100
          ) / 100;

        const midMonthAmount = midMonthByCanonical.get(canonicalId) || 0;
        const jumlah = netPay - midMonthAmount;
        const setelahDigenapkan = Math.ceil(jumlah);
        const digenapkan = setelahDigenapkan - jumlah;

        const assignedJobTypes = [
          ...(assignedJobTypesByCanonical.get(canonicalId) || []),
        ];
        const primaryJobType =
          assignedJobTypes[0] ||
          combinedItems.find((i) => i.job_type)?.job_type ||
          "JP";

        // Upsert the payroll row (one per canonical employee per month)
        const upsertResult = await client.query(
          `INSERT INTO jellypolly.employee_payrolls
             (monthly_payroll_id, employee_id, job_type, section, gross_pay,
              net_pay, digenapkan, setelah_digenapkan, employee_job_mapping)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (monthly_payroll_id, employee_id) DO UPDATE SET
             job_type = EXCLUDED.job_type,
             section = EXCLUDED.section,
             gross_pay = EXCLUDED.gross_pay,
             net_pay = EXCLUDED.net_pay,
             digenapkan = EXCLUDED.digenapkan,
             setelah_digenapkan = EXCLUDED.setelah_digenapkan,
             employee_job_mapping = EXCLUDED.employee_job_mapping,
             updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [
            monthlyPayrollId,
            canonicalId,
            primaryJobType,
            primaryJobType,
            grossPay.toFixed(2),
            netPay.toFixed(2),
            digenapkan.toFixed(2),
            setelahDigenapkan.toFixed(2),
            JSON.stringify(assignedJobTypes),
          ]
        );
        const employeePayrollId = upsertResult.rows[0].id;

        // Replace auto items + deductions (manual items survive)
        await client.query(
          "DELETE FROM jellypolly.payroll_items WHERE employee_payroll_id = $1 AND is_manual = false",
          [employeePayrollId]
        );
        await client.query(
          "DELETE FROM jellypolly.payroll_deductions WHERE employee_payroll_id = $1",
          [employeePayrollId]
        );

        for (const item of combinedItems) {
          await client.query(
            `INSERT INTO jellypolly.payroll_items
               (employee_payroll_id, pay_code_id, description, rate, rate_unit,
                quantity, foc_units, amount, is_manual, job_type,
                source_employee_id, source_date, work_log_id, work_log_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, $12, $13)`,
            [
              employeePayrollId,
              item.pay_code_id,
              item.description || "",
              item.rate,
              item.rate_unit,
              item.quantity,
              item.foc_units || 0,
              item.amount,
              item.job_type || null,
              item.source_employee_id || null,
              item.source_date || null,
              item.work_log_id || null,
              item.work_log_type || null,
            ]
          );
        }

        for (const deduction of deductions) {
          await client.query(
            `INSERT INTO jellypolly.payroll_deductions
               (employee_payroll_id, deduction_type, employee_amount,
                employer_amount, wage_amount, rate_info)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              employeePayrollId,
              deduction.deduction_type,
              deduction.employee_amount,
              deduction.employer_amount,
              deduction.wage_amount,
              JSON.stringify(deduction.rate_info),
            ]
          );
        }

        processed.push({
          employeeId: canonicalId,
          employeeName: staff.name,
          grossPay,
          netPay,
        });
      }
    }

    // Full run: prune payroll rows for staff no longer assigned to JP
    if (isFullRun) {
      const orphanResult = await client.query(
        `SELECT id, employee_id FROM jellypolly.employee_payrolls
         WHERE monthly_payroll_id = $1
           AND NOT (employee_id = ANY($2))`,
        [
          monthlyPayrollId,
          targetCanonicalIds.length > 0 ? targetCanonicalIds : [""],
        ]
      );
      if (orphanResult.rows.length > 0) {
        const orphanIds = orphanResult.rows.map((r) => r.id);
        await client.query(
          "DELETE FROM jellypolly.payroll_items WHERE employee_payroll_id = ANY($1)",
          [orphanIds]
        );
        await client.query(
          "DELETE FROM jellypolly.payroll_deductions WHERE employee_payroll_id = ANY($1)",
          [orphanIds]
        );
        await client.query(
          "DELETE FROM jellypolly.employee_payrolls WHERE id = ANY($1)",
          [orphanIds]
        );
        removed.push(...orphanResult.rows.map((r) => r.employee_id));
      }
    }

    await client.query(
      "UPDATE jellypolly.monthly_payrolls SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [monthlyPayrollId]
    );

    await client.query("COMMIT");
    return { monthlyPayrollId, processed, removed };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Fire-and-forget wrapper used by save endpoints: reprocesses the affected
 * employees for the month of the given date/year+month and logs (rather than
 * propagates) failures so a payroll hiccup never blocks the entry save.
 */
export const reprocessJPEmployeesSafe = async (pool, options) => {
  try {
    return await reprocessJPEmployees(pool, options);
  } catch (error) {
    console.error(
      `Error auto-reprocessing JP payroll (${options.year}-${options.month}):`,
      error
    );
    return null;
  }
};
