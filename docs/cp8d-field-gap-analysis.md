# CP8D Field Gap Analysis

<style>
@page {
  size: A4;
  margin: 8mm;
}

@media print {
  html,
  body,
  body[for="html-export"],
  .markdown-preview {
    color: #111827;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.5pt !important;
    line-height: 1.28 !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    width: auto !important;
    max-width: none !important;
    left: auto !important;
  }

  h1,
  html body h1 {
    font-size: 18pt !important;
    margin: 0 0 5mm !important;
    padding: 0 !important;
  }

  h2,
  html body h2 {
    break-after: avoid;
    font-size: 12pt !important;
    margin: 5mm 0 2mm !important;
    padding: 0 !important;
    page-break-after: avoid;
  }

  h3,
  html body h3 {
    break-after: avoid;
    font-size: 9.5pt !important;
    margin: 3mm 0 1.5mm !important;
    page-break-after: avoid;
  }

  p,
  ul,
  ol,
  html body p,
  html body ul,
  html body ol {
    margin-bottom: 2.5mm !important;
  }

  p,
  li {
    orphans: 3;
    widows: 3;
  }

  table,
  html body table {
    border-collapse: collapse;
    display: table !important;
    font-size: 6.2pt !important;
    line-height: 1.16 !important;
    margin: 2mm 0 4mm !important;
    page-break-inside: auto;
    table-layout: fixed;
    width: 100% !important;
    overflow: visible !important;
    word-break: normal !important;
  }

  thead {
    display: table-header-group;
  }

  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  th,
  td,
  html body table th,
  html body table td {
    border: 0.35pt solid #9ca3af;
    padding: 1.2mm !important;
    vertical-align: top;
    word-break: normal;
    overflow-wrap: anywhere;
  }

  th {
    background: #f3f4f6;
    font-weight: 700;
  }

  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 90%;
  }

  .page-break {
    break-before: auto;
    page-break-before: auto;
  }

  .no-break {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  hr {
    border: 0;
    border-top: 0.5pt solid #d1d5db;
    margin: 5mm 0;
  }
}
</style>

## Overview

**English:** CP8D is the annual employee remuneration and tax deduction file submitted to LHDN. It is normally prepared for the previous remuneration year and submitted around February.

**Bahasa Melayu:** CP8D ialah fail tahunan maklumat ganjaran pekerja dan potongan cukai yang dihantar kepada LHDN. Biasanya fail ini disediakan untuk tahun saraan sebelumnya dan dihantar sekitar bulan Februari.

This note compares the CP8D TXT layout in `C.P.8D_FORMAT.pdf` against the current Tien Hock ERP staff and payroll data.

## CP8D TXT Format Notes

- One employee is reported per line.
- Every field is separated by the pipe delimiter: `|`.
- Employee particulars are saved as a `.txt` file.
- Filename format: `P{Employer E No}_{Year}.TXT`.
- Example filename: `P2900030000_2023.txt`.
- Several money fields are integer fields and must exclude sen, according to the PDF. Decimal fields such as MTD, CP38, and zakat decimal fields keep sen.

## How HR Can Mark Each Field

Use this section when reviewing the CP8D requirements with HR/payroll.

- **Use ERP:** Already available or can be calculated from finalized payroll.
- **Need to add:** ERP does not currently store this field.
- **Can exclude / zero:** Field may be irrelevant to Tien Hock, but HR/accounting should confirm before excluding.
- **Can be Tetap:** A fixed/default value can be used for all or most employees.

## HR Review Worksheet

Print this section and write directly under each field during discussion.

### 1. Name of employee

**ERP status:** Available  
**Suggested decision:** Use ERP  
**HR to confirm:** Name should follow IC/passport name.

### 2. Tax Identification No. (TIN)

**ERP status:** Available, needs format check  
**Suggested decision:** Use ERP after checking format  
**HR to confirm:** Which staff have TIN and whether the stored number is LHDN-ready.

### 3. Identification / passport no.

**ERP status:** Available  
**Suggested decision:** Use ERP  
**HR to confirm:** For foreigners, confirm whether stored `icNo` is the passport number.

