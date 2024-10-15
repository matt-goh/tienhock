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
  initialData: T[];
  columns: ColumnConfig[];
  onShowDeleteButton?: (show: boolean) => void;
  onSpecialRowDelete?: (rowType: "less" | "tax") => void;
  onDelete?: (selectedIds: number[]) => Promise<void>;
  onChange?: (changedData: T[]) => void;
  isEditing?: boolean;
  onToggleEditing?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  tableKey?: string;
}

export interface OrderDetail {
  code: string;
  productName: string;
  qty: number;
  price: number;
  total: string;
  isFoc?: boolean;
  isReturned?: boolean;
  isTotal?: boolean;
  isSubtotal?: boolean;
  isLess?: boolean;
  isTax?: boolean;
  colspan?: number;
  action?: string;
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
  productName: string;
  qty: number;
  amount: number;
  isSubtotalQty?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  closeness: string;
  salesman: string;
  tin_number: number;
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
