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

// Define column types
type ColumnType =
  | "string"
  | "number"
  | "rate"
  | "readonly"
  | "checkbox"
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

// EditableCell component
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
  const [editableRowIndex, setEditableRowIndex] = useState<number | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [previousValue, setPreviousValue] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [shift, setShift] = useState("Day");
  const [hari, setHari] = useState("Biasa");
  const [jumlahTepung, setJumlahTepung] = useState<number>(50);
  const tableRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    Object.fromEntries(columns.map((col) => [col.id, col.width || 200]))
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [newRowCount, setNewRowCount] = useState<number>(5);

  const handleClickOutside = (event: MouseEvent) => {
    if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
      setEditableRowIndex(null);
      setEditableCellIndex(null);
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
    const rowIndex = table
      .getRowModel()
      .rows.findIndex((row) => row.id === rowId);
    setPreviousValue(data[rowIndex][columns[cellIndex].id]);
  };

  const handleCellChange = (rowId: string, columnId: string, value: any) => {
    setData((oldData) => {
      const newData = [...oldData];
      const rowIndex = newData.findIndex((row) => row.id === rowId);
      if (columnId === "bag" && parseFloat(value) > 99999) {
        value = 99999;
      }
      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnId]: value,
      };
      // Recalculate amount
      if (columnId === "bag" || columnId === "rate") {
        newData[rowIndex].amount = (
          newData[rowIndex].bag * newData[rowIndex].rate
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
    setData((oldData) => oldData.filter((_, index) => index !== rowIndex));
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

  const toggleShift = () => {
    setShift((prevShift) => (prevShift === "Day" ? "Night" : "Day"));
  };

  const toggleHari = () => {
    setHari((prevHari) => {
      switch (prevHari) {
        case "Biasa":
          return "Ahad";
        case "Ahad":
          return "Umum";
        case "Umum":
          return "Biasa";
        default:
          return "Biasa";
      }
    });
  };

  const columnHelper = createColumnHelper<Data>();

  const tableColumns = columns.map((col) => {
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="icon icon-tabler icon-tabler-trash"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M4 7l16 0" />
                <path d="M10 11l0 6" />
                <path d="M14 11l0 6" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
              </svg>
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
    } else {
      return columnHelper.accessor(col.id, {
        header: () => (
          <div className="flex items-center">
            {col.type === "number" && (
              <button onClick={() => handleSort(col.id)} className="mr-2">
                {getSortIcon(col.id)}
              </button>
            )}
            {col.header}
            {col.type !== "number" && (
              <button onClick={() => handleSort(col.id)} className="ml-2">
                {getSortIcon(col.id)}
              </button>
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

  const handleSort = (columnId: string) => {
    setSorting((old) => {
      const existingSort = old.find((s) => s.id === columnId);
      if (!existingSort) return [{ id: columnId, desc: false }];
      if (existingSort.desc) return [];
      return [{ id: columnId, desc: true }];
    });
  };

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
        return "text-right";
      case "checkbox":
      case "action":
        return "text-center";
      default:
        return "text-left";
    }
  };

  const handleJumlahTepungChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value) && Number(value) <= 999) {
      setJumlahTepung(Number(value));
    }
  };

  return (
    <div ref={tableRef} className="p-8 w-full">
      <div className="flex items-center mb-4 w-full">
        <span className="font-medium mr-2">Date:</span>
        <DatePicker
          selected={selectedDate}
          onChange={(date) => setSelectedDate(date)}
          className="relative inline-block w-24 hover:w-28 px-2 py-1.5 pl-0 hover:pl-2 hover:border hover:border-gray-300 hover:shadow-md rounded-lg hover:text-center transition-all duration-200"
          dateFormat="dd/MM/yyyy"
        />
        <div className="relative inline-block">
          <span className="font-medium ml-4 mr-2">Shift:</span>
          <button
            onClick={toggleShift}
            className="px-3 py-1.5 pl-0 hover:pl-3 hover:border hover:border-gray-300 hover:shadow-md rounded-lg text-right active:bg-gray-100 transition-all duration-200"
          >
            {shift}
          </button>
        </div>
        <div className="relative inline-block">
          <span className="font-medium ml-4 mr-2">Hari:</span>
          <button
            onClick={toggleHari}
            className="px-3 py-1.5 pl-0 hover:pl-3 hover:border hover:border-gray-300 hover:shadow-md rounded-lg text-right active:bg-gray-100 transition-all duration-200"
          >
            {hari}
          </button>
        </div>
        <div className="relative inline-block">
          <span className="font-medium ml-4 mr-2">Jumlah Tepung:</span>
          <input
            max={999}
            value={jumlahTepung}
            onChange={handleJumlahTepungChange}
            className="w-12 px-2 py-1.5 pl-0 hover:pl-2 hover:border hover:border-gray-300 hover:shadow-md rounded-lg hover:text-center transition-all duration-200"
          />
        </div>
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
            Add New Row{newRowCount > 1 ? "s" : ""}
          </button>
        </div>
      </div>
      <table className="min-w-full bg-white border-collapse border-spacing-0">
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
                row.id === editableRowId &&
                columns.some(
                  (col) =>
                    col.type !== "readonly" &&
                    col.type !== "checkbox" &&
                    col.type !== "action"
                )
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
