export type ReportSourceGuideKind =
  | "trial_balance"
  | "income_statement"
  | "balance_sheet"
  | "cogm";

export type ReportSourceGuideCompany = "tienhock" | "greentarget";

export interface ReportSourceGuideRow {
  label: string;
  detail: string;
}

export interface ReportSourceGuideText {
  title: string;
  intro: string;
  sourcesHeading: string;
  sources: ReportSourceGuideRow[];
  notesHeading: string;
  notes: string[];
  footer: string;
}

export const REPORT_SOURCE_GUIDE_CONTENT: Record<
  ReportSourceGuideCompany,
  Partial<Record<ReportSourceGuideKind, ReportSourceGuideText>>
> = {
  tienhock: {
    trial_balance: {
      title: "How this report is built",
      intro:
        "This Trial Balance shows each active account that has an opening balance or posted movement as at the selected month end. Each account starts from its latest opening balance dated on or before that date, then adds posted debit less credit movement from the opening date through month end. An account without an opening balance starts from 1 January.",
      sourcesHeading: "Report sources",
      sources: [
        {
          label: "Opening balances",
          detail:
            "An opening balance sets an account's starting amount and date. A saved zero starts that account at zero on that date, so earlier journal history is not counted.",
        },
        {
          label: "Sales invoices and cash bills",
          detail:
            "An invoice-owned Sales journal records revenue and the customer's debtor account. A cash bill also records its automatic collection through CH_REV1.",
        },
        {
          label: "Customer receipts and bank-ins",
          detail:
            "Posted receipts settle invoice, overpayment or account allocations. Bank, online and cleared-cheque receipts debit bank. Physical cash debits CH_REV1 when collected on the invoice date and CH_REV2 when collected later or without an invoice; Bank-In then transfers available holding balances to bank.",
        },
        {
          label: "Purchases and supplier payments",
          detail:
            "Material purchases are keyed as PUR journals on Journal Entries. Local General Purchases create GP journals automatically. Foreign General Purchase records do not create a journal, so they affect the reports only after a separate manual purchase journal is posted. Supplier payments create PAY journals.",
        },
        {
          label: "Payroll journals",
          detail:
            "Voucher Generator posts monthly salary and statutory expenses against accrual accounts. Later bank-payment journals settle those accruals from bank.",
        },
        {
          label: "Adjustments and manual journals",
          detail:
            "Credit, debit and refund notes, bank or cash payments, hire-purchase movements, director accounts, bank charges, audit adjustments and imported legacy journals are included once posted.",
        },
      ],
      notesHeading: "Important report rules",
      notes: [
        "Only journal entries with Posted status are included; drafts, pending receipts and cancelled entries are excluded.",
        "Trade-debtor accounts are combined into one net Trade Debtors row by default. Filtering to the TD ledger type itemises the customer accounts; because the default row is netted, the itemised debit and credit totals can differ from the default totals.",
        "Search, Hide zero and pagination change the displayed rows only. The Ledger Type filter is the only row filter that changes the reported debit and credit totals.",
        "Month-end closing stock is not posted to the ledger and is intentionally absent from the Trial Balance. It is injected only into the selected month's Balance Sheet, Income Statement and CoGM.",
      ],
      footer:
        "Each account uses its own financial-statement note or the nearest parent account's note. The statement reports group balances using that effective note.",
    },
    income_statement: {
      title: "How this report is built",
      intro:
        "This Income Statement is year to date: 1 January through the selected month end. It groups posted journal movement by financial-statement note, then adds only the exact 1 January opening-inventory balances required for the year.",
      sourcesHeading: "Report sources",
      sources: [
        {
          label: "Revenue and sales adjustments",
          detail:
            "Sales journals, Credit Notes, Debit Notes and other posted entries assigned to revenue notes make up Revenue and Other Income.",
        },
        {
          label: "Material and production costs",
          detail:
            "PUR journals and other posted entries on mapped raw-material, packing, chemical, freight and manufacturing accounts make up Cost of Goods Sold and CoGM costs.",
        },
        {
          label: "Opening inventory",
          detail:
            "The exact 1 January opening balances for finished goods, raw materials and packing materials are included once. Later opening-balance checkpoints are not substituted.",
        },
        {
          label: "Closing inventory",
          detail:
            "The finished-goods, raw-material and packing-material values saved for the selected month in Material Stock are deducted directly in this report. If that month has no saved values, no closing-stock adjustment is made.",
        },
        {
          label: "Payroll and operating expenses",
          detail:
            "Posted payroll vouchers and local General Purchase GP journals contribute when their accounts map to an Income Statement or CoGM note. Foreign General Purchase records affect the report only through separately posted manual journals. Depreciation, hire-purchase interest, tax and bank charges also require posted journals.",
        },
      ],
      notesHeading: "Important report rules",
      notes: [
        "Only posted journals are included; the report does not read current invoice or payment status directly.",
        "An account uses its own financial-statement note or the nearest parent account's note, so mapped child purchase and expense accounts roll up automatically.",
        "Closing stock is exact-month only and is not carried forward from an earlier month.",
        "Depreciation, released hire-purchase interest, taxation and other accruals appear only after a journal posts them; the report does not calculate them automatically.",
      ],
      footer:
        "Net profit is Revenue less Cost of Goods Sold and expenses. The same year-to-date result feeds Current Year Profit on the Balance Sheet.",
    },
    balance_sheet: {
      title: "How this report is built",
      intro:
        "This Balance Sheet shows assets, liabilities and equity as at the selected month end. Each account uses its latest opening balance on or before that date plus posted movement from that opening date through month end.",
      sourcesHeading: "Report sources",
      sources: [
        {
          label: "Cash and bank",
          detail:
            "Opening balances, sales collections, receipts, Bank-In entries, supplier and payroll payments, and manual bank or cash journals build Cash in Hand and Cash at Bank.",
        },
        {
          label: "Trade receivables and customer deposits",
          detail:
            "Invoice, receipt, overpayment-application and adjustment journals move each customer debtor account. Unapplied receipt excess is held separately in CUST_DEP until it is applied or refunded.",
        },
        {
          label: "Trade payables and accruals",
          detail:
            "Local General Purchase GP journals, supplier payments, payroll vouchers and other posted entries build supplier balances, salary accruals, tax and other creditors. Foreign General Purchase records affect these balances only through separately posted manual journals.",
        },
        {
          label: "Assets, financing and equity",
          detail:
            "Fixed assets, depreciation, hire purchase, loans, director accounts, share capital and retained profit come from their opening balances and posted journals.",
        },
        {
          label: "Closing inventory",
          detail:
            "The exact selected-month values saved in Material Stock are added to Notes 14-1, 14-2 and 14-3 at report level; they are not ledger postings.",
        },
        {
          label: "Current Year Profit",
          detail:
            "The year-to-date Income Statement result, including exact 1 January opening inventory and the selected month's closing inventory, is added to Equity.",
        },
      ],
      notesHeading: "Important report rules",
      notes: [
        "Only posted journals are included; operational invoice, receipt or supplier-payment status is not read directly.",
        "Balance Sheet accounts use their latest applicable opening balance, but Current Year Profit always uses the exact fiscal-year opening-inventory balances instead of later checkpoints.",
        "Closing stock is exact-month only. If no values are saved for the selected month, neither inventory nor Current Year Profit receives a closing-stock adjustment.",
        "Depreciation, loan changes and other period-end adjustments appear only when their journals have been posted.",
      ],
      footer:
        "Accounts roll up by their own financial-statement note or the nearest parent account's note, and the balance check compares total assets with liabilities plus equity.",
    },
    cogm: {
      title: "How this report is built",
      intro:
        "This Cost of Goods Manufactured report is year to date: 1 January through the selected month end. It combines opening materials, posted manufacturing costs and the selected month's closing materials.",
      sourcesHeading: "Report sources",
      sources: [
        {
          label: "Opening raw and packing materials",
          detail:
            "Only the exact 1 January opening balances mapped to Notes 3-3 and 3-7 are included. Later opening-balance checkpoints do not replace them.",
        },
        {
          label: "Material purchases",
          detail:
            "Material purchases are keyed on Journal Entries as PUR journals. Mapped raw-material, packing and chemical purchase accounts roll into Notes 3-5, 3-2 and 3-4.",
        },
        {
          label: "Freight and other manufacturing costs",
          detail:
            "Posted journals mapped to Freight and Transportation and other CoGM notes are included in the manufacturing total.",
        },
        {
          label: "Factory payroll",
          detail:
            "Voucher Generator posts factory-worker salary and employer contribution costs to the mapped manufacturing accounts, including Note 5-1.",
        },
        {
          label: "Closing raw and packing materials",
          detail:
            "The saved values for Balance Sheet Note 14-2 (raw materials) and Note 14-3 (packing materials) are inserted as deductions in CoGM; no journal is posted.",
        },
      ],
      notesHeading: "Important report rules",
      notes: [
        "Only posted journals are included, plus the exact 1 January opening-material balances and exact selected-month closing-material values.",
        "Finished-goods opening and closing inventory is excluded from CoGM and handled by the Income Statement instead.",
        "An unkeyed closing-stock month receives no deduction, and an earlier month's value is never carried forward.",
        "Child purchase accounts inherit the nearest parent account's financial-statement note, so new mapped supplier accounts roll up without a separate note on every child.",
      ],
      footer:
        "Total CoGM is raw-material cost plus packing-material cost, factory labour and other manufacturing costs after the closing-material deductions.",
    },
  },
  greentarget: {
    trial_balance: {
      title: "How this report is built",
      intro:
        "This Green Target Trial Balance shows each active account that has an opening balance or posted movement as at the selected month end. Each account starts from its latest opening balance on or before that date, then adds posted debit less credit movement from the opening date through month end; an unanchored account starts from 1 January.",
      sourcesHeading: "Report sources",
      sources: [
        {
          label: "Opening balances",
          detail:
            "The verified 1 January legacy opening set, together with any later authorised opening balance, supplies each account's starting amount.",
        },
        {
          label: "Legacy January to June ledger",
          detail:
            "The imported legacy journals reproduce the six verified January-to-June 2026 Trial Balances and the verified June statements. Approved historical corrections remain separate, traceable posted journals.",
        },
        {
          label: "Live sales",
          detail:
            "From 1 July 2026, each invoice creates a Sales journal that debits the receivable account saved on the invoice and credits its saved TGA, TGB or WS_OTH revenue allocations.",
        },
        {
          label: "Live receipts",
          detail:
            "A post-cutover posted receipt owns one consolidated REC journal: one debit to PBB_1 and one receivable credit per invoice allocation. Pre-cutover operational receipts create no new journal because their collection is already in the imported ledger. Cheques post only on their actual clearance date.",
        },
        {
          label: "Adjustments",
          detail:
            "Credit Notes and Debit Notes use the original invoice's receivable and revenue split accounts. A paired Refund Note reverses the receipt side between the original receivable account and PBB_1.",
        },
        {
          label: "Payroll and manual journals",
          detail:
            "Salary and director-remuneration vouchers, bank or cash payments, journal vouchers and other approved manual entries are included when posted.",
        },
      ],
      notesHeading: "Important report rules",
      notes: [
        "Green Target reads only the greentarget ledger. No Tien Hock account, journal or opening balance can enter this report.",
        "Only posted journals count. Normal entry screens reject ledger changes before the 1 July 2026 cutover; the verified import and approved corrections preserve that history.",
        "Trade-debtor accounts are combined into the net DEBTOR control row by default. Filtering to the TD ledger type itemises them; because the default row is netted, the itemised debit and credit totals can differ from the default totals.",
        "Search, Hide zero and pagination change displayed rows only. The Ledger Type filter is the only row filter that changes reported totals.",
      ],
      footer:
        "The APPX shown here is the Trial Balance classification. Green Target's statements use their own verified layout, including three documented cases where the Trial Balance APPX differs from the statement line.",
    },
    income_statement: {
      title: "How this report is built",
      intro:
        "This Green Target Income Statement is year to date: 1 January through the selected month end. It sums posted journal movement only and places each amount into Green Target's verified statement sections.",
      sourcesHeading: "Report sources",
      sources: [
        {
          label: "Legacy January to June ledger",
          detail:
            "The verified imported journals provide the historical revenue, direct costs, other income, administrative expenses, finance costs and tax movement.",
        },
        {
          label: "Revenue and adjustments",
          detail:
            "Live Sales journals credit TGA, TGB or WS_OTH revenue splits. Credit Notes and Debit Notes reverse or add revenue using the invoice snapshots.",
        },
        {
          label: "Direct costs",
          detail:
            "Posted movement in Green Target's direct-cost section includes burning materials, plant depreciation, EPF, SOCSO, freight, plant hire, inspection fees, chemicals, repairs, wages and vehicle running expenses.",
        },
        {
          label: "Payroll vouchers",
          detail:
            "JBSL and JWDR vouchers post staff salary, employer contribution and director-remuneration expenses and their accruals.",
        },
        {
          label: "Other and manual journals",
          detail:
            "Other operating income, Schedule 5 administrative expenses, finance costs, tax and approved adjustments are included when their journals are posted to the mapped accounts.",
        },
      ],
      notesHeading: "Important report rules",
      notes: [
        "Opening balances are not added to this report; it uses posted movement from 1 January through month end.",
        "Green Target has no stock, closing-stock injection or CoGM report. Tien Hock's inventory rules do not apply here.",
        "Statement placement follows Green Target's statement sections, not Tien Hock's note meanings or layout.",
        "Three verified exceptions are applied: FC_TL prints at Note 23, FC_HP prints as Hire Purchase Interest without a note, and INPUT.TAX belongs to Balance Sheet Note 17.",
      ],
      footer:
        "Profit for the Financial Year is the exact result passed to the Green Target Balance Sheet, so the two reports cannot calculate different profit figures.",
    },
    balance_sheet: {
      title: "How this report is built",
      intro:
        "This Green Target Balance Sheet shows the position as at the selected month end. Each account uses its latest opening balance on or before that date plus posted movement from that opening date through month end.",
      sourcesHeading: "Report sources",
      sources: [
        {
          label: "Opening and legacy balances",
          detail:
            "The verified 1 January opening anchors and imported January-to-June journals establish the historical asset, liability and equity position.",
        },
        {
          label: "Receivables and bank",
          detail:
            "Live Sales journals build receivables, posted receipt journals reduce them and debit PBB_1, and adjustment journals update the original invoice balances.",
        },
        {
          label: "Payables, accruals and financing",
          detail:
            "Salary vouchers, bank or cash payments and manual journals build trade payables, accruals, other creditors, hire purchase and term-loan balances.",
        },
        {
          label: "Assets and equity",
          detail:
            "Property, deposits, director balances, tax balances, cash, share capital and retained profit come from their latest anchors and posted journals.",
        },
        {
          label: "Profit for the Financial Year",
          detail:
            "The exact year-to-date Income Statement result is inserted into Equity with the legacy DN marker.",
        },
      ],
      notesHeading: "Important report rules",
      notes: [
        "Only posted journals and active accounts are included, and all data stays inside the isolated Green Target ledger.",
        "Green Target has no inventory or closing-stock injection, so no stock value is added at report level.",
        "The verified layout places Note 9 Amount Due To Directors in current assets, Notes 11 and 16 in current liabilities, and Note 12 in long-term liabilities.",
        "APPX and statement notes are separate classifications: INPUT.TAX moves from APPX 10 to Balance Sheet Note 17, while finance-cost overrides are handled by the Income Statement.",
      ],
      footer:
        "The balance check compares Net Assets with Total Financed By, using the same Profit for the Financial Year returned by the Income Statement.",
    },
  },
};
