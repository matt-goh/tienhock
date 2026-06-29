# Green Target Payroll Guide (For HR Staff)

This guide explains how to manage and process Green Target employee salaries from the start of the month until payslips are printed. No technical knowledge needed — just follow the steps.

> **Important note:** The Green Target payroll system is **separate** from the Tien Hock payroll system. All Green Target records (pinjam, mid-month advances, salaries) only appear in the Green Target pages.

---

## 1. Monthly Overview

Each month, your workflow looks like this:

1. Make sure the Green Target employee list is complete (one-time setup, unless someone joins/leaves).
2. Enter work records for **OFFICE** employees (monthly working hours).
3. Make sure the drivers' (**DRIVER**) bin rental records are complete — trips are calculated automatically from rentals during Process.
4. Enter **Mid-month Advances** (half-month pay), if any.
5. Enter **Pinjam** (loan/deduction) records, if any.
6. **Create** the month's payroll, then click **Process**.
7. Review each employee's pay, add manual items if needed.
8. Print payslips.
9. Click **Finalize** to lock the month's payroll.

All payroll pages are reachable from the **Payroll** menu in the top bar — hovering over it opens a dropdown with **Monthly Payroll**, **Office**, **Mid-month Payroll**, **Pinjam** and **Payroll Settings**.

---

## 2. Managing the Employee List

**Location:** **Payroll** menu > **Employees** button (top-right corner)

Before salaries can be processed, employees must be registered in the Green Target payroll list. Each employee is set as either:

- **OFFICE** — office staff (paid by monthly working hours)
- **DRIVER** — lorry drivers (paid by trips + extra allowances)

**Steps:**

1. Open the Green Target **Payroll** page.
2. Click the **Employees** button.
3. Search for the employee's name, choose the job type (OFFICE or DRIVER), then add them.
4. To remove an employee, click the remove button next to their name.
5. Click **Save** to save all changes.

> **Important:** Employees on the Green Target payroll list **no longer appear** in Tien Hock's monthly hour-entry pages — this prevents them being paid twice. Their hours are entered only on the Green Target **Office** page (section 3).
>
> If you remove an employee from this list after the month has been processed, click **Process** again — that employee is removed from the month's payroll automatically.

---

## 3. OFFICE Employee Work Records

**Location:** **Payroll** menu > **Office** (`/greentarget/payroll/office-log`), or the **Office Entry** button on the Payroll page

This is where you enter the monthly working hours of office staff.

**Steps:**

1. Choose the month and year.
2. Enter normal hours and overtime (OT) hours for each employee.
3. Click **Save** to save and submit the record.

---

## 4. Driver Trips (DRIVER)

Driver pay does **not** need to be entered manually — it is calculated automatically when you click **Process** (section 8), based on bin rentals that have been **picked up** (have a pickup date) during the month:

- **Bin delivery (Placement)** — paid based on the invoice amount (e.g. invoices up to RM180 get one rate, above RM180 a different rate).
- **Bin pickup (Pickup)** — paid based on the destination (e.g. Kilang, MD, Menggatal).
- **Add-ons** — extra tasks like delivering rice or oil, recorded on the rental.

What you need to make sure of before Process:

1. The rental records (the **Rentals** page) are complete — especially the **pickup date** and **pickup destination**.
2. The rental's invoice has been created (if there's no invoice, the system uses the default invoice amount from Settings).
3. Add-ons (if any) are recorded on the rental.

After Process, review each driver's trip payment breakdown on their pay details page (section 8.3).

> **Tip:** If a trip payment looks wrong, first check the rental record (pickup date and destination) and its invoice, then click **Process** again. If it's still wrong, check the rates on the **Rules** page (see section 5).

---

## 5. Payment Rate Settings (Rules)

**Location:** **Payroll** menu > **Rules** button (`/greentarget/payroll/settings`)

This is where all driver payment rates are configured. **Be careful — changes here affect the pay calculation for all drivers.**

The page has several sections:

- **Payroll Rules** — payment rules for bin delivery (PLACEMENT) and bin pickup (PICKUP). Each rule assigns a pay code (e.g. TRIP5 = RM5) based on the invoice amount or destination.
- **Pickup Destinations** — the list of pickup destinations (e.g. KILANG, MD, MENGGATAL).
- **Add-on Paycodes** — the list of extra tasks and their default payments (e.g. Hantar Barang, 1 Beras, Minyak).
- **Settings** — general settings like the default invoice amount used when a rental has no invoice.

> The actual rate of each pay code (TRIP5, TRIP10, etc.) is stored in the main system's **Pay Codes** list. If a rate needs changing, contact the system administrator.

---

## 6. Mid-month Advances (Half-month Pay)

