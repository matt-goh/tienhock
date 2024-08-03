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
  | "action";

// Define column configuration
export interface ColumnConfig {
  id: string;
  header: string;
  type: ColumnType;
  width?: number;
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

export interface Job {
  id: string;
  name: string;
  section: string[];
  newId: string;
}

export interface Product {
  id: string;
  name: string;
  amount: number;
  remark: string;
}
