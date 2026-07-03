const emptyPinjamBucket = () => ({
  total_amount: 0,
  details: [],
  record_count: 0,
});

const parseMoney = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseCount = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const getStaffKey = (employeeName, employeeId) => employeeName || employeeId;

const shouldUseEmployeeId = (currentId, nextId) => {
  if (!currentId) return true;
  if (!nextId) return false;
  return nextId.localeCompare(currentId) < 0;
};

export const buildPinjamDashboardData = ({
  pinjamRecordsRows,
  pinjamSummaryRows,
  midMonthPayrollRows,
  monthlyPayrollRows,
}) => {
  const payrollByStaff = new Map();

  monthlyPayrollRows.forEach((row) => {
    if (!row.employee_id) return;

    const staffKey = getStaffKey(row.employee_name, row.employee_id);
    const existing = payrollByStaff.get(staffKey) || {
      employee_payroll_id: row.employee_payroll_id,
      employee_id: row.employee_id,
      employee_name: row.employee_name || row.employee_id,
      net_pay: 0,
      setelah_digenapkan: 0,
      hasCompleteSetelahDigenapkan: true,
    };

    if (shouldUseEmployeeId(existing.employee_id, row.employee_id)) {
      existing.employee_payroll_id = row.employee_payroll_id;
      existing.employee_id = row.employee_id;
    }

    existing.net_pay += parseMoney(row.net_pay);

    if (row.setelah_digenapkan == null) {
      existing.hasCompleteSetelahDigenapkan = false;
    } else {
      existing.setelah_digenapkan += parseMoney(row.setelah_digenapkan);
    }

    payrollByStaff.set(staffKey, existing);
  });

  const midMonthByStaff = new Map();

  midMonthPayrollRows.forEach((row) => {
    if (!row.employee_id) return;

    const staffKey = getStaffKey(row.employee_name, row.employee_id);
    const payrollRow = payrollByStaff.get(staffKey);
    const existing = midMonthByStaff.get(staffKey) || {
      employee_id: payrollRow?.employee_id || row.employee_id,
      employee_name: row.employee_name || row.employee_id,
      amount: 0,
    };

    if (!payrollRow && shouldUseEmployeeId(existing.employee_id, row.employee_id)) {
      existing.employee_id = row.employee_id;
    }

    existing.amount += parseMoney(row.amount);
    midMonthByStaff.set(staffKey, existing);
  });

  const pinjamSummaryByStaff = new Map();

  pinjamSummaryRows.forEach((row) => {
    if (!row.employee_id) return;

    const staffKey = getStaffKey(row.employee_name, row.employee_id);
    const payrollRow = payrollByStaff.get(staffKey);
    const midMonthRow = midMonthByStaff.get(staffKey);
    const existing = pinjamSummaryByStaff.get(staffKey) || {
      employee_id: payrollRow?.employee_id || midMonthRow?.employee_id || row.employee_id,
      employee_name: row.employee_name || row.employee_id,
      mid_month: emptyPinjamBucket(),
      monthly: emptyPinjamBucket(),
    };

    if (!payrollRow && !midMonthRow && shouldUseEmployeeId(existing.employee_id, row.employee_id)) {
      existing.employee_id = row.employee_id;
    }

    const type = row.pinjam_type === "mid_month" ? "mid_month" : "monthly";
    const details = row.details ? row.details.split(", ") : [];

    existing[type].total_amount += parseMoney(row.total_amount);
    existing[type].details.push(...details);
    existing[type].record_count += parseCount(row.record_count);

    pinjamSummaryByStaff.set(staffKey, existing);
  });

  const pinjamRecords = pinjamRecordsRows.map((row) => ({
    ...row,
    amount: parseMoney(row.amount),
  }));

  const pinjamSummary = Array.from(pinjamSummaryByStaff.values()).map((row) => ({
    ...row,
    mid_month: {
      ...row.mid_month,
      total_amount: roundMoney(row.mid_month.total_amount),
    },
    monthly: {
      ...row.monthly,
      total_amount: roundMoney(row.monthly.total_amount),
    },
  }));

  const midMonthPayrolls = Array.from(midMonthByStaff.values()).map((row) => ({
    ...row,
    amount: roundMoney(row.amount),
  }));

  const employeePayrolls = Array.from(payrollByStaff.values()).map((row) => {
    const payroll = {
      employee_payroll_id: row.employee_payroll_id,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      net_pay: roundMoney(row.net_pay),
    };

    if (row.hasCompleteSetelahDigenapkan) {
      payroll.setelah_digenapkan = roundMoney(row.setelah_digenapkan);
    }

    return payroll;
  });

  return {
    pinjamRecords,
    pinjamSummary,
    midMonthPayrolls,
    employeePayrolls,
  };
};
