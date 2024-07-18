// Define column types
export type ColumnType =
  | "selection"
  | "string"
  | "number"
  | "rate"
  | "readonly"
  | "checkbox"
  | "amount"
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
export interface TableProps {
  initialData: Data[];
  columns: ColumnConfig[];
}
