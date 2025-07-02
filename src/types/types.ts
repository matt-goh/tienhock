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

// Props for the Table component
export interface TableProps<T> {
  ref?: React.RefObject<any>;
  initialData: T[];
  columns: ColumnConfig[];
  onShowDeleteButton?: (show: boolean) => void;
  onSelectionChange?: (
    count: number,
    allSelected: boolean,
    selectedData: T[]
  ) => void;
  onClearSelection?: (fn: () => void) => void;
  onDelete?: (selectedIds: number[]) => Promise<void>;
  onChange?: (changedData: T[]) => void;
  isEditing?: boolean;
  onToggleEditing?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  tableKey?: string;
}

export type InvoiceStatus =
  | "active"
  | "paid"
  | "cancelled"
  | "Unpaid"
  | "overdue";
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
  payment_date: string;
  amount_paid: number;
  payment_method: "cash" | "cheque" | "bank_transfer" | "online";
  payment_reference?: string;
  internal_reference?: string;
  notes?: string;
  created_at?: string;
  status?: "active" | "cancelled" | "pending";
  cancellation_date?: string;
  cancellation_reason?: string;
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
  jobType?: string;
  location: string[];
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
  updatedAt?: string;
}

export type FilterOptions = {
  showResigned?: boolean;
  jobFilter?: string[] | null;
  applyJobFilter?: boolean;
  locationFilter: string[] | null;
  applyLocationFilter: boolean;
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
  cancellation_date?: string | null;
  cancellation_reason?: string;
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
}

export type PayType = "Base" | "Tambahan" | "Overtime";
export type RateUnit = "Hour" | "Bag" | "Percent" | "Fixed" | "Day" | "Trip";

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

export interface EmployeePayroll {
  id?: number;
  monthly_payroll_id?: number;
  employee_id: string;
  employee_name?: string;
  job_type: string;
  section: string;
  gross_pay: number;
  net_pay: number;
  status?: string;
  payroll_status?: string;
  year?: number;
  month?: number;
  items: PayrollItem[];
  deductions?: PayrollDeduction[];
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
}

export interface MonthlyPayroll {
  id: number;
  year: number;
  month: number;
  status: "Processing" | "Finalized";
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
  deduction_type: "epf" | "socso" | "sip";
  employee_amount: number;
  employer_amount: number;
  wage_amount: number;
  rate_info: {
    rate_id: number;
    employee_rate: number | string;
    employer_rate: number | string;
    age_group?: string;
    wage_ceiling_used?: number;
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