### 4. Category of employee

**ERP status:** Partial  
**Suggested decision:** Confirm with HR or add CP8D override  
**HR to confirm:** Whether Single/Married/spouse employment/children is enough, or whether divorced/widowed/adopted-child cases exist.

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 5. Employee Status

**ERP status:** Missing  
**Suggested decision:** Need to add  
**HR to confirm:** Which code should be used: 1 management, 2 permanent, 3 contract, 4 part time, 5 intern, 6 others.

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 6. Date of Retirement / End of Contract

**ERP status:** Partial  
**Suggested decision:** Confirm with HR  
**HR to confirm:** Whether `dateResigned` is enough, or whether active contract staff need a contract end date.

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 7. Tax borne by employer

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if HR confirms `2 = No` for all staff  
**HR to confirm:** Does Tien Hock ever pay income tax on behalf of employees?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 8. Number of children qualified for tax relief

**ERP status:** Partial  
**Suggested decision:** Confirm with HR  
**HR to confirm:** Whether current `numberOfChildren` means tax-qualified children, not just total children.

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 9. Total qualifying child relief

**ERP status:** Missing  
**Suggested decision:** Need to add  
**HR to confirm:** Whether HR tracks the actual child relief amount used for PCB/MTD.

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 10. Total gross remuneration

**ERP status:** Available/derivable  
**Suggested decision:** Use ERP  
**HR to confirm:** Use finalized payroll only, and confirm which payroll records belong to the CP8D year.

### 11. Benefits in kind

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if not provided; otherwise need to add  
**HR to confirm:** Any company car, goods, facilities, or other non-cash taxable benefits?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 12. Value of living accommodation

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if not provided; otherwise need to add  
**HR to confirm:** Does the company provide accommodation or hostel/living benefits that must be reported?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 13. Employee share option scheme (ESOS) benefit

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if not applicable  
**HR to confirm:** Does the company provide employee share option benefits?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 14. Tax exempt allowances / perquisites / gifts / benefits

**ERP status:** Missing  
**Suggested decision:** Need to add if HR has tax-exempt amounts  
**HR to confirm:** Are any allowances, gifts, perquisites, or benefits treated as tax-exempt for CP8D?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 15. Total claim for relief by employee via Form TP1

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if no TP1 claims; otherwise need to add  
**HR to confirm:** Do employees submit Form TP1 relief claims to payroll?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 16. Total claim on payment of Zakat by employee via Form TP1

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if no TP1 zakat claims; otherwise need to add  
**HR to confirm:** Do employees claim zakat through Form TP1, separate from salary deduction?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 17. Contribution to Employees Provident Fund

**ERP status:** Available/derivable  
**Suggested decision:** Use ERP  
**HR to confirm:** Use employee EPF contribution only, not employer contribution.

### 18. Zakat paid via salary deduction

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if no salary-deducted zakat; otherwise need to add  
**HR to confirm:** Does payroll deduct zakat from salary for any employee?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 19. MTD

**ERP status:** Available/derivable  
**Suggested decision:** Use ERP  
**HR to confirm:** This is annual PCB/MTD deducted from employee payroll.

### 20. CP38

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if no CP38 instructions; otherwise need to add  
**HR to confirm:** Has LHDN issued CP38 deduction instructions for any employee?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 21. Medical insurance

**ERP status:** Missing  
**Suggested decision:** Can exclude / zero if not applicable; otherwise need to add  
**HR to confirm:** Does the company pay medical insurance amounts that must be reported in CP8D?

Decision: [ ] Use ERP  [ ] Need to add  [ ] Can exclude / zero  [ ] Can be Tetap: ____________________

Notes / HR context:

________________________________________________________________________________

________________________________________________________________________________

### 22. SOCSO Contribution

**ERP status:** Available/derivable  
**Suggested decision:** Use ERP  
**HR to confirm:** Use employee SOCSO contribution only, not employer contribution.

## ERP Field Coverage

