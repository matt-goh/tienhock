// src/types/types.ts
export interface DeviceInfo {
  userAgent: string;
  deviceType: "Mobile" | "Desktop";
  timestamp: string;
}

export interface ActiveSession {
  sessionId: string;
  staffId: string | null;
  staffName?: string | null;
  staffJob?: string[] | null;
  deviceInfo?: DeviceInfo | string;
  lastActive: string;
  status: "active" | "ended" | "expired";
  metadata?: {
    lastProfileSwitch?: string;
    endTime?: string;
    expiredAt?: string;
  };
  lastEventId?: number;
  lastEventType?: string;
  lastEventTime?: string;
}

export interface SessionEvent {
  id: number;
  sessionId: string;
  eventType: "SESSION_END" | "SESSION_EXPIRED";
  metadata: {
    previousStaffId?: string;
    newStaffId?: string;
    timestamp: string;
    endTime?: string;
    reason?: string;
  };
  createdAt: string;
  staffInfo?: {
    name: string | null;
    job: string[] | null;
  };
}

export interface SessionState {
  hasActiveProfile: boolean;
  staff: Staff | null;
  lastActive: string;
}

export interface SessionError extends Error {
  code:
    | "INITIALIZATION_ERROR"
    | "NETWORK_ERROR"
    | "STORAGE_ERROR"
    | "SESSION_EXPIRED"
    | "INVALID_STATE";
}

export interface Staff {
  id: string;
  name: string;
  job: string[];
}

export interface ValidationDetail {
  code: string;
  message: string;
  target?: string;
  propertyPath?: string;
  details?: ValidationDetail[] | null;
}

// Document response types
export interface DocumentBase {
  internalId: string;
  uuid?: string;
}

export interface AcceptedDocument extends DocumentBase {
  uuid: string;
  status: "ACCEPTED";
}

export interface RejectedDocument {
  internalId: string;
  status: "REJECTED";
  error: ValidationDetail;
}

// API Response types
export interface InitialSubmissionResponse {
  submissionUid: string;
  acceptedDocuments: AcceptedDocument[];
  rejectedDocuments: RejectedDocument[];
  documentCount: number;
  dateTimeReceived: string;
  overallStatus: string;
}

export interface DocumentSummaryStatus {
  uuid?: string;
  submissionUid?: string;
  longId?: string;
  internalId?: string; // This is the invoice number
  typeName?: string;
  typeVersionName?: string;
  issuerTin?: string;
  issuerName?: string;
  receiverId?: string;
  receiverName?: string;
  dateTimeIssued?: string;
  dateTimeReceived?: string;
  dateTimeValidated?: string | null;
  totalPayableAmount?: number;
  totalExcludingTax?: number;
  totalDiscount?: number;
  totalNetAmount?: number;
  status: "Submitted" | "Valid" | "Invalid" | "Rejected";
  cancelDateTime?: string | null;
  rejectRequestDateTime?: string | null;
  documentStatusReason?: string | null;
  createdByUserId?: string;
}

export interface ProcessingStatusResponse {
  submissionUid: string;
  documentCount: number;
  dateTimeReceived: string;
  overallStatus: "InProgress" | "Valid" | "Invalid" | "Rejected" | "Partial";
  documentSummary: DocumentSummaryStatus[];
}

// Submission tracking types
export interface BatchStatistics {
  totalDocuments: number;
  processed: number;
  accepted: number;
  rejected: number;
  processing: number;
  completed: number;
}

export interface DocumentStatus {
  invoiceNo: string;
  currentStatus:
    | "ACCEPTED"
    | "REJECTED"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED";
  uuid?: string;
  errors?: ValidationDetail[];
  summary?: DocumentSummaryStatus;
}

export interface SubmissionTracker {
  submissionUid: string;
  batchInfo: {
    size: number;
    submittedAt: string;
    completedAt?: string;
  };
  statistics: BatchStatistics;
  documents: {
    [invoiceNo: string]: DocumentStatus;
  };
  processingUpdates: Array<{
    timestamp: string;
    status: ProcessingStatusResponse;
    affectedDocuments: string[]; // invoice numbers
  }>;
  initialResponse?: InitialSubmissionResponse;
  finalStatus?: ProcessingStatusResponse;
  overallStatus: "InProgress" | "Valid" | "Invalid" | "Rejected" | "Partial";
}

// UI State types
export type SubmissionPhase =
  | "INITIALIZATION"
  | "VALIDATION"
  | "SUBMISSION"
  | "PROCESSING"
  | "COMPLETED";

export interface SubmissionState {
  phase: SubmissionPhase;
  tracker: SubmissionTracker | null;
  error?: {
    type: "SYSTEM" | "API" | "VALIDATION";
    message: string;
    details?: any;
  };
}
export interface BatchStatusDisplayProps {
  statistics: BatchStatistics;
  phase: SubmissionPhase;
  showProgress?: boolean;
}

export interface DocumentListDisplayProps {
  documents: {
    [invoiceNo: string]: DocumentStatus;
  };
  filter?: "all" | "accepted" | "rejected" | "processing" | "completed";
  showDetails?: boolean;
}

export interface ErrorDisplayProps {
  documents: {
    [invoiceNo: string]: DocumentStatus;
  };
  statistics: BatchStatistics;
  showValidationDetails?: boolean;
}

export interface NormalizedError {
  invoiceNo: string;
  errors: string[];
  type: "validation" | "submission";
  message?: string;
}

export interface TokenInfo {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  apiEndpoint: string;
  tokenInfo?: TokenInfo;
  tokenCreationTime?: number;
  error?: string;
  details?: any;
}

export interface SubmissionInfo {
  startDate: Date;
  endDate: Date;
  selectedInvoices: InvoiceData[];
}

// Define column types
export type ColumnType =
  | "selection"
  | "string"
  | "number"
  | "rate"
  | "readonly"
  | "checkbox"
  | "amount"
  | "float"
  | "action"
  | "listbox"
  | "combobox";

