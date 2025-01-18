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

export interface DocumentSummary {
  uuid: string;
  submissionUid: string;
  longId: string;
  internalId: string;
  typeName: string;
  typeVersionName: string;
  issuerTin: string;
  issuerName: string;
  receiverId: string;
  receiverName: string;
  dateTimeIssued: string;
  dateTimeReceived: string;
  dateTimeValidated: string;
  totalPayableAmount: number;
  totalExcludingTax: number;
  totalDiscount: number;
  totalNetAmount: number;
  status: string;
  cancelDateTime: string | null;
  rejectRequestDateTime: string | null;
  documentStatusReason: string | null;
  createdByUserId: string;
}

export interface SubmissionResponse {
  success: boolean;
  message: string;
  submissionInfo?: {
    submissionUid: string;
    documentCount: number;
    dateTimeReceived: string;
    overallStatus: string;
  };
  acceptedDocuments: DocumentSummary[];
  rejectedDocuments: Array<{
    invoiceCodeNumber: string;
    error: any;
  }>;
}

// Existing types remain the same
export interface ValidationError {
  invoiceNo: string;
  invoiceId?: string;
  errors: string[];
  validationErrors?: string[]; // Added to handle nested validation errors
  type?: "validation" | "submission"; // Added type field
}

export interface ValidationError {
  invoiceNo: string;
  invoiceId?: string;
  errors: string[];
  validationErrors?: string[];
  type?: "validation" | "submission";
}

export interface FailedInvoice {
  invoiceId?: string;
  invoiceNo: string;
  error?: string;
  errors?: string[] | string;
  type?: "validation" | "submission";
}

export interface MyInvoisError {
  success?: boolean;
  message: string;
  error?: string;
  details?: any;
  validationErrors?: ValidationError[];
}

export interface ErrorDisplayProps {
  error: MyInvoisError | string;
  failedInvoices?: FailedInvoice[];
  validationErrors?: ValidationError[];
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
    row: { original: any };
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
  onSpecialRowDelete?: (rowType: "less" | "tax") => void;
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

export interface InvoiceData {
  id: string;
  invoiceno: string;
  orderno: string;
  date: string;
  type: string;
  customer: string;
  customername: string;
  salesman: string;
  totalAmount: string;
  time: string;
  orderDetails: OrderDetail[];
  discount?: string;
  tax?: string;
  rounding?: string;
  isSorting?: boolean;
}

export interface OrderDetail {
  invoiceid?: string;
  code: string;
  productname: string;
  qty: number;
  price: number;
  total: string;
  isfoc?: boolean;
  isreturned?: boolean;
  istotal?: boolean;
  issubtotal?: boolean;
  isless?: boolean;
  istax?: boolean;
  colspan?: number;
  action?: string;
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

export interface InvoiceFilterOptions {
  salesmanFilter: string[] | null;
  applySalesmanFilter: boolean;
  customerFilter: string[] | null;
  applyCustomerFilter: boolean;
  dateRangeFilter: { start: Date | null; end: Date | null };
  applyDateRangeFilter: boolean;
  invoiceTypeFilter: "C" | "I" | null;
  applyInvoiceTypeFilter: boolean;
  applyProductFilter: boolean;
}

export interface ProductData {
  code: string;
  productname: string;
  qty: number;
  amount: number;
  isSubtotalQty?: boolean;
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
