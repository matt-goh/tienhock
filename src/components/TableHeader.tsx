import React from "react";
import { flexRender } from "@tanstack/react-table";
import {
  IconSquareCheckFilled,
  IconSquareMinusFilled,
  IconSquare,
} from "@tabler/icons-react";
import { ColumnType } from "../types/types";

interface TableHeaderProps<T> {
  headerGroup: any;
  columns: Array<{ id: string; type: ColumnType }>;
  isEditing: boolean;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  handleSelectAll: () => void;
  isSortableColumn: (columnId: string) => boolean | undefined;
  columnWidths: { [k: string]: number };
}

function TableHeader<T>({
  headerGroup,
  columns,
  isEditing,
  isAllSelected,
  isIndeterminate,
  handleSelectAll,
  isSortableColumn,
  columnWidths,
}: TableHeaderProps<T>) {
  const getHeaderClass = (columnType: ColumnType) => {
    let baseClass = "cursor-pointer ";
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
    <tr>
      {headerGroup.headers.map((header: any, index: number) => (
        <th
          key={header.id}
          className={`px-6 py-2 text-base leading-4 font-bold text-gray-600 uppercase tracking-wider group ${getHeaderClass(
            columns.find((col) => col.id === header.id)?.type || "string"
          )} ${index === 0 ? "border-l-0" : "border-l border-gray-300"} ${
            index === headerGroup.headers.length - 1 ? "border-r-0" : ""
          } border-b border-gray-300`}
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
          {header.column.id === "selection" && isEditing ? (
            <div className="flex items-center justify-center h-full">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectAll();
                }}
                className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200"
              >
                {isAllSelected ? (
                  <IconSquareCheckFilled
                    width={20}
                    height={20}
                    className="text-blue-600"
                  />
                ) : isIndeterminate ? (
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
                    className="text-gray-400"
                  />
                )}
              </button>
            </div>
          ) : (
            flexRender(header.column.columnDef.header, header.getContext())
          )}
        </th>
      ))}
    </tr>
  );
}

export default TableHeader;