**Location:** **Payroll** menu > **Mid-month Payroll** (`/greentarget/payroll/mid-month`)

If an employee receives an early payment in the middle of the month, record it here. The amount is **automatically deducted** from that employee's end-of-month pay.

**Steps:**

1. Choose the month and year.
2. Click **Add Payroll**.
3. Choose the employee, enter the amount (e.g. RM500), and choose the payment method (Cash / Bank / Cheque).
4. Click **Create Payroll**.

Each employee can only have **one** mid-month advance per month. To change the amount, click the pencil icon (Edit). To cancel it, click the trash icon (Delete).

> **Important:** If you add or change a mid-month advance **after** the month's payroll has been processed, click **Process** again so the pay is recalculated.

---

## 7. Pinjam (Loans/Deductions)

**Location:** **Payroll** menu > **Pinjam** (`/greentarget/payroll/pinjam`)

Record employee loans/deductions here. There are two types:

- **Mid-Month** — deducted from the employee's mid-month advance.
- **Monthly** — deducted from the end-of-month pay (after rounding).

**Steps:**

1. Choose the month and year.
2. Click **Record Pinjam**.
3. For each row: choose the employee, type a description (e.g. PINJAM, HANDPHONE), and enter the amount in the **Mid-Month** or **Monthly** column (or both).
4. Click **Save Records**.

After saving, the Pinjam page shows a summary card for each employee — their pinjam totals and **Final Pay** (net pay after deducting pinjam).

> **Note:** Pinjam is **not** deducted in the EPF/SOCSO calculations and is **not** printed on the payslip — it is only deducted at cash/bank payment time, and can be seen on the employee's pay details page.

---

## 8. Processing the Monthly Payroll

**Location:** **Payroll** menu (`/greentarget/payroll`)

### 8.1 Create the month's payroll

1. Choose the month using the arrows at the top.
2. If there is no payroll for that month yet, click **Create Payroll**.

### 8.2 Process

1. Click **Process**. The system will:
   - Pull OFFICE working hours and DRIVER trips,
   - Calculate each employee's gross pay,
   - Automatically deduct EPF, SOCSO, SIP and income tax (PCB) at the current rates,
   - Deduct the mid-month advance and round the final amount up to the whole ringgit.
2. Once done, employees are listed in OFFICE and DRIVER groups with their Gross Pay and Net Pay.

> You can click **Process** as many times as needed — for example after correcting work records, trips, or advances. Manual items you added yourself are **not** removed.

### 8.3 Review an employee's pay details

Click any employee's name to see their details:

- **Earnings** — list of payments (working hours, trips, add-ons).
- **Statutory Deductions** — EPF, SOCSO, SIP and tax contributions (employee and employer portions).
- **Net Pay / Jumlah Digenapkan** — net pay, minus the mid-month advance, and the final rounded amount.
- **Pinjam** — if any, the pinjam breakdown and the final amount after deducting pinjam.

### 8.4 Add manual items (if needed)

For special payments that don't come from work records/trips (e.g. a special bonus or other allowance):

1. On the employee's details page, click **Add Item**.
2. Choose the pay code, check the description/rate/quantity, and save.
3. Gross pay, contributions and net pay are **recalculated automatically**.

To remove a manual item, click the trash icon next to it (only items marked "Manual" can be removed).

### 8.5 Print payslips

On the employee's details page, click the **Payslip** button to download the PDF payslip. The slip shows earnings, contributions, the mid-month advance (if any) and the final rounded amount.

### 8.6 Finalize (lock the payroll)

Once everything is checked and payslips are printed:

1. Go back to the **Payroll** page.
2. Click **Finalize** and confirm.

After Finalize, that month's payroll is **locked** — it cannot be re-processed and items cannot be added or removed. If a correction is needed, click **Unlock** first, make the correction, Process again, and Finalize once more.

---

## 9. Frequently Asked Questions

**Q: I changed working hours / trips / an advance, but the pay didn't change?**
A: Click **Process** again on the Payroll page. The system only recalculates when you Process.

**Q: Why is an employee missing from the list after Process?**
A: Make sure the employee is in the **Employees** list (section 2), and has a work record (OFFICE) or rental/trip records (DRIVER) for that month.

**Q: An employee's EPF/SOCSO contribution looks wrong?**
A: Contributions are calculated from the employee's personal information (date of birth, nationality, marital status, number of children) in the main system's Staff records. Check that information first.

**Q: Where do I see the amount to actually pay the employee?**
A: On the employee's pay details page — **Jumlah Digenapkan** is the final amount; if there is monthly pinjam, see **Final Pay** in the Pinjam card.

**Q: Can I delete a month's payroll and start over?**
A: Yes, as long as it isn't Finalized. But usually clicking **Process** again is enough.