| No. | CP8D Field | English explanation | Penjelasan BM | ERP status | Current ERP source / missing requirement | Recommended action |
|---:|---|---|---|---|---|---|
| 1 | Name of employee | Employee name as per identity card. Mandatory. | Nama pekerja seperti kad pengenalan. Wajib diisi. | Available | `staffs.name`, shown in Staff Form as `name`. | Use current staff name. Confirm naming matches IC/passport before submission. |
| 2 | Tax Identification No. (TIN) | Employee tax identification number from LHDN. Blank is allowed if the employee has no TIN. | Nombor cukai pekerja daripada LHDN. Boleh dikosongkan jika pekerja tiada TIN. | Available, needs format check | `staffs.income_tax_no` / `incomeTaxNo`. Existing PCB export already uses this field. | Reuse current Income Tax Number field. Add validation/cleanup later if strict CP8D formatting is implemented. |
| 3 | Identification / passport no. | IC, police, army, or passport number. If no ID exists, fill 12 zeros. Passport is for foreigners. Mandatory. | Nombor IC, polis, tentera, atau pasport. Jika tiada nombor pengenalan, isi 12 angka kosong. Pasport untuk pekerja asing. Wajib diisi. | Available | `staffs.ic_no` / `icNo`, with `document` type also stored. | Use `icNo`; for foreigners treat it as passport when appropriate. Need fallback to `000000000000` if blank. |
| 4 | Category of employee | MTD category: 1 single; 2 married with spouse not working; 3 married with spouse working, divorced/widowed, or single with adopted child. Latest category should be used. | Kategori PCB: 1 bujang; 2 berkahwin dan pasangan tidak bekerja; 3 berkahwin dan pasangan bekerja, bercerai/balu/duda, atau bujang dengan anak angkat. Guna kategori terkini. | Partial | `maritalStatus`, `spouseEmploymentStatus`, and `numberOfChildren` exist. ERP does not record divorced/widowed/adopted-child status. | Derive simple cases only. Add a dedicated CP8D/MTD category override if accuracy is required. |
| 5 | Employee Status | Employment status: 1 management; 2 permanent; 3 contract; 4 part time; 5 intern; 6 others. Latest status should be used. | Status pekerja: 1 pengurusan; 2 tetap; 3 kontrak; 4 separuh masa; 5 pelatih; 6 lain-lain. Guna status terkini. | Missing | ERP has job, department, and payment type, but no official CP8D employee status field. | Add an employee status field or CP8D-specific override before generating the file. |
| 6 | Date of Retirement / End of Contract | Retirement date, contract end date, or termination/quit/dismissal date if it happened during the remuneration year. Format `dd-mm-yyyy`. Mandatory in the layout. | Tarikh persaraan, tamat kontrak, atau tarikh berhenti/diberhentikan jika berlaku dalam tahun saraan. Format `dd-mm-yyyy`. Wajib dalam susun atur. | Partial | `dateResigned` exists, but there is no planned retirement date or contract end date for active contract staff. | Use `dateResigned` where relevant. Add contract end/retirement date if active employees need this field populated. |
| 7 | Tax borne by employer | Whether employee income tax is paid by employer: `1 = Yes`, `2 = No`. | Menunjukkan sama ada cukai pendapatan pekerja ditanggung majikan: `1 = Ya`, `2 = Tidak`. | Missing | Current payroll income tax deduction is employee-paid; employer amount is always `0`. No explicit flag exists. | Default to `2 = No` unless business confirms tax is borne by employer. Add field if exceptions exist. |
| 8 | Number of children qualified for tax relief | Number of children that qualify for tax relief. | Bilangan anak yang layak untuk pelepasan cukai. | Partial | `numberOfChildren` exists, but it is not explicitly limited to children qualified for tax relief. | Reuse with caution, or rename/add a tax-qualified children field. |
| 9 | Total qualifying child relief | Total child relief amount used for MTD purposes, excluding sen. | Jumlah pelepasan anak yang digunakan untuk tujuan PCB, tidak termasuk sen. | Missing | ERP stores child count but does not store or calculate total child relief amount. | Add a yearly HR-provided value or implement tax-relief calculation rules. |
| 10 | Total gross remuneration | Total annual gross remuneration, excluding sen. | Jumlah ganjaran kasar tahunan, tidak termasuk sen. | Available/derivable | Annual sum of `employee_payrolls.gross_pay`; salary report already aggregates `gaji_kasar`. | Derive from finalized payroll records for the year. |
| 11 | Benefits in kind | Total value of employer-provided benefits in kind, excluding sen. | Jumlah nilai manfaat berupa barangan/kemudahan yang diberikan majikan, tidak termasuk sen. | Missing | No BIK payroll category or staff benefit field exists. | Add annual BIK input or classify payroll items if the company provides taxable benefits in kind. |
| 12 | Value of living accommodation | Total value of living accommodation benefit provided in Malaysia, excluding sen. | Jumlah nilai manfaat tempat tinggal yang disediakan majikan di Malaysia, tidak termasuk sen. | Missing | No accommodation benefit field exists. | Add annual accommodation benefit input if applicable. |
| 13 | Employee share option scheme (ESOS) benefit | Total ESOS benefit value, excluding sen. | Jumlah nilai manfaat skim opsyen saham pekerja, tidak termasuk sen. | Missing | No ESOS field exists. | Add field only if the company has ESOS/share option benefits. Otherwise leave blank/zero per submission rules. |
| 14 | Tax exempt allowances / perquisites / gifts / benefits | Total tax-exempt allowances, perquisites, gifts, or benefits, excluding sen. | Jumlah elaun, perkuisit, hadiah, atau manfaat yang dikecualikan cukai, tidak termasuk sen. | Missing | Payroll items are not currently marked as tax-exempt CP8D categories. | Add tax-exempt annual adjustment field or payroll item classification. |
| 15 | Total claim for relief by employee via Form TP1 | Total relief claimed by employee through TP1, excluding sen. | Jumlah pelepasan yang dituntut pekerja melalui Borang TP1, tidak termasuk sen. | Missing | No TP1 relief record exists. | Add yearly TP1 relief input if employees submit TP1 claims. |
| 16 | Total claim on payment of Zakat by employee via Form TP1 | Zakat payment claimed via TP1, other than zakat paid through monthly salary deduction. Keeps sen. | Bayaran zakat yang dituntut melalui TP1, selain zakat yang dipotong melalui gaji bulanan. Termasuk sen. | Missing | No TP1 zakat record exists. | Add yearly TP1 zakat input if applicable. |
| 17 | Contribution to Employees Provident Fund | Employee EPF contribution total, excluding sen. | Jumlah caruman KWSP pekerja, tidak termasuk sen. | Available/derivable | Annual sum of `payroll_deductions.employee_amount` where `deduction_type = 'epf'`. | Derive from finalized payroll deductions. |
| 18 | Zakat paid via salary deduction | Total zakat paid through monthly salary deduction. Keeps sen. | Jumlah zakat yang dibayar melalui potongan gaji bulanan. Termasuk sen. | Missing | No zakat payroll deduction type exists. | Add zakat deduction type or yearly HR-provided amount if salary-deducted zakat is used. |
| 19 | MTD | Total Monthly Tax Deduction/PCB for the year. Keeps sen. | Jumlah Potongan Cukai Bulanan/PCB untuk tahun tersebut. Termasuk sen. | Available/derivable | Annual sum of `payroll_deductions.employee_amount` where `deduction_type = 'income_tax'`; current e-Caruman/LHDN export uses PCB amount. | Derive from finalized payroll deductions. |
| 20 | CP38 | Total CP38 income tax deduction for the year. Keeps sen. | Jumlah potongan cukai CP38 untuk tahun tersebut. Termasuk sen. | Missing | Existing monthly LHDN PCB export hardcodes CP38 amount and record count as `0`. | Add CP38 deduction tracking if the company receives CP38 instructions for employees. |
| 21 | Medical insurance | Medical insurance amount, excluding cents/sen. | Jumlah insurans perubatan, tidak termasuk sen. | Missing | No medical insurance field or payroll category exists. | Add annual medical insurance input or payroll classification if applicable. |
| 22 | SOCSO Contribution | Employee SOCSO contribution total, excluding sen. | Jumlah caruman PERKESO pekerja, tidak termasuk sen. | Available/derivable | Annual sum of `payroll_deductions.employee_amount` where `deduction_type = 'socso'`. | Derive from finalized payroll deductions. |

