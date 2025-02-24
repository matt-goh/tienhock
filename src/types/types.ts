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
  invoiceCodeNumber: string;
  uuid?: string;
}

export interface AcceptedDocument extends DocumentBase {
  uuid: string;
  status: "ACCEPTED";
}

export interface RejectedDocument {
  invoiceCodeNumber: string;
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

// Display component props
export interface SubmissionDisplayProps {
  state: SubmissionState;
  onClose: () => void;
  showDetails?: boolean;
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

export interface ProductItem {
  uid?: string;
  code: string;
  price: number;
  quantity: number;
  description?: string;
  freeProduct: number;
  returnProduct: number;
  tax: number;
  discount: number;
  total?: string;
  issubtotal?: boolean;
  istotal?: boolean;
}

// Product row interface for UI with all possible states
export interface ExtendedProductItem extends ProductItem {
  description?: string;
  // Make all boolean flags required with default false
  isSubtotal: boolean;
  isTotal: boolean;
}

export interface InvoiceData {
  id: string;
  salespersonid: string;
  customerid: string;
  customername?: string;
  createddate: string;
  paymenttype: string;
  products: ProductItem[];
  totalmee: number;
  totalbihun: number;
  totalnontaxable: number;
  totaltaxable: number;
  totaladjustment: number;
}

// Extended invoice for UI
export interface ExtendedInvoiceData extends InvoiceData {
  customerName?: string; // For UI display
  isEditing?: boolean; // UI state
  originalId?: string;
}

// Helper type for special rows
export interface SpecialRow {
  code: string;
  description: string;
  amount: number;
  type: "subtotal";
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
  applySalespersonFilter: boolean;
  customerId: string[] | null;
  applyCustomerFilter: boolean;
  paymentType: "Cash" | "Invoice" | null;
  applyPaymentTypeFilter: boolean;
}

export interface CustomerList {
  id: string;
  name: string;
  salesman: string;
  phone_number?: string;
  tin_number?: string;
  id_number?: string;
}

export interface Customer extends CustomerList {
  closeness: string;
  email?: string;
  address?: string;
  city: string;
  state: string;
  id_type: string;
  originalId?: string;
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
