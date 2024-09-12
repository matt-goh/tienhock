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
  | "listbox";

// Define column configuration
export interface ColumnConfig {
  id: string;
  header: string;
  type: ColumnType;
  width?: number;
  options?: string[];
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
  onDelete: (selectedIds: number[]) => Promise<void>;
  onChange?: (changedData: T[]) => void;
  isEditing: boolean;
  onToggleEditing: () => void;
  onSave: () => void;
  onCancel: () => void;
  tableKey: string;
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
}

export type FilterOptions = {
  showResigned?: boolean;
  jobFilter?: string[] | null;
  applyJobFilter?: boolean;
  location?: string;
  nationality?: string;
  gender?: string;
  race?: string;
};

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
