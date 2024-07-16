import React, { useState, useEffect, useRef, useMemo, ReactNode } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  Cell,
  Row,
} from "@tanstack/react-table";
import "react-datepicker/dist/react-datepicker.css";
import {
  IconArrowsSort,
  IconSortAscendingLetters,
  IconSortAscendingNumbers,
  IconSortDescendingLetters,
  IconSortDescendingNumbers,
  IconTrash,
} from "@tabler/icons-react";
import { ColumnType, TableProps, Data } from "../types/types";
import TableEditableCell from "./TableEditableCell";

const Table: React.FC<TableProps> = ({ initialData, columns }) => {
  const [data, setData] = useState<Data[]>(initialData);
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previousValue, setPreviousValue] = useState<any>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    Object.fromEntries(columns.map((col) => [col.id, col.width || 200]))
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [newRowCount, setNewRowCount] = useState<number>(5);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tableRef.current &&
        !tableRef.current.contains(event.target as Node)
      ) {
        setEditableCellIndex(null);
        setSelectedRowId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      const newData = oldData.map((row) =>
        row.id === rowId ? { ...row, [columnId]: value } : row
      );

      if (columnId === "bag" || columnId === "rate") {
        const updatedRow = newData.find((row) => row.id === rowId);
        if (updatedRow) {
          updatedRow.amount = (updatedRow.bag * updatedRow.rate).toFixed(2);
        }
        recalculateSubtotals(newData);
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
              case "amount":
              case "readonly":
                return [col.id, 0];
              case "checkbox":
                return [col.id, true];
              default:
                return [col.id, ""];
            }
          })
        )
      );
    setData((oldData) => [...oldData, ...newRows]);
  };

  const handleAddSubtotalRow = () => {
    const lastModifiedRowIndex = findLastIndex(data, (row) => !row.isSubtotal);
    if (lastModifiedRowIndex === -1) return;

    const newData = [...data];
    const subtotalRow = createSubtotalRow(lastModifiedRowIndex);
    newData.splice(lastModifiedRowIndex + 1, 0, subtotalRow);

    setData(newData);
    recalculateSubtotals(newData);
  };

  const findLastIndex = <T,>(
    array: T[],
    predicate: (value: T) => boolean
  ): number => {
    for (let i = array.length - 1; i >= 0; i--) {
      if (predicate(array[i])) return i;
    }
    return -1;
  };

  const createSubtotalRow = (endIndex: number) => ({
    ...Object.fromEntries(columns.map((col) => [col.id, ""])),
    [columns.find((col) => col.type === "amount")?.id || "amount"]:
      "Subtotal: 0.00",
    isSubtotal: true,
    subtotalEndIndex: endIndex,
  });

  const recalculateSubtotals = (data: Data[]) => {
    let currentSubtotalStartIndex = 0;
    const newData = [...data];

    newData.forEach((row, index) => {
      if (row.isSubtotal) {
        const subtotalAmount = newData
          .slice(currentSubtotalStartIndex, index)
          .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

        newData[index] = {
          ...row,
          [columns.find((col) => col.type === "amount")?.id ||
          "amount"]: `Subtotal: ${subtotalAmount.toFixed(2)}`,
          subtotalEndIndex: index - 1,
        };

        currentSubtotalStartIndex = index + 1;
      }
    });

    setData(newData);
  };

  const hasAmountColumn = useMemo(() => {
    return columns.some((col) => col.type === "amount");
  }, [columns]);

  useEffect(() => {
    recalculateSubtotals(data);
  }, [sorting]);

  const renderCell = (
    row: Row<Data>,
    cell: Cell<Data, unknown>,
    cellIndex: number
  ): ReactNode => {
    if (row.original.isSubtotal) {
      if (cell.column.id === columns.find((col) => col.type === "amount")?.id) {
        return (
          <td
            key={cell.id}
            colSpan={columns.length - 1}
            className="py-3 pr-6 text-right font-semibold border"
          >
            {cell.getValue() as ReactNode}
          </td>
        );
      } else if (cell.column.id === "actions") {
        return (
          <td key={cell.id} className="flex items-center justify-center h-full">
            <button
              className="text-gray-500 hover:text-gray-600"
              onClick={(event) => handleDeleteRow(row.index, event)}
            >
              <IconTrash stroke={2} width={20} height={20} />
            </button>
          </td>
        );
      } else {
        return null;
      }
    } else {
      return (
        <TableEditableCell
          value={cell.getValue()}
          onChange={(val) => handleCellChange(row.id, cell.column.id, val)}
          type={columns[cellIndex].type}
          editable={
            row.id === editableRowId && cellIndex === editableCellIndex
          }
          focus={row.id === editableRowId && cellIndex === editableCellIndex}
          onKeyDown={(e) => handleKeyDown(e, row.id, cellIndex)}
        />
      );
    }
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

  const tableColumns = useMemo(
    () =>
      columns.map((col) => {
        const commonHeaderContent = (column: any) => (
          <div
            className={`flex items-center group cursor-pointer w-full h-full ${
              ["number", "rate", "amount"].includes(col.type) ? "justify-end" : ""
            }`}
            onClick={() => column.toggleSorting()}
          >
            {["number", "rate", "amount"].includes(col.type) ? (
              <>
                <span className="mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {getSortIcon(col.id, col.type, column.getIsSorted())}
                </span>
                {col.header}
              </>
            ) : (
              <>
                {col.header}
                <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {getSortIcon(col.id, col.type, column.getIsSorted())}
                </span>
              </>
            )}
          </div>
        );
  
        const commonCellContent = (info: any) => (
          <div
            onClick={() =>
              handleCellClick(info.row.id, info.cell.column.getIndex())
            }
          >
            <TableEditableCell
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
        );
  
        switch (col.type) {
          case "action":
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
          case "readonly":
          case "amount":
            return columnHelper.accessor(col.id, {
              header: ({ column }) => commonHeaderContent(column),
              cell: (info) => (
                <div className="px-6 py-3 text-right">
                  {parseFloat(info.getValue()).toFixed(2)}
                </div>
              ),
              sortingFn: (rowA, rowB, columnId) => {
                const a = parseFloat(rowA.getValue(columnId));
                const b = parseFloat(rowB.getValue(columnId));
                return a - b;
              },
            });
          case "checkbox":
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
          default:
            return columnHelper.accessor(col.id, {
              header: ({ column }) => commonHeaderContent(column),
              cell: commonCellContent,
              sortingFn: (rowA, rowB, columnId) => {
                if (rowA.original.isSubtotal && rowB.original.isSubtotal) {
                  return rowA.index - rowB.index; // Maintain original order for subtotal rows
                }
                if (rowA.original.isSubtotal) return 1;
                if (rowB.original.isSubtotal) return -1;
  
                const a = rowA.getValue(columnId);
                const b = rowB.getValue(columnId);
  
                if (typeof a === "number" && typeof b === "number") {
                  return a - b;
                }
  
                return (a?.toString() ?? "").localeCompare(b?.toString() ?? "");
              },
            });
        }
      }),
    [columns, editableRowId, editableCellIndex]
  );
  

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  const getSortIcon = (
    columnId: string,
    columnType: ColumnType,
    isSorted: false | "asc" | "desc"
  ) => {
    if (
      columnType === "number" ||
      columnType === "rate" ||
      columnType === "amount"
    ) {
      if (!isSorted)
        return <IconArrowsSort stroke={2} width={18} height={18} />;
      return isSorted === "desc" ? (
        <IconSortDescendingNumbers stroke={2} width={18} height={18} />
      ) : (
        <IconSortAscendingNumbers stroke={2} width={18} height={18} />
      );
    } else {
      if (!isSorted)
        return <IconArrowsSort stroke={2} width={18} height={18} />;
      return isSorted === "desc" ? (
        <IconSortDescendingLetters stroke={2} width={18} height={18} />
      ) : (
        <IconSortAscendingLetters stroke={2} width={18} height={18} />
      );
    }
  };

  const hasInputColumns = useMemo(() => {
    return columns.some((col) =>
      ["string", "number", "rate", "checkbox"].includes(col.type)
    );
  }, [columns]);

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
        {hasAmountColumn && (
          <button
            onClick={handleAddSubtotalRow}
            className="px-4 py-2 ml-2 border border-gray-300 font-medium rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            Add Subtotal
          </button>
        )}
        {hasInputColumns && (
          <div className="ml-auto flex items-center">
            <div className="flex items-center mr-4">
              <button
                onClick={() => setNewRowCount((prev) => Math.max(1, prev - 1))}
                className="px-2 py-1 border border-gray-300 rounded-l-lg hover:bg-gray-100 active:bg-gray-200"
              >
                -
              </button>
              <input
                type="number"
                value={newRowCount}
                onChange={(e) =>
                  setNewRowCount(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-10 px-2 py-1 text-center border-t border-b border-gray-300"
              />
              <button
                onClick={() => setNewRowCount((prev) => prev + 1)}
                className="px-2 py-1 border border-gray-300 rounded-r-lg hover:bg-gray-100 active:bg-gray-200"
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
        )}
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
              className={`
        ${row.original.isSubtotal ? "border-t border-b border-gray-300" : ""}
        ${row.id === selectedRowId ? "shadow-top-bottom" : ""}
        ${
          !row.original.isSubtotal
            ? "border border-gray-300 hover:bg-gray-100"
            : ""
        }
      `}
              onClick={() =>
                row.original.isSubtotal ? setSelectedRowId(row.id) : null
              }
            >
              {row.getVisibleCells().map((cell, cellIndex) => {
                if (row.original.isSubtotal && cell.column.id !== "actions") {
                  if (
                    cell.column.id ===
                    columns.find((col) => col.type === "amount")?.id
                  ) {
                    return (
                      <td
                        key={cell.id}
                        colSpan={columns.length - 1}
                        className="py-3 pr-6 text-right font-semibold border border-gray-300"
                      >
                        {cell.getValue() as ReactNode}
                      </td>
                    );
                  } else {
                    return null;
                  }
                } else {
                  return (
                    <td
                      key={cell.id}
                      className={`relative px-6 py-4 whitespace-no-wrap ${
                        row.original.isSubtotal
                          ? ""
                          : "border-b border-r border-gray-300"
                      } ${
                        cell.column.id === "actions"
                          ? "border border-gray-300"
                          : ""
                      }`}
                      onClick={() =>
                        !row.original.isSubtotal &&
                        handleCellClick(row.id, cellIndex)
                      }
                      style={{
                        padding: "0",
                        boxSizing: "border-box",
                        width: `${columnWidths[cell.column.id]}px` || "auto",
                      }}
                    >
                      {renderCell(row, cell, cellIndex)}
                    </td>
                  );
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