## Important Missing Fields

### Employee Status

**English:** CP8D needs the official employment status code, such as permanent, contract, part time, intern, management, or others. The ERP currently has job and department information, but these are not the same as the CP8D status code.

**Bahasa Melayu:** CP8D memerlukan kod status pekerjaan rasmi seperti tetap, kontrak, separuh masa, pelatih, pengurusan, atau lain-lain. ERP sekarang ada maklumat kerja dan jabatan, tetapi ini bukan kod status CP8D yang tepat.

### Tax Borne by Employer

**English:** This field says whether the company pays the employee's income tax on behalf of the employee. The current payroll treats PCB as an employee deduction, so the safest default appears to be `2 = No` unless the company confirms otherwise.

**Bahasa Melayu:** Medan ini menunjukkan sama ada syarikat menanggung cukai pendapatan pekerja. Payroll sekarang menganggap PCB sebagai potongan pekerja, jadi nilai lalai yang paling selamat ialah `2 = Tidak` kecuali syarikat mengesahkan sebaliknya.

### Child Relief Amount

**English:** CP8D asks for the total qualifying child relief amount, not only the number of children. The ERP stores number of children for PCB calculation, but it does not store the annual relief amount.

**Bahasa Melayu:** CP8D meminta jumlah pelepasan anak yang layak, bukan sekadar bilangan anak. ERP menyimpan bilangan anak untuk kiraan PCB, tetapi tidak menyimpan jumlah pelepasan tahunan.