// Define column configuration
export interface ColumnConfig {
  id: string;
  header: string;
  type: ColumnType;
  width?: number;
  options?: string[];
  cell?: (info: {
    getValue: () => any;
    row: { original: any; index?: any };
  }) => React.ReactNode;
  cellProps?: (info: { getValue: () => any; row: { original: any } }) => {
    value: any;
    onChange: (newValue: any) => void;
  };
  onChange?: (rowIndex: number, newValue: string) => void;
}

// Define data structure
export interface Data {
  [key: string]: any;
}

export type InvoiceStatus =
  | "active"
  | "paid"
  | "cancelled"
  | "Unpaid"
  | "Overdue";
export type EInvoiceStatus =
  | "valid"
  | "invalid"
  | "pending"
  | "cancelled"
  | null;

export interface InvoiceData {
  id: string; // PRIMARY KEY, Invoice Number (e.g., "12345")
  salespersonid: string;
  customerid: string;
  createddate: string; // Still storing as string (timestamp)
  paymenttype: "CASH" | "INVOICE"; // Keep consistent with backend

  total_excluding_tax: number;
  rounding: number;
  totalamountpayable: number;
  tax_amount: number;
  balance_due: number;

  // E-invoice fields
  uuid: string | null; // UUID from e-invoice system
  submission_uid: string | null;
  long_id: string | null;
  datetime_validated: string | null; // ISO timestamp string or null
  is_consolidated: boolean;
  consolidated_invoices: string[] | null; // Array of invoice IDs or null
  customerTin?: string;
  customerIdNumber?: number;
  customerPhone?: string; // Phone number for e-invoice compliance

  // Status fields
  invoice_status: InvoiceStatus;
  einvoice_status: EInvoiceStatus; // Keep EInvoiceStatus type separate

  products: ProductItem[];
  customerName?: string; // For UI display
}

// Extended invoice for UI purposes
export interface ExtendedInvoiceData extends InvoiceData {
  isEditing?: boolean; // UI state flag
  originalId?: string; // Used when invoice ID itself is changed during edit
  cancellation_date?: string | null; // ISO date string of cancellation (might come from cancelled_invoices table)
  invoice?: string;
  payment_method?: Payment["payment_method"];
  payment_reference?: string;
  payment_notes?: string;
  consolidated_part_of?: ConsolidatedInfo | null;
  adjustmentDocs?: AdjustmentDocument[];
}

export interface ProductItem {
  uid?: string; // Unique ID for front-end list rendering (not in DB)
  id?: string; // Corresponds to order_details.id in DB
  code: string;
  price: number;
  quantity: number;
  description?: string;
  freeProduct: number;
  returnProduct: number;
  tax: number;
  total: string; // Keep as string for display consistency, parse when needed
  issubtotal?: boolean;
  istotal?: boolean; // Only used in frontend calculation display, not stored in DB
  rounding?: number; // Only used in frontend 'total' row calculation display
  amount?: string; // Only used in frontend 'total' row display (subtotal)
}

// Product row interface for UI with all possible states
export interface ExtendedProductItem extends ProductItem {
  description?: string;
  // Make all boolean flags required with default false
  isSubtotal: boolean;
  isTotal: boolean;
}

export interface CustomProduct {
  uid?: string;
  id?: string;
  customer_id: string;
  product_id: string;
  description?: string;
  custom_price: number | string;
  is_available: boolean;
}

export interface Payment {
  payment_id: number;
  invoice_id: string;
  customerid?: string;
  customer_name?: string;
  payment_date: string;
  amount_paid: number;
  payment_method: "cash" | "cheque" | "bank_transfer" | "online";
  payment_reference?: string;
  internal_reference?: string;
  bank_account?: "CASH" | "BANK_PBB" | "BANK_ABB";
  journal_entry_id?: number;
  journal_reference_no?: string; // Reference number from associated journal entry (e.g., REC001/01)
  notes?: string;
  created_at?: string;
  status?: "active" | "cancelled" | "pending" | "overpaid";
  cancellation_date?: string;
  cancellation_reason?: string;
}

export type AdjustmentDocType = "credit_note" | "debit_note" | "refund_note";

export interface AdjustmentDocLine {
  id?: number;
  line_number?: number;
  code: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  tax: number | null;
  total: number | null;
  issubtotal: boolean;
}

export interface AdjustmentDocument {
  id: string; // CN-2026-0001 / DN-2026-0001 / RN-2026-0001
  type: AdjustmentDocType;
  original_invoice_id: string;
  customerid: string;
  customer_name?: string;
  salespersonid: string | null;
  createddate: string; // unix ms as string (matches invoices)
  reason: string | null;
  paired_with_id: string | null;
  linked_payment_id: number | null;
  references_consolidated_id: string | null;

  total_excluding_tax: number;
  tax_amount: number;
  rounding: number;
  totalamountpayable: number;

  refund_method: Payment["payment_method"] | null;
  refund_reference: string | null;
  bank_account: Payment["bank_account"] | null;

  uuid: string | null;
  submission_uid: string | null;
  long_id: string | null;
  datetime_validated: string | null;
  einvoice_status: EInvoiceStatus;

  is_consolidated: boolean;
  consolidated_adjustments: string[] | null;

  status: "active" | "cancelled";
  cancellation_reason: string | null;
  cancellation_date: string | null;
  journal_entry_id: number | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields when fetching list
  original_invoice_einvoice_status?: EInvoiceStatus;
  paired_doc_id?: string | null;
  paired_type?: AdjustmentDocType | null;
  paired_status?: "active" | "cancelled" | null;
  paired_einvoice_status?: EInvoiceStatus;

  // Populated by /:id endpoint
  lines?: AdjustmentDocLine[];
  linked_payment?: {
    payment_id: number;
    status: Payment["status"];
    amount_paid: number;
    cancellation_date?: string | null;
    cancellation_reason?: string | null;
  } | null;
}

