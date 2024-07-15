import React, { useState, useEffect, useRef } from "react";
import DatePicker from "react-datepicker";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";
import "react-datepicker/dist/react-datepicker.css";
import { IconTrash } from "@tabler/icons-react";

// Define column types
type ColumnType =
  | "string"
  | "number"
  | "rate"
  | "readonly"
  | "checkbox"
  | "amount"
  | "action";

// Define column configuration
interface ColumnConfig {
  id: string;
  header: string;
  type: ColumnType;
  width?: number;
}

// Define data structure
interface Data {
  [key: string]: any;
}

// Props for the Table component
interface TableProps {
  initialData: Data[];
  columns: ColumnConfig[];
}

// EditableCejll component
const EditableCell: React.FC<{
  value: any;
  onChange: (value: any) => void;
  type: ColumnType;
  editable: boolean;
  focus: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
}> = ({ value, onChange, type, editable, focus, onKeyDown }) => {
  const [cellValue, setCellValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCellValue(value);
  }, [value]);

  useEffect(() => {
    if (editable && focus && inputRef.current) {
      inputRef.current.focus();
      if (type === "string") {
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }
  }, [editable, focus, type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue: string | number | boolean = e.target.value;
    if (type === "checkbox") {
      newValue = e.target.checked;
    } else if (type === "number" || type === "rate") {
      if (e.target.value === "") {
        newValue = 0;
      } else {
        newValue =
          type === "number"
            ? Math.floor(Number(e.target.value))
            : Number(e.target.value);
      }
    }
    setCellValue(newValue);
    onChange(newValue);
  };

  const getInputProps = () => {
    switch (type) {
      case "number":
        return { type: "number", min: "0", step: "1" };
      case "rate":
        return { type: "number", step: "0.01", min: "0" };
      case "checkbox":
        return { type: "checkbox", checked: value };
      default:
        return { type: "text" };
    }
  };

  return (
    <input
      ref={inputRef}
      {...getInputProps()}
      value={type !== "checkbox" ? cellValue : undefined}
      onChange={handleChange}
      readOnly={!editable}
      onKeyDown={onKeyDown}
      className={`w-full h-full px-6 py-3 m-0 outline-none bg-transparent focus:border-gray-400 focus:border ${
        type === "number" || type === "rate" ? "text-right" : ""
      } ${type === "checkbox" ? "w-auto cursor-pointer" : ""}`}
      style={{ boxSizing: "border-box" }}
    />
  );
};

// Table component
const Table: React.FC<TableProps> = ({ initialData, columns }) => {
  const [data, setData] = useState<Data[]>(initialData);
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [previousValue, setPreviousValue] = useState<any>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    Object.fromEntries(columns.map((col) => [col.id, col.width || 200]))
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [newRowCount, setNewRowCount] = useState<number>(5);

  const handleClickOutside = (event: MouseEvent) => {
    if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
      setEditableCellIndex(null);
      setSelectedRowId(null);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCellClick = (rowId: string, cellIndex: number) => {
    setEditableRowId(rowId);
    setEditableCellIndex(cellIndex);
    setSelectedRowId(rowId);
    const rowIndex = table
      .getRowModel()
      .rows.findIndex((row) => row.id === rowId);
    setPreviousValue(
      table.getRowModel().rows[rowIndex].original[columns[cellIndex].id]
    );
  };

  const handleCellChange = (rowId: string, columnId: string, value: any) => {
    setData((oldData) => {
      const newData = [...oldData];
      const rowIndex = table
        .getRowModel()
        .rows.findIndex((row) => row.id === rowId);
      const originalIndex = table.getRowModel().rows[rowIndex].index;
      if (columnId === "bag" && parseFloat(value) > 99999) {
        value = 99999;
      }
      newData[originalIndex] = {
        ...newData[originalIndex],
        [columnId]: value,
      };
      // Recalculate amount
      if (columnId === "bag" || columnId === "rate") {
        newData[originalIndex].amount = (
          newData[originalIndex].bag * newData[originalIndex].rate
        ).toFixed(2);
      }
      return newData;
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowId: string,
    cellIndex: number
  ) => {
    if (e.key === "Escape") {
      if (
        editableRowId !== null &&
        editableCellIndex !== null &&
        previousValue !== null
      ) {
        const columnId = columns[editableCellIndex].id;
        handleCellChange(editableRowId, columnId, previousValue);
      }
      setEditableRowId(null);
      setEditableCellIndex(null);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      let nextCellIndex = cellIndex;
      let nextRowId = rowId;

      const sortedRows = table.getRowModel().rows;
      const currentRowIndex = sortedRows.findIndex((row) => row.id === rowId);

      const lastSelectableColumnIndex = columns.reduce(
        (lastIndex, col, index) =>
          col.type !== "readonly" && col.type !== "action" ? index : lastIndex,
        -1
      );

      if (
        e.key === "Enter" &&
        nextCellIndex === lastSelectableColumnIndex &&
        currentRowIndex === sortedRows.length - 1
      ) {
        handleAddRow(1);
        nextCellIndex = columns.findIndex(
          (col) => col.type !== "readonly" && col.type !== "action"
        );
        nextRowId = sortedRows[sortedRows.length].id;
      } else {
        do {
          nextCellIndex = (nextCellIndex + 1) % columns.length;
          if (nextCellIndex === 0) {
            const nextRowIndex = (currentRowIndex + 1) % sortedRows.length;
            nextRowId = sortedRows[nextRowIndex].id;
          }
        } while (
          columns[nextCellIndex].type === "readonly" ||
          columns[nextCellIndex].type === "action" ||
          columns[nextCellIndex].type === "checkbox"
        );
      }

      setEditableRowId(nextRowId);
      setEditableCellIndex(nextCellIndex);
    }
  };

  const handleAddRow = (count: number = newRowCount) => {
    const newRows = Array(count)
      .fill(null)
      .map(() =>
        Object.fromEntries(
          columns.map((col) => {
            switch (col.type) {
              case "number":
              case "rate":
                return [col.id, 0];
              case "checkbox":
                return [col.id, true];
              case "readonly":
                return [col.id, 0];
              default:
                return [col.id, ""];
            }
          })
        )
      );
    setData((oldData) => [...oldData, ...newRows]);
  };

  const handleDeleteRow = (rowIndex: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const originalIndex = table.getRowModel().rows[rowIndex].index;
    setData((oldData) => oldData.filter((_, index) => index !== originalIndex));
  };

  const handleMouseDown = (event: React.MouseEvent, columnId: string) => {
    if (columnId === "actions") return;

    const startX = event.clientX;
    const startWidth = columnWidths[columnId];

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth + e.clientX - startX;
      setColumnWidths((prev) => ({
        ...prev,
        [columnId]: Math.max(newWidth, 30),
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const columnHelper = createColumnHelper<Data>();

  const tableColumns = columns.map((col) => {
    const headerContent = (
      <div
        className={`flex items-center group cursor-pointer w-full h-full ${
          col.type === "number" || col.type === "rate" || col.type === "amount"
            ? "justify-end"
            : ""
        }`}
        onClick={() => columns.toggleSorting()}
      >
        {col.type === "number" ||
        col.type === "rate" ||
        col.type === "amount" ? (
          <>
            <span className="mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {getSortIcon(col.id)}
            </span>
            {col.header}
          </>
        ) : (
          <>
            {col.header}
            <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {getSortIcon(col.id)}
            </span>
          </>
        )}
      </div>
    );

    if (col.type === "action") {
      return columnHelper.display({
        id: col.id,
        header: col.header,
        cell: (info) => (
          <div className="flex items-center justify-center h-full">
            <button
              className="text-gray-500 hover:text-gray-600"
              onClick={(event) => handleDeleteRow(info.row.index, event)}
            >
              <IconTrash stroke={2} width={20} height={20} />
            </button>
          </div>
        ),
      });
    } else if (col.type === "readonly") {
      return columnHelper.accessor(col.id, {
        header: col.header,
        cell: (info) => (
          <div className="px-6 text-right">
            {parseFloat(info.getValue()).toFixed(2)}
          </div>
        ),
      });
    } else if (col.type === "checkbox") {
      return columnHelper.accessor(col.id, {
        header: col.header,
        cell: (info) => (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={info.getValue()}
              onChange={(e) =>
                handleCellChange(info.row.id, col.id, e.target.checked)
              }
              className="w-4 h-4"
            />
          </div>
        ),
      });
    } else if (
      col.type === "amount" ||
      col.type === "number" ||
      col.type === "rate"
    ) {
      return columnHelper.accessor(col.id, {
        header: ({ column }) => headerContent,
        cell: (info) => (
          <div className="px-6 text-right">
            {col.type === "amount"
              ? parseFloat(info.getValue()).toFixed(2)
              : info.getValue()}
          </div>
        ),
      });
    } else {
      return columnHelper.accessor(col.id, {
        header: ({ column }) => (
          <div
            className="flex items-center group cursor-pointer w-full h-full"
            onClick={() => column.toggleSorting()}
          >
            {col.type === "number" ||
            col.type === "rate" ||
            col.type === "amount" ? (
              <>
                <span className="mr-2">{getSortIcon(col.id)}</span>
                {col.header}
              </>
            ) : (
              <>
                {col.header}
                <span className="ml-2">{getSortIcon(col.id)}</span>
              </>
            )}
          </div>
        ),
        cell: (info) => (
          <div
            onClick={() =>
              handleCellClick(info.row.id, info.cell.column.getIndex())
            }
          >
            <EditableCell
              value={info.getValue()}
              onChange={(val) => handleCellChange(info.row.id, col.id, val)}
              type={col.type}
              editable={
                info.row.id === editableRowId &&
                info.cell.column.getIndex() === editableCellIndex
              }
              focus={
                info.row.id === editableRowId &&
                info.cell.column.getIndex() === editableCellIndex
              }
              onKeyDown={(e) =>
                handleKeyDown(e, info.row.id, info.cell.column.getIndex())
              }
            />
          </div>
        ),
      });
    }
  });

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  const getSortIcon = (columnId: string) => {
    const sort = sorting.find((s) => s.id === columnId);
    if (!sort) return "⇅";
    return sort.desc ? "↓" : "↑";
  };

  const getHeaderClass = (columnType: ColumnType) => {
    switch (columnType) {
      case "number":
      case "rate":
      case "readonly":
      case "amount":
        return "text-right";
      case "checkbox":
      case "action":
        return "text-center";
      default:
        return "text-left";
    }
  };

  return (
    <div ref={tableRef} className="p-8 w-auto">
      <div className="flex items-center mb-4 w-auto">
        <div className="ml-auto flex items-center">
          <div className="flex items-center mr-4">
            <button
              onClick={() => setNewRowCount((prev) => Math.max(1, prev - 1))}
              className="px-2 py-1 border border-gray-300 rounded-l-lg"
            >
              -
            </button>
            <input
              type="number"
              value={newRowCount}
              onChange={(e) =>
                setNewRowCount(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-12 px-2 py-1 text-center border-t border-b border-gray-300"
            />
            <button
              onClick={() => setNewRowCount((prev) => prev + 1)}
              className="px-2 py-1 border border-gray-300 rounded-r-lg"
            >
              +
            </button>
          </div>
          <button
            onClick={() => handleAddRow()}
            className="px-4 py-2 border border-gray-300 font-medium rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            Add row{newRowCount > 1 ? "s" : ""}
          </button>
        </div>
      </div>
      <table className="w-auto bg-white border-collapse border-spacing-0">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`px-6 py-3 border border-b-2 border-gray-300 text-base leading-4 font-bold text-gray-600 uppercase tracking-wider ${getHeaderClass(
                    columns.find((col) => col.id === header.id)?.type ||
                      "string"
                  )}`}
                  style={{
                    position: "relative",
                    width: `${columnWidths[header.id]}px` || "auto",
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.id !== "actions" && (
                    <div
                      className="resizer"
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        height: "100%",
                        width: "5px",
                        cursor: "col-resize",
                        userSelect: "none",
                        background: "transparent",
                      }}
                      onMouseDown={(e) => handleMouseDown(e, header.id)}
                    />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={
                row.id === selectedRowId
                  ? "border-l-2 border-gray-400 shadow-top-bottom"
                  : "border border-gray-300 hover:bg-gray-100"
              }
            >
              {row.getVisibleCells().map((cell, cellIndex) => (
                <td
                  key={cell.id}
                  className={`relative px-6 py-4 whitespace-no-wrap border-b border-r border-gray-300`}
                  onClick={() => handleCellClick(row.id, cellIndex)}
                  style={{
                    padding: "0",
                    boxSizing: "border-box",
                    width: `${columnWidths[cell.column.id]}px` || "auto",
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
