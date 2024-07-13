import React, { useState, useEffect, useRef } from "react";
import DatePicker from "react-datepicker";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
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
    const newValue = e.target.value;
    setCellValue(newValue);
    onChange(newValue);
  };

  const getInputProps = () => {
    switch (type) {
      case "number":
        return { type: "number", min: "0" };
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

  const handleCellClick = (rowIndex: number, cellIndex: number) => {
    setEditableRowIndex(rowIndex);
    setEditableCellIndex(cellIndex);
    setPreviousValue(data[rowIndex][columns[cellIndex].id]);
  };

  const handleCellChange = (rowIndex: number, columnId: string, value: any) => {
    setData((oldData) => {
      const newData = [...oldData];
      if (columnId === "bag" && parseFloat(value) > 99999999) {
        value = 99999999;
      }
      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnId]: value,
      };
      return newData;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (
        editableRowIndex !== null &&
        editableCellIndex !== null &&
        previousValue !== null
      ) {
        const columnId = columns[editableCellIndex].id;
        handleCellChange(editableRowIndex, columnId, previousValue);
      }
      setEditableRowIndex(null);
      setEditableCellIndex(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (editableRowIndex !== null && editableCellIndex !== null) {
        const nextCellIndex = (editableCellIndex + 1) % columns.length;
        const nextRowIndex =
          nextCellIndex === 0
            ? (editableRowIndex + 1) % data.length
            : editableRowIndex;
        setEditableRowIndex(nextRowIndex);
        setEditableCellIndex(nextCellIndex);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (editableRowIndex !== null && editableCellIndex !== null) {
        const nextCellIndex = editableCellIndex + 1;
        if (nextCellIndex < columns.length) {
          setEditableCellIndex(nextCellIndex);
        } else {
          const nextRowIndex = editableRowIndex + 1;
          if (nextRowIndex < data.length) {
            setEditableRowIndex(nextRowIndex);
            setEditableCellIndex(0);
          } else {
            setEditableRowIndex(null);
            setEditableCellIndex(null);
          }
        }
      }
    }
  };

  const handleAddRow = () => {
    const newRow = Object.fromEntries(columns.map((col) => [col.id, ""]));
    setData([...data, newRow]);
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
    } else {
      return columnHelper.accessor(col.id as keyof Data, {
        header: col.header,
        cell: (info) => (
          <div
            onClick={() =>
              handleCellClick(info.row.index, info.cell.column.getIndex())
            }
          >
            {col.type === "readonly" ? (
              <div
                className={`px-6 ${
                  ["number", "rate"].includes(col.type) ? "text-right" : ""
                }`}
              >
                {info.getValue()}
              </div>
            ) : (
              <EditableCell
                value={info.getValue()}
                onChange={(val) =>
                  handleCellChange(info.row.index, col.id, val)
                }
                type={col.type}
                editable={
                  info.row.index === editableRowIndex &&
                  info.cell.column.getIndex() === editableCellIndex
                }
                focus={
                  info.row.index === editableRowIndex &&
                  info.cell.column.getIndex() === editableCellIndex
                }
                onKeyDown={handleKeyDown}
              />
            )}
          </div>
        ),
      });
    }
  });
  

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const getHeaderClass = (columnType: ColumnType) => {
    switch (columnType) {
      case "number":
      case "rate":
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
          className="w-32 px-4 py-2 text-center border border-gray-300 rounded-lg focus:outline-none"
          dateFormat="dd/MM/yyyy"
        />
        <div className="relative inline-block">
          <span className="font-medium ml-4 mr-2">Shift:</span>
          <button
            onClick={toggleShift}
            className="px-4 py-2 border border-gray-300 rounded-lg text-right focus:outline-none hover:bg-gray-100 active:bg-gray-200"
          >
            {shift}
          </button>
        </div>
        <div className="relative inline-block">
          <span className="font-medium ml-4 mr-2">Hari:</span>
          <button
            onClick={toggleHari}
            className="px-4 py-2 border border-gray-300 rounded-lg text-right focus:outline-none hover:bg-gray-100 active:bg-gray-200"
          >
            {hari}
          </button>
        </div>
        <div className="relative inline-block">
          <span className="font-medium ml-4 mr-2">Jumlah Tepung:</span>
          <input
            value={jumlahTepung}
            onChange={handleJumlahTepungChange}
            className="w-16 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none text-center"
          />
        </div>
        <div className="ml-auto">
          <button
            onClick={handleAddRow}
            className="px-4 py-2 border border-gray-300 font-medium rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            Add New Row
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
                    columns[header.index].type
                  )}`}
                  style={{
                    position: "relative",
                    width: columnWidths[columns[header.index].id]
                      ? `${columnWidths[columns[header.index].id]}px`
                      : "auto",
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {columns[header.index].type !== "action" && (
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
                      onMouseDown={(e) =>
                        handleMouseDown(e, columns[header.index].id)
                      }
                    />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className={
                rowIndex === editableRowIndex
                  ? "border-l-2 border-gray-400 shadow-top-bottom"
                  : "border border-gray-300 hover:bg-gray-100"
              }
            >
              {row.getVisibleCells().map((cell, cellIndex) => (
                <td
                  key={cell.id}
                  className={`relative px-6 py-4 whitespace-no-wrap border-b border-r border-gray-300`}
                  onClick={() => handleCellClick(rowIndex, cellIndex)}
                  style={{
                    padding: "0",
                    boxSizing: "border-box",
                    width: `${columnWidths[columns[cellIndex].id]}px` || "auto",
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