export interface Employee {
  id: string;
  name: string;
  telephoneNo: string;
  email: string;
  gender: string;
  nationality: string;
  birthdate: string;
  address: string;
  job: string[];
  location: string[];
  jobType?: string;
  dateJoined: string;
  icNo: string;
  bankAccountNumber: string;
  epfNo: string;
  incomeTaxNo: string;
  socsoNo: string;
  document: string;
  paymentType: string;
  paymentPreference: string;
  race: string;
  agama: string;
  dateResigned: string;
  newId: string;
  maritalStatus: string;
  spouseEmploymentStatus: string;
  numberOfChildren: number;
  department: string;
  kwspNumber: string;
  // Per-staff statutory contribution overrides ("" = auto from birthdate/nationality).
  // Age overrides: "under_60" | "over_60" | "none" (not eligible).
  // epfNationalityOverride: "local" | "foreign".
  epfAgeOverride: string;
  epfNationalityOverride: string;
  socsoAgeOverride: string;
  sipAgeOverride: string;
  updatedAt?: string;
  headStaffId?: string | null;
}

export type FilterOptions = {
  showResigned?: boolean;
  jobFilter?: string[] | null;
  applyJobFilter?: boolean;
  nationality?: string;
  gender?: string;
  race?: string;
};

export interface InvoiceFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  salespersonId: string[] | null;
  customerId: string | null;
  paymentType: string | null;
  invoiceStatus: string[];
  eInvoiceStatus: string[];
  consolidation: "all" | "individual" | "consolidated";
}

export interface Customer {
  id: string;
  name: string;
  salesman: string;
  phone_number?: string;
  tin_number?: string;
  id_number?: string;
  closeness: string;
  email?: string;
  address?: string;
  city: string;
  state: string;
  id_type: string;
  originalId?: string;
  credit_limit?: number;
  credit_used?: number;
}

export interface Job {
  id: string;
  name: string;
  section: string[];
  newId: string;
}

export interface JobDetail {
  id: string;
  description: string;
  amount: number;
  remark: string;
  type: string;
}

export interface JobCategory {
  id: string;
  originalId?: string;
  category: string;
  section: string;
  gaji: string;
  ikut: string;
  jv: string;
  [key: string]: string | undefined;
}

export interface RentalDetail {
  rental_id: number;
  tong_no?: string;
  date_placed: string;
  date_picked?: string | null;
  driver?: string;
  location_address?: string;
  location_phone_number?: string;
}

export interface InvoiceGT {
  invoice_id: number;
  invoice_number: string;
  type: "regular" | "statement";
  customer_id: number;
  customer_name: string;
  customer_phone_number?: string;
  tin_number?: string;
  id_number?: string;
  additional_info?: string;
  location_address?: string;
  location_phone_number?: string;
  date_placed?: string;
  date_picked?: string;
  rental_id?: number;
  driver?: string;
  tong_no?: string;
  // New multi-rental support
  rental_details?: RentalDetail[];
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  current_balance: number;
  date_issued: string;
  balance_due: number;
  statement_period_start?: string;
  statement_period_end?: string;
  status: "paid" | "unpaid" | "cancelled" | "overdue";
  consolidated_part_of?: ConsolidatedInfo | null;
  agingData?: {
    current: number;
    month1: number;
    month2: number;
    month3Plus: number;
    total: number;
  };

  // E-invoice fields
  einvoice_status?: "valid" | "invalid" | "pending" | "cancelled" | null;
  uuid: string | null; // UUID from e-invoice system
  submission_uid: string | null;
  long_id: string | null;
  datetime_validated: string | null; // ISO timestamp string or null
  is_consolidated: boolean;
  consolidated_invoices: string[] | null; // Array of invoice IDs or null
  consolidated_source_invoices?: Array<{
    invoice_id: number;
    invoice_number: string;
    amount_before_tax: number;
    tax_amount: number;
    total_amount: number;
  }>;
  cancellation_date?: string | null;
  cancellation_reason?: string;
  adjustmentDocs?: GTAdjDocSummary[];
}

export interface GTAdjDocSummary {
  id: string;
  type: "credit_note" | "debit_note" | "refund_note";
  total_amount: number;
  status: "active" | "cancelled";
  is_consolidated: boolean;
  paired_with_id: string | null;
  paired_status?: string | null;
  refund_method?: string | null;
  refund_reference?: string | null;
  reason?: string | null;
  created_at?: string | null;
}

// Define the type for submission results
export interface EInvoiceSubmissionResult {
  success: boolean;
  message?: string;
  overallStatus?: string;
  error?: string;
  rejectedDocuments?: Array<{
    internalId: string;
    error: {
      code: string;
      message: string;
    };
  }>;
}

export interface ConsolidatedInfo {
  id: string;
  uuid: string | null;
  long_id: string | null;
  einvoice_status: EInvoiceStatus;
  invoice_number?: string;
}

export interface SelectOption {
  id: string;
  name: string;
  phone_number?: string;
  job?: string;
}

export type PayType = "Base" | "Tambahan" | "Overtime";
export type RateUnit = "Hour" | "Bill" | "Bag" | "Ctn" | "Percent" | "Fixed" | "Day" | "Trip" | "Tray" | "Kg" | "Karung" | "Bundle";

