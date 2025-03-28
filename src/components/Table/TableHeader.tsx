import { flexRender } from "@tanstack/react-table";
import {
  IconSquareCheckFilled,
  IconSquareMinusFilled,
  IconSquare,
} from "@tabler/icons-react";
import { ColumnType } from "../../types/types";
import ColumnResizer from "./ColumnResizer";

interface TableHeaderProps {
  headerGroup: any;
  columns: Array<{ id: string; type: ColumnType }>;
  isEditing: boolean;
  isAllSelectedGlobal?: boolean;
  isIndeterminateGlobal?: boolean;
  handleSelectAll?: () => void;
  isSortableColumn: (columnId: string) => boolean | undefined;
  columnWidths: { [k: string]: number };
  onColumnResize: (columnId: string, width: number) => void;
  disableSelection?: boolean;
  onHeaderRowMouseEnter?: () => void;
  onHeaderRowMouseLeave?: () => void;
}

function TableHeader({
  headerGroup,
  columns,
  isEditing,
  isAllSelectedGlobal,
  isIndeterminateGlobal,
  handleSelectAll,
  isSortableColumn,
  columnWidths,
  onColumnResize,
  disableSelection, // New prop
  onHeaderRowMouseEnter,
  onHeaderRowMouseLeave,
}: TableHeaderProps) {
  const getHeaderClass = (columnId: string, columnType: ColumnType) => {
    let baseClass = "";
    if (isSortableColumn(columnId)) {
      baseClass += "cursor-pointer ";
    }
    switch (columnType) {
      case "number":
      case "rate":
      case "readonly":
      case "amount":
      case "float":
        return baseClass + "text-right";
      case "checkbox":
      case "action":
        return "text-center";
      default:
        return baseClass + "text-left";
    }
  };

  return (
    <tr
      className="bg-default-100"
      onMouseEnter={onHeaderRowMouseEnter}
      onMouseLeave={onHeaderRowMouseLeave}
    >
      {headerGroup.headers.map((header: any, index: number) => (
        <th
          key={header.id}
          className={`px-6 py-2 text-base leading-4 font-bold text-default-600 uppercase tracking-wider group ${getHeaderClass(
            header.id,
            columns.find((col) => col.id === header.id)?.type || "string"
          )} ${index === 0 ? "rounded-tl-lg" : ""} ${
            index === headerGroup.headers.length - 1 ? "rounded-tr-lg" : ""
          }`}
          onClick={() => {
            if (isSortableColumn(header.column.id)) {
              header.column.toggleSorting();
            }
          }}
          style={{
            position: "relative",
            width: `${columnWidths[header.id]}px` || "auto",
          }}
        >
          <div className="flex items-center w-full h-full relative">
            {header.column.id === "selection" &&
            isEditing &&
            !disableSelection ? (
              <div className="flex items-center justify-center h-full w-full">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAll && handleSelectAll();
                  }}
                  className="p-2 rounded-full hover:bg-default-200 active:bg-default-300 transition-colors duration-200"
                >
                  {isAllSelectedGlobal ? (
                    <IconSquareCheckFilled
                      width={20}
                      height={20}
                      className="text-blue-600"
                    />
                  ) : isIndeterminateGlobal ? (
                    <IconSquareMinusFilled
                      width={20}
                      height={20}
                      className="text-blue-600"
                    />
                  ) : (
                    <IconSquare
                      width={20}
                      height={20}
                      stroke={2}
                      className="text-default-400"
                    />
                  )}
                </button>
              </div>
            ) : (
              flexRender(header.column.columnDef.header, header.getContext())
            )}
          </div>
          {index < headerGroup.headers.length - 1 && (
            <ColumnResizer
              onResize={(width) => onColumnResize(header.id, width)}
              initialWidth={columnWidths[header.id]}
            />
          )}
        </th>
      ))}
    </tr>
  );
}

export default TableHeader;