### Benefits in Kind, Living Accommodation, ESOS, and Tax-Exempt Benefits

**English:** These fields are annual taxable or exempt benefit values. The ERP payroll currently stores normal payroll items and deductions, but it does not classify amounts into these CP8D benefit categories.

**Bahasa Melayu:** Medan-medan ini ialah nilai manfaat bercukai atau dikecualikan cukai untuk setahun. Payroll ERP sekarang menyimpan item gaji dan potongan biasa, tetapi belum mengasingkan amaun mengikut kategori manfaat CP8D ini.

### TP1 Relief and TP1 Zakat

**English:** TP1 fields are employee-declared relief or zakat claims submitted through Form TP1. The ERP currently has no TP1 record or yearly HR adjustment area.

**Bahasa Melayu:** Medan TP1 ialah tuntutan pelepasan atau zakat yang diisytiharkan pekerja melalui Borang TP1. ERP sekarang belum ada rekod TP1 atau ruang pelarasan tahunan.

### Zakat via Salary Deduction

**English:** This is zakat paid through monthly salary deduction. The ERP currently has EPF, SOCSO, SIP, and income tax deductions, but no zakat deduction type.

**Bahasa Melayu:** Ini ialah zakat yang dibayar melalui potongan gaji bulanan. ERP sekarang ada potongan KWSP, PERKESO, SIP, dan PCB, tetapi belum ada jenis potongan zakat.

### CP38

**English:** CP38 is a separate LHDN-directed tax deduction. The current monthly LHDN PCB export has CP38 fields but writes them as zero, so the ERP cannot currently produce real CP38 totals.

**Bahasa Melayu:** CP38 ialah potongan cukai berasingan berdasarkan arahan LHDN. Eksport PCB bulanan sekarang mempunyai medan CP38 tetapi mengisinya sebagai kosong/sifar, jadi ERP belum boleh menghasilkan jumlah CP38 sebenar.

### Medical Insurance

**English:** CP8D has a separate field for medical insurance. The ERP does not currently store this as an annual staff tax field or payroll category.

**Bahasa Melayu:** CP8D mempunyai medan khas untuk insurans perubatan. ERP sekarang belum menyimpan maklumat ini sebagai medan cukai tahunan pekerja atau kategori payroll.