// Effective-month-dated rate override layered over the base rate columns.
// Resolved at payroll-process time by get_effective_pay_rate(); see
// pay_rate_schedules in the Database Schema notes.
export type PayRateScheduleScope = "pay_code" | "job" | "employee";
export interface PayRateSchedule {
  id: number;
  scope: PayRateScheduleScope;
  job_id: string | null;
  employee_id: string | null;
  pay_code_id: string;
  effective_year: number;
  effective_month: number; // 1-12; applies from this month onward
  rate_biasa: number | null;
  rate_ahad: number | null;
  rate_umum: number | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

export interface PayCode {
  id: string;
  description: string;
  pay_type: PayType;
  rate_unit: RateUnit;
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
  is_active: boolean;
  requires_units_input: boolean;
  // Optional Salary Report column override: "GAJI" | "OT" | "BONUS" | "CIO" | "CUTI".
  // null = use automatic bucketing. Sits below the per-entry others_records.report_column override.
  report_column?: string | null;
  created_at?: string;
  updated_at?: string;
  section_id?: string; // Optional field to indicate the section when used in section_pay_codes
  override_rate_biasa?: number | null; // Used for section-specific overrides
  override_rate_ahad?: number | null; // Used for section-specific overrides
  override_rate_umum?: number | null; // Used for section-specific overrides
  is_default?: boolean; // Used for section-specific settings
}

export interface JobPayCodeDetails
  extends Omit<PayCode, "rate_biasa" | "rate_ahad" | "rate_umum"> {
  // Omit original rates from PayCode base
  job_id: string;
  pay_code_id: string; // Same as id from PayCode table
  is_default_setting: boolean;
  // Default rates (ensure these are numbers after fetch/parse)
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
  // Override rates
  override_rate_biasa: number | null;
  override_rate_ahad: number | null;
  override_rate_umum: number | null;
}

export interface ProductPayCodeDetails {
  id: string;
  pay_code_id: string;
  description: string;
  pay_type: PayType;
  rate_unit: RateUnit;
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
  is_active: boolean;
  requires_units_input: boolean;
}

export interface JobLocationMapping {
  id: number;
  job_id: string;
  job_name: string;
  location_code: string;
  location_name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeePayroll {
  id?: number;
  monthly_payroll_id?: number;
  employee_id: string;
  employee_name?: string;
  job_type: string;
  section: string;
  gross_pay: number;
  net_pay: number;
  year?: number;
  month?: number;
  // Timestamps used by the Payroll page "Recent" view recency fallback.
  created_at?: string;
  updated_at?: string;
  items: PayrollItem[];
  deductions?: PayrollDeduction[];
  leave_records?: LeaveRecord[];
  mid_month_payroll?: MidMonthPayroll | null;
  // Per-sibling mid-month advance amounts for combined payrolls, keyed by
  // employee_id (e.g. {"JASSON_PM": 200, "JASSON_ROLL": 250}). The combined
  // `mid_month_payroll.amount` carries the aggregate; this map drives the
  // per-identity advance shown on each individual breakdown slip.
  mid_month_payrolls_by_employee?: Record<string, number>;
  commission_records?: CommissionRecord[];
  others_records?: OthersRecord[];
  // Mapping of employee_id to job_type for combined payrolls (e.g., {"MASRUN_S": "MEE_ROLL", "MASRUN": "MEE_SANGKUT"})
  employee_job_mapping?: Record<string, string>;
  // Designated Head sibling id (staffs.head_staff_id) for the same-name group, or
  // null when no Head is set. Drives which individual breakdown slip carries the
  // statutory deductions and is rendered first.
  head_employee_id?: string | null;
  // Section name per job_type (e.g., {"MEE_PACKING": "Mee", "BIHUN_SANGKUT": "Bihun"})
  // so each individual breakdown slip shows its own job's Bahagian.
  job_sections?: Record<string, string>;
  // Rounding adjustment values
  digenapkan?: number;          // Rounding adjustment amount
  setelah_digenapkan?: number;  // Final rounded amount (take-home, advances deducted)
  // Commission/bonus advances (is_advance) for the month, aggregated by name.
  // Added back to derive the Salary Report "Setelah Digenapkan" grand total.
  commission_advance?: number;
}

export interface CommissionRecord {
  id: number;
  employee_id: string;
  commission_date: string;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
  employee_name?: string;
  is_advance?: boolean;
  location_code?: string | null;
}

export interface OthersRecord {
  id: number;
  employee_id: string;
  record_date: string;
  pay_code_id: string | null;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  link_id: string | null;
  // Optional Salary Report column override: "GAJI" | "OT" | "BONUS" | "CIO" | "CUTI".
  // null/undefined = use the automatic bucketing rule.
  report_column?: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  employee_name?: string;
  pay_code_description?: string | null;
  pay_code_pay_type?: PayType | null;
}

export interface LeaveRecord {
  date: string;
  employee_id?: string;
  leave_type: string;
  days_taken: number;
  amount_paid: number;
  work_log_id?: number | null;
  work_log_type?: "daily" | "monthly" | "packing_cuti" | null;
  work_log_section?: string | null;
  notes?: string | null;
  holiday_description?: string | null;
}

export interface PayrollItem {
  id?: number;
  pay_code_id: string;
  description: string;
  pay_type: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  is_manual: boolean;
  job_type?: string; // Job type for accurate splitting in combined payrolls
  source_employee_id?: string | null; // Original employee ID who worked this item
  // Source tracking fields for traceability to work logs
  source_date?: string | null; // ISO date string (YYYY-MM-DD)
  work_log_id?: number | null; // Reference to work log
  // "daily" | "monthly" for work logs; "production" | "production_bonus" |
  // "prod_bonus_rosak" for production entries; null for manual/other.
  work_log_type?: string | null; // Type of work log / source
}

export interface MonthlyPayroll {
  id: number;
  year: number;
  month: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  employeePayrolls: EmployeePayroll[];
}

export interface EPFRate {
  id: number;
  employee_type: string;
  wage_threshold: number | null;
  employee_rate_percentage: number;
  employer_rate_percentage: number | null;
  employer_fixed_amount: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SOCSORRate {
  id: number;
  wage_from: number;
  wage_to: number;
  employee_rate: number;
  employee_rate_skbbk: number;
  employer_rate: number;
  employer_rate_over_60: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SIPRate {
  id: number;
  wage_from: number;
  wage_to: number;
  employee_rate: number;
  employer_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IncomeTaxRate {
  id: number;
  wage_from: number;
  wage_to: number;
  base_rate: number;
  // Unemployed spouse rates
  unemployed_spouse_k0: number;
  unemployed_spouse_k1: number;
  unemployed_spouse_k2: number;
  unemployed_spouse_k3: number;
  unemployed_spouse_k4: number;
  unemployed_spouse_k5: number;
  unemployed_spouse_k6: number;
  unemployed_spouse_k7: number;
  unemployed_spouse_k8: number;
  unemployed_spouse_k9: number;
  unemployed_spouse_k10: number;
  // Employed spouse rates
  employed_spouse_k0: number;
  employed_spouse_k1: number;
  employed_spouse_k2: number;
  employed_spouse_k3: number;
  employed_spouse_k4: number;
  employed_spouse_k5: number;
  employed_spouse_k6: number;
  employed_spouse_k7: number;
  employed_spouse_k8: number;
  employed_spouse_k9: number;
  employed_spouse_k10: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PayrollDeduction {
  deduction_type: "epf" | "socso" | "sip" | "income_tax";
  employee_amount: number;
  employer_amount: number;
  wage_amount: number;
  rate_info: {
    rate_id: number;
    employee_rate: number | string;
    employer_rate: number | string;
    age_group?: string;
    wage_ceiling_used?: number;
    tax_category?: string; // e.g., "Single", "Married-K2-Unemployed"
    // SOCSO split: Keilatan (existing) + SKBBK (new gazette). Sum = employee_amount.
    keilatan_amount?: number;
    skbbk_amount?: number;
  };
}

export interface MidMonthPayroll {
  id: number;
  employee_id: string;
  employee_name: string;
  year: number;
  month: number;
  amount: number;
  payment_method: "Cash" | "Bank" | "Cheque";
  status: "Pending" | "Paid" | "Cancelled";
  created_at: string;
  updated_at: string;
  paid_at?: string;
  notes?: string;
  default_payment_method?: string;
}

export interface PinjamRecord {
  id: number;
  employee_id: string;
  employee_name?: string;
  year: number;
  month: number;
  amount: number;
  description: string;
  pinjam_type: "mid_month" | "monthly";
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

// ==================== ACCOUNTING / JOURNAL SYSTEM TYPES ====================

// Ledger Type (TL column from Chart of Accounts)
export interface LedgerType {
  code: string; // e.g., "CS", "GL", "OS", "TD", "TC", "BK"
  name: string;
  description?: string;
  is_system: boolean; // System types cannot be deleted
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// Account Code
export interface AccountCode {
  id: number;
  code: string; // e.g., "CS_B21", "ABB", "DEBTOR"
  description: string;
  ledger_type: string | null; // Reference to LedgerType.code
  parent_code: string | null; // Self-referencing for hierarchy
  level: number; // 1 = top level, 2 = sub-account, etc.
  sort_order: number;
  is_active: boolean;
  is_system: boolean; // System accounts cannot be deleted
  notes?: string;
  fs_note?: string | null; // Financial statement note reference (e.g., "1", "3-1", "14-2")
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

// Extended Account Code with hierarchy info (from view)
export interface AccountCodeHierarchy extends AccountCode {
  path: string; // Full path like "CS > CS_PM > CS_BPMB"
  path_array: string[]; // Array of codes in path
  depth: number; // Depth in tree
  children?: AccountCodeHierarchy[]; // For tree display
}

// For creating/updating account codes
export interface AccountCodeInput {
  code: string;
  description: string;
  ledger_type?: string | null;
  parent_code?: string | null;
  level?: number;
  sort_order?: number;
  is_active?: boolean;
  notes?: string;
}

// Journal Entry Types
export type JournalEntryType = "B" | "C" | "I" | "S" | "J" | "R" | "DR" | "CR" | "O";

export interface JournalEntryTypeInfo {
  code: JournalEntryType;
  name: string;
  description?: string;
  is_active: boolean;
}

// Journal Entry Header
export interface JournalEntry {
  id: number;
  reference_no: string; // e.g., "PBE002/06"
  entry_type: JournalEntryType;
  entry_date: string; // ISO date string
  description?: string;
  total_debit: number;
  total_credit: number;
  status: "draft" | "posted" | "cancelled";
  cheque_no?: string; // Sequential cheque number, Cash Payment (C) entries only
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
  posted_at?: string;
  posted_by?: string;
  lines?: JournalEntryLine[]; // Line items
}

// Journal Entry Line Item
export interface JournalEntryLine {
  id?: number;
  journal_entry_id?: number;
  line_number: number;
  account_code: string;
  account_description?: string; // For display
  debit_amount: number;
  credit_amount: number;
  reference?: string; // e.g., cheque number
  particulars?: string; // Line description
  created_at?: string;
}

// For creating journal entries
export interface JournalEntryInput {
  reference_no: string;
  entry_type: JournalEntryType;
  entry_date: string;
  description?: string;
  cheque_no?: string;
  lines: JournalEntryLineInput[];
}

export interface JournalEntryLineInput {
  line_number: number;
  account_code: string;
  debit_amount: number;
  credit_amount: number;
  reference?: string;
  particulars?: string;
}

// Account Code Import (for CSV migration)
export interface AccountCodeImportRow {
  code: string;
  description: string;
  tl?: string; // Ledger type
  main_acc?: string; // Parent account
  sl_acc?: string; // Sub-ledger accounts (comma-separated)
}

// Account Code Tree Node (for UI tree display)
export interface AccountCodeTreeNode {
  code: string;
  description: string;
  ledger_type: string | null;
  is_active: boolean;
  level: number;
  children: AccountCodeTreeNode[];
  isExpanded?: boolean;
}

// Filters for account code list
export interface AccountCodeFilters {
  search?: string;
  ledger_type?: string | null;
  is_active?: boolean | null;
  parent_code?: string | null;
}

// ==================== STOCK & PRODUCTION SYSTEM TYPES ====================

// Product for stock system (simplified)
export interface StockProduct {
  id: string;
  description: string;
  type: "BH" | "MEE" | "JP" | "OTH" | "TAX" | "BUNDLE";
  price_per_unit?: number;
  is_active?: boolean;
}

// Production Entry
export interface ProductionEntry {
  id?: number;
  entry_date: string; // YYYY-MM-DD
  product_id: string;
  worker_id: string | null;
  worker_name?: string;
  bags_packed: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  product_description?: string;
  product_type?: string;
  machine_broken?: boolean;
}

// Production Entry Batch (for daily form submission)
export interface ProductionEntryBatch {
  date: string; // YYYY-MM-DD
  product_id: string;
  entries: Array<{
    worker_id: string;
    bags_packed: number;
  }>;
  created_by?: string;
}

// Production Worker (for worker selection)
export interface ProductionWorker {
  id: string;
  name: string;
  job: string[];
}

export type ProductionWorkerOrderScope = "BH_PACKING" | "MEE_PACKING";

export interface ProductionWorkerOrderResponse {
  scope: ProductionWorkerOrderScope;
  worker_ids: string[];
}

export interface ProductionWorkerOrderRequest {
  scope: ProductionWorkerOrderScope;
  worker_ids: string[];
}

// Special Item Configuration (for Hancur, Bundle entries)
export type SpecialItemCategory = "HANCUR" | "KARUNG_HANCUR" | "BUNDLE";
export type SpecialItemUnit = "kg" | "bags" | "pcs" | "sack" | "bundle";

export interface SpecialItemConfig {
  id: string;
  name: string;
  nameBM: string;
  description: string;
  descriptionBM: string;
  category: SpecialItemCategory;
  productType: "BH" | "MEE" | "BUNDLE";
  workerJob: "BH_PACKING" | "MEE_PACKING";
  payCodeId: string;
  unit: SpecialItemUnit;
  inputStep: number; // 1 for integer, 0.01 for decimal
  defaultValue?: number;
  singleWorkerEntry?: {
    defaultWorkerId: string;
    allowChange: boolean;
  };
  hiddenFromUI?: boolean; // If true, item is internal and not shown in product selectors
}

// Stock Movement (single day)
export interface StockMovement {
  date: string; // YYYY-MM-DD
  day: number;
  bf: number; // Brought Forward
  production: number;
  adj_in: number; // Placeholder for future
  returns: number;
  sold_out: number;
  adj_out: number; // Placeholder for future
  foc: number;
  cf: number; // Carry Forward
}

// Stock API Response
export interface StockMovementResponse {
  product_id: string;
  product_description: string;
  product_type: string;
  opening_balance: number; // Calculated B/F from prior movements
  initial_balance: number; // Admin-set migration/opening balance
  initial_balance_date: string | null; // Anchor date (YYYY-MM-DD) the balance is effective from; null if none set
  date_range: {
    start_date: string;
    end_date: string;
    view_type: "month" | "rolling" | "custom";
  };
  movements: StockMovement[];
  monthly_totals: {
    production: number;
    adj_in: number;
    returns: number;
    sold_out: number;
    adj_out: number;
    foc: number;
  };
}

// Opening Balance
export interface OpeningBalance {
  id?: number;
  product_id: string;
  balance: number;
  effective_date: string; // YYYY-MM-DD
  notes?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  product_description?: string;
  product_type?: string;
}

// Stock Adjustment (for ADJ_IN, ADJ_OUT features)
export interface StockAdjustment {
  id?: number;
  entry_date: string; // YYYY-MM-DD
  product_id: string;
  adjustment_type: "ADJ_IN" | "ADJ_OUT" | "DEFECT";
  quantity: number;
  reference?: string; // Reference code for the adjustment batch
  reason?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  product_description?: string;
}

// Stock Adjustment Reference (for listing adjustment batches)
export interface StockAdjustmentReference {
  reference: string;
  product_count: number;
  total_adj_in: number;
  total_adj_out: number;
  created_at: string;
}

// Stock Adjustment Entry (for the entry form)
export interface StockAdjustmentEntry {
  product_id: string;
  product_description?: string;
  product_type?: string;
  adj_in: number;
  adj_out: number;
}

// Stock View Type
export type StockViewType = "month" | "rolling" | "custom";

// ==================== MATERIALS (INGREDIENTS/RAW/PACKING) TYPES ====================

export type MaterialCategory = "ingredient" | "raw_material" | "packing_material";
export type MaterialAppliesTo = "mee" | "bihun" | "both";
export type ProductLine = "mee" | "bihun" | "shared";
export type StockBucket = ProductLine;

// Material Master Data
export interface Material {
  id: number;
  code: string;
  name: string;
  category: MaterialCategory;
  default_unit_cost: number;
  applies_to: MaterialAppliesTo;
  sort_order: number;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

// For creating/updating materials
export interface MaterialInput {
  code: string;
  name: string;
  category: MaterialCategory;
  default_unit_cost: number;
  applies_to?: MaterialAppliesTo;
  sort_order?: number;
  is_active?: boolean;
  notes?: string | null;
}

// Material Variant (for materials with multiple supplier/price options)
export interface MaterialVariant {
  id: number;
  material_id: number;
  variant_name: string;  // e.g., "Vietnam (Coklat)", "RM 14.25 / 25Kg"
  default_unit_cost: number;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// For creating/updating variants
export interface MaterialVariantInput {
  variant_name: string;
  default_unit_cost?: number;
  sort_order?: number;
  is_active?: boolean;
}

// Material Stock Entry (monthly manual stock adjustment)
export interface MaterialStockEntry {
  id: number;
  year: number;
  month: number;
  material_id: number;
  product_line: ProductLine;
  variant_id?: number | null;  // Reference to material_variants (null for single-entry or ad-hoc)

  // Per-entry customization
  custom_name?: string | null;
  custom_description?: string | null;  // Used for ad-hoc variants (when variant_id is null)

  // Derived stock quantities
  opening_quantity: number;
  opening_value: number;
  purchase_quantity: number;
  purchase_value: number;
  adjustment_quantity: number;
  adjustment_value: number;
  closing_quantity: number;
  closing_value: number;

  // Adjustment pricing
  unit_cost: number;

  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;

  // Joined fields
  material_code?: string;
  material_name?: string;
  material_category?: MaterialCategory;
  default_unit_cost?: number;
}

// Single stock entry row (either a variant or the main material entry)
export interface StockEntryRow {
  // Entry identification
  entry_id: number | null;  // null for new entries
  variant_id: number | null;  // null for single-entry materials or ad-hoc variants
  variant_name: string | null;  // From variant table or custom_description for ad-hoc
  custom_description?: string | null;
  is_new_variant: boolean;  // True if this is a newly added ad-hoc variant

  // Stock quantities
  opening_quantity: number;
  opening_value: number;
  purchase_quantity: number;
  purchase_value: number;
  adjustment_quantity: number;
  adjustment_value: number;
  closing_quantity: number;
  closing_value: number;
  quantity: number;          // Backward-compatible alias for adjustment_quantity
  value: number;             // Backward-compatible alias for closing_value

  // Adjustment pricing
  unit_cost: number;

  // Notes
  notes?: string | null;
}

// Material with stock data (for stock entry page)
// Now supports multiple variant rows per material
export interface MaterialWithStock extends Material {
  // Stock quantities
  opening_quantity: number;
  opening_value: number;
  purchase_quantity: number;
  purchase_value: number;
  adjustment_quantity: number;
  adjustment_value: number;
  closing_quantity: number;
  closing_value: number;
  quantity: number;          // Backward-compatible alias for adjustment_quantity
  value: number;             // Backward-compatible alias for closing_value

  // Per-entry customization (for single-entry materials)
  custom_name?: string | null;
  custom_description?: string | null;

  // Pricing
  unit_cost: number;

  // Entry metadata
  entry_id: number | null;
  notes?: string | null;

  // Variant support
  variant_id?: number | null;  // For single-entry or when representing a specific variant
  variant_name?: string | null;  // From variant table
  has_variants: boolean;  // True if this material has defined variants
  variants?: StockEntryRow[];  // Array of variant entries (for materials with variants)
}

// Stock entry input for batch save
export interface MaterialStockEntryInput {
  material_id: number;
  variant_id?: number | null;  // Reference to registered variant (null for ad-hoc or single-entry)
  adjustment_quantity: number; // Manual plus/minus adjustment
  unit_cost: number;
  custom_name?: string | null;
  custom_description?: string | null;  // Used for ad-hoc variants when variant_id is null
  notes?: string | null;
  register_variant?: boolean;  // If true and variant_id is null, create new variant from custom_description
}

// Stock data response from API
export interface MaterialStockWithOpeningResponse {
  year: number;
  month: number;
  product_line: ProductLine;
  opening_period: { year: number; month: number };
  materials: MaterialWithStock[];
}

// Stock summary by category
export interface MaterialStockSummary {
  category: MaterialCategory;
  product_line: ProductLine;
  total_value: number;
  entry_count: number;
}

// Filters for material list
export interface MaterialFilters {
  search?: string;
  category?: MaterialCategory | null;
  is_active?: boolean | null;
  applies_to?: MaterialAppliesTo | "all" | null;
}

// ==================== CASH RECEIPT VOUCHER TYPES ====================

// Cash Receipt Voucher data for PDF generation
export interface CashReceiptVoucherData {
  // Voucher identification
  voucher_number: string; // REC reference (e.g., "REC001/01")
  voucher_date: string; // Payment date

  // Payment info
  payment_id: number;
  amount: number;
  payment_method: "cash" | "cheque" | "bank_transfer" | "online";
  payment_reference: string | null;
  bank_account: string;
  bank_account_description: string;

  // Customer/Invoice info
  customer_name: string;
  invoice_id: string;

  // Journal entry info
  journal_entry_id: number;
  description: string | null;

  // Journal entry lines for display
  lines: CashReceiptVoucherLine[];

  // Metadata
  created_at: string | null;
  created_by: string | null;
}

export interface CashReceiptVoucherLine {
  account_code: string;
  account_description: string;
  debit_amount: number;
  credit_amount: number;
}

// ==================== PURCHASES SYSTEM TYPES ====================

// Supplier Master Data
export interface Supplier {
  id: number;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// Supplier with summary (from GET /suppliers/:id)
export interface SupplierWithSummary extends Supplier {
  summary: {
    total_invoices: number;
    total_purchased: number;
    total_paid: number;
    outstanding_balance: number;
    unpaid_count: number;
    partial_count: number;
    paid_count: number;
  };
}

// Supplier for dropdown
export interface SupplierDropdown {
  id: number;
  code: string;
  name: string;
}

// Supplier input for create/update
export interface SupplierInput {
  code: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
}

// Purchase Invoice Payment Status
export type PurchasePaymentStatus = "unpaid" | "partial" | "paid";

// Purchase Invoice
export interface PurchaseInvoice {
  id: number;
  supplier_id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  payment_status: PurchasePaymentStatus;
  amount_paid: number;
  journal_entry_id: number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  // Joined fields
  supplier_code?: string;
  supplier_name?: string;
  journal_reference?: string;
}

// Material Purchase Line (renamed from Purchase Invoice Line)
export interface PurchaseInvoiceLine {
  id?: number;
  purchase_invoice_id?: number;
  line_number: number;
  material_id: number;
  variant_id?: number | null;
  stock_bucket?: StockBucket | null;
  quantity?: number | null;
  unit_cost?: number | null;
  amount: number;
  notes?: string | null;
  // Joined fields from materials table
  material_code?: string;
  material_name?: string;
  material_category?: MaterialCategory;
  variant_name?: string | null;
}

// Material Purchase Input for create/update
export interface PurchaseInvoiceInput {
  supplier_id: number;
  invoice_number: string;
  invoice_date: string;
  notes?: string | null;
  lines: PurchaseInvoiceLineInput[];
}

// Material Purchase Line Input
export interface PurchaseInvoiceLineInput {
  line_number: number;
  material_id: number;
  variant_id?: number | null;
  stock_bucket?: StockBucket | null;
  quantity?: number | null;
  unit_cost?: number | null;
  amount: number;
  notes?: string | null;
}

// Material dropdown option (for material purchase form)
export interface MaterialDropdown {
  id: number | string; // number for regular materials, "materialId-variantId" for variants
  code: string;
  name: string;
  category: MaterialCategory;
  applies_to: MaterialAppliesTo;
  default_unit_cost: number;
  is_variant?: boolean;
  material_id?: number; // Parent material ID for variants
  variant_id?: number; // Variant ID
  variant_name?: string; // Variant name
}

// Purchase Invoice with lines (from GET /purchase-invoices/:id)
export interface PurchaseInvoiceWithLines extends PurchaseInvoice {
  lines: PurchaseInvoiceLine[];
}

// ==================== SELF-BILLED E-INVOICE TYPES ====================

export type SelfBilledEInvoiceStatus =
  | "pending"
  | "valid"
  | "invalid"
  | "cancelled"
  | null;

export type SelfBilledInvoiceStatus = "active" | "cancelled";
export type GeneralPurchaseKind = "foreign" | "local";

export interface GeneralStockCategory {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GeneralStockAdjustment {
  id: number;
  adjustment_date: string;
  adjustment_quantity: number;
  notes?: string | null;
  created_at?: string;
}

export interface GeneralStockRow {
  line_id: number;
  self_billed_invoice_id: number;
  line_number: number;
  description: string;
  balance_quantity: number | null;
  amount_myr: number;
  general_stock_category_id: number | null;
  category_name: string;
  category_sort_order: number;
  purchase_no: string;
  purchase_date: string;
  purchase_kind: GeneralPurchaseKind;
  supplier_name: string | null;
  adjustment_quantity: number;
  current_stock: number;
  used_adjustments?: GeneralStockAdjustment[];
}

export interface SelfBilledForeignSupplier {
  id?: number;
  supplier_name: string;
  tin_number: string;
  id_type: string;
  id_number: string;
  sst_number: string;
  ttx_number: string;
  msic_code: string;
  business_activity_description: string;
  address_line_0: string;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city: string;
  postcode?: string | null;
  state_code: string;
  country_code: string;
  contact_number: string;
  email?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SelfBilledInvoiceLine {
  id?: number;
  self_billed_invoice_id?: number;
  line_number: number;
  description: string;
  quantity: number;
  balance_quantity?: number | null;
  general_stock_category_id?: number | null;
  unit_price_foreign: number;
  amount_foreign: number;
  amount_myr: number;
  classification_code: string;
  tax_type: string;
  tax_rate: number;
  tax_amount_myr: number;
  tax_exemption_reason?: string | null;
  customs_form_reference?: string | null;
  account_code?: string | null;
  notes?: string | null;
}

export interface SelfBilledInvoiceListItem {
  id: number;
  purchase_kind?: GeneralPurchaseKind;
  self_billed_no: string;
  purchase_no?: string;
  local_supplier_name?: string | null;
  purchase_date: string;
  transaction_type: string;
  platform: string | null;
  order_no: string | null;
  currency_code: string;
  total_foreign_amount: number;
  payable_amount_myr: number;
  uuid: string | null;
  long_id: string | null;
  invoice_status: SelfBilledInvoiceStatus;
  einvoice_status: SelfBilledEInvoiceStatus;
  has_supporting_document?: boolean;
  supporting_document_filename?: string | null;
  supporting_document_content_type?: string | null;
  supporting_document_size?: number | null;
  supporting_document_uploaded_at?: string | null;
  created_at: string;
  supplier_name: string;
}

export interface SelfBilledInvoiceInput {
  purchase_kind?: GeneralPurchaseKind;
  foreign_supplier_id?: number | null;
  local_supplier_name?: string | null;
  supplier: SelfBilledForeignSupplier;
  self_billed_no?: string;
  purchase_date: string;
  transaction_type: string;
  platform?: string | null;
  order_no?: string | null;
  payment_reference?: string | null;
  shipping_method?: string | null;
  shipping_number?: string | null;
  has_supporting_document: boolean;
  supporting_document_notes?: string | null;
  supporting_document_s3_key?: string | null;
  supporting_document_filename?: string | null;
  supporting_document_content_type?: string | null;
  supporting_document_size?: number | null;
  supporting_document_uploaded_at?: string | null;
  supporting_document_uploaded_by?: string | null;
  currency_code: string;
  fx_rate: number;
  notes?: string | null;
  lines: SelfBilledInvoiceLine[];
}

export interface SelfBilledInvoice extends SelfBilledInvoiceInput {
  id: number;
  purchase_kind: GeneralPurchaseKind;
  self_billed_no: string;
  purchase_no?: string;
  total_foreign_amount: number;
  total_excluding_tax_myr: number;
  tax_amount_myr: number;
  total_including_tax_myr: number;
  payable_amount_myr: number;
  uuid: string | null;
  submission_uid: string | null;
  long_id: string | null;
  datetime_validated: string | null;
  invoice_status: SelfBilledInvoiceStatus;
  einvoice_status: SelfBilledEInvoiceStatus;
  cancellation_reason: string | null;
  journal_entry_id?: number | null;
  amount_paid?: number;
  payment_status?: "unpaid" | "partial" | "paid";
  created_at: string;
  updated_at: string;
  created_by: string | null;
}
