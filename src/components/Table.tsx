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
  const [canAddSubtotal, setCanAddSubtotal] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    Object.fromEntries(columns.map((col) => [col.id, col.width || 200]))
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isSorting, setIsSorting] = useState(false);
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

  //HC
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

  //HC
  const handleCellChange = (rowIndex: number, columnId: string, value: any) => {
    setData((prevData) => {
      const updatedData = prevData.map((row, index) => {
        if (index === rowIndex) {
          let updatedRow = { ...row, [columnId]: value };
          const jamPerDay = parseFloat(updatedRow.jamPerDay) || 0;
          const rate = parseFloat(updatedRow.rate) || 0;
          updatedRow.amount = (jamPerDay * rate).toFixed(2);
          return updatedRow;
        }
        return row;
      });

      return isSorting ? updatedData : recalculateSubtotals(updatedData);
    });

    if (sorting.some((sort) => sort.id === columnId)) {
      table.setSorting([...sorting]);
    }
  };

  //HK
  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowId: string,
    cellIndex: number
  ) => {
    if (e.key === "Escape") {
      const rowIndex = table
        .getRowModel()
        .rows.findIndex((row) => row.id === rowId);
      const columnId = columns[cellIndex].id;
      handleCellChange(rowIndex, columnId, previousValue);
      setEditableCellIndex(null);
      setSelectedRowId(null);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      let nextCellIndex = cellIndex;
      let nextRowId = rowId;
      const sortedRows = table.getRowModel().rows;
      const currentRowIndex = sortedRows.findIndex((row) => row.id === rowId);
      const lastSelectableColumnIndex = columns.reduce(
        (lastIndex, col, index) =>
          col.type !== "readonly" &&
          col.type !== "action" &&
          col.type !== "amount"
            ? index
            : lastIndex,
        -1
      );

      setTimeout(() => {
        setSelectedRowId(nextRowId);
        setEditableRowId(nextRowId);
        setEditableCellIndex(nextCellIndex);
      }, 10);

      if (
        e.key === "Enter" &&
        nextCellIndex === lastSelectableColumnIndex &&
        currentRowIndex === sortedRows.length - 1
      ) {
        handleAddRow(1);
        nextCellIndex = columns.findIndex(
          (col) =>
            col.type !== "readonly" &&
            col.type !== "action" &&
            col.type !== "amount"
        );
        // Use setTimeout to allow the new row to be added before trying to access it
        setTimeout(() => {
          const newRows = table.getRowModel().rows;
          if (newRows.length > sortedRows.length) {
            nextRowId = newRows[newRows.length - 1].id;
            setEditableRowId(nextRowId);
            setEditableCellIndex(nextCellIndex);
          }
        }, 0);
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
          columns[nextCellIndex].type === "amount" ||
          columns[nextCellIndex].type === "checkbox"
        );
        setEditableRowId(nextRowId);
        setEditableCellIndex(nextCellIndex);
      }
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
    setData((oldData) => recalculateSubtotals([...oldData, ...newRows]));
  };

  //HAS
  const handleAddSubtotalRow = () => {
    if (!canAddSubtotal) return;

    setData((prevData) => {
      const lastNonSubtotalRowWithAmount = prevData.reduceRight(
        (acc, row, index) => {
          if (!row.isSubtotal && parseFloat(row.amount) > 0 && acc === -1) {
            return index;
          }
          return acc;
        },
        -1
      );

      if (lastNonSubtotalRowWithAmount === -1) return prevData;

      const newData = [...prevData];
      const subtotalRow = createSubtotalRow(0, lastNonSubtotalRowWithAmount);
      newData.splice(lastNonSubtotalRowWithAmount + 1, 0, subtotalRow);

      return recalculateSubtotals(newData);
    });
  };

  //CS
  const createSubtotalRow = (subtotalAmount: number, endIndex: number) => ({
    ...Object.fromEntries(columns.map((col) => [col.id, ""])),
    [columns.find((col) => col.type === "amount")?.id || "amount"]:
      subtotalAmount.toFixed(2),
    isSubtotal: true,
    subtotalEndIndex: endIndex,
  });

  //RS
  const recalculateSubtotals = (currentData: Data[]): Data[] => {
    let currentSubtotal = 0;
    let lastSubtotalIndex = -1;

    return currentData.map((row, index) => {
      if (row.isSubtotal) {
        const subtotalAmount = currentSubtotal.toFixed(2);
        currentSubtotal = 0;
        lastSubtotalIndex = index;
        return {
          ...row,
          [columns.find((col) => col.type === "amount")?.id || "amount"]:
            subtotalAmount,
          subtotalEndIndex: index - 1,
        };
      } else {
        const amount = parseFloat(row.amount) || 0;
        currentSubtotal += amount;
        return row;
      }
    });
  };

  //HAV
  const hasAmountValuesAfterLastSubtotal = (data: Data[]): boolean => {
    const lastSubtotalIndex = data.reduceRight((acc, row, index) => {
      if (row.isSubtotal && acc === -1) return index;
      return acc;
    }, -1);

    const remainingRows =
      lastSubtotalIndex === -1 ? data : data.slice(lastSubtotalIndex + 1);
    return remainingRows.some((row) => parseFloat(row.amount) > 0);
  };

  useEffect(() => {
    setCanAddSubtotal(hasAmountValuesAfterLastSubtotal(data));
  }, [data]);

  useEffect(() => {
    setData((prevData) =>
      recalculateSubtotals(
        prevData.map((row) => {
          if (!row.isSubtotal) {
            const jamPerDay = parseFloat(row.jamPerDay) || 0;
            const rate = parseFloat(row.rate) || 0;
            return { ...row, amount: (jamPerDay * rate).toFixed(2) };
          }
          return row;
        })
      )
    );
  }, []);

  const hasAmountColumn = useMemo(() => {
    return columns.some((col) => col.type === "amount");
  }, [columns]);

  //RC
  const renderCell = (
    row: Row<Data>,
    cell: Cell<Data, unknown>,
    cellIndex: number
  ): ReactNode => {
    const columnType = columns[cellIndex].type;

    if (row.original.isSubtotal) {
      if (columnType === "amount") {
        return (
          <React.Fragment>
            <td
              colSpan={columns.length - 2}
              className="py-3 pr-6 text-right font-semibold border"
            >
              Subtotal:
            </td>
            <td className="py-3 pr-6 text-right font-semibold border">
              {cell.getValue() as ReactNode}
            </td>
          </React.Fragment>
        );
      } else if (columnType === "action") {
        return (
          <div className="flex items-center justify-center h-full">
            <button
              className="text-gray-500 hover:text-gray-600"
              onClick={(event) => handleDeleteRow(row.index, event)}
            >
              <IconTrash stroke={2} width={20} height={20} />
            </button>
          </div>
        );
      }
      return null;
    }

    // Non-subtotal rows
    if (columnType === "action") {
      return flexRender(cell.column.columnDef.cell, cell.getContext());
    }

    const isEditable =
      row.id === editableRowId && cellIndex === editableCellIndex;

    if (columnType === "number" || columnType === "rate") {
      const value = cell.getValue();
      let displayValue: string | number = value as string | number;

      if (!isEditable) {
        if (typeof displayValue === "string") {
          const cleanedValue = displayValue
            .replace(/^0+(?=\d)/, "")
            .replace(/\.$/, "");
          const parsedValue = parseFloat(cleanedValue);
          displayValue = isNaN(parsedValue) ? "0" : parsedValue;
        } else if (typeof displayValue !== "number" || isNaN(displayValue)) {
          displayValue = "0";
        }
      }

      return (
        <TableEditableCell
          value={displayValue}
          onChange={(val) => {
            handleCellChange(row.index, cell.column.id, val);
          }}
          type={columnType}
          editable={isEditable}
          focus={isEditable}
          onKeyDown={(e) => handleKeyDown(e, row.id, cellIndex)}
        />
      );
    }

    if (columnType === "amount") {
      const jamPerDay = parseFloat(row.original.jamPerDay) || 0;
      const rate = parseFloat(row.original.rate) || 0;
      const amount = (jamPerDay * rate).toFixed(2);
      return (
        <TableEditableCell
          value={amount}
          onChange={() => {}}
          type={columnType}
          editable={false}
          focus={false}
          onKeyDown={() => {}}
        />
      );
    }

    if (columnType === "readonly") {
      return (
        <TableEditableCell
          value={cell.getValue()}
          onChange={() => {}}
          type={columnType}
          editable={false}
          focus={false}
          onKeyDown={() => {}}
        />
      );
    }

    return (
      <TableEditableCell
        value={cell.getValue()}
        onChange={(val) => handleCellChange(row.index, cell.column.id, val)}
        type={columnType}
        editable={isEditable}
        focus={isEditable}
        onKeyDown={(e) => handleKeyDown(e, row.id, cellIndex)}
      />
    );
  };

  //HD
  const handleDeleteRow = (rowIndex: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setData((oldData) => {
      const newData = oldData.filter((_, index) => index !== rowIndex);
      return recalculateSubtotals(newData);
    });
  };

  //HMD
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

  //TC
  const tableColumns = useMemo(
    () =>
      columns.map((col) => {
        const commonHeaderContent = (column: any) => (
          <div
            className={`flex items-center group cursor-pointer w-full h-full ${
              ["number", "rate", "amount"].includes(col.type)
                ? "justify-end"
                : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              column.toggleSorting();
              const isSorted = column.getIsSorted() !== false;
              setIsSorting(isSorted);
              setData((prevData) => {
                if (isSorted) {
                  return prevData.filter((row) => !row.isSubtotal);
                } else {
                  return recalculateSubtotals(prevData);
                }
              });
            }}
          >
            {["number", "rate", "amount"].includes(col.type) ? (
              <>
                <span
                  className={`mr-2 ${
                    column.getIsSorted()
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  } transition-opacity p-2 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 rounded-full`}
                >
                  {getSortIcon(col.id, col.type, column.getIsSorted())}
                </span>
                {col.header}
              </>
            ) : (
              <>
                {col.header}
                <span
                  className={`ml-2 ${
                    column.getIsSorted()
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  } transition-opacity p-2 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 rounded-full`}
                >
                  {getSortIcon(col.id, col.type, column.getIsSorted())}
                </span>
              </>
            )}
          </div>
        );

        const commonCellContent = (info: any) => (
          <div
            onClick={(event) => {
              event.stopPropagation(); // Add this line
              handleCellClick(info.row.id, info.cell.column.getIndex());
            }}
          >
            <TableEditableCell
              value={info.getValue()}
              onChange={(val) => handleCellChange(info.row.index, col.id, val)}
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
              cell: (info) => {
                if (col.type === "amount") {
                  const jamPerDay =
                    parseFloat(info.row.original.jamPerDay) || 0;
                  const rate = parseFloat(info.row.original.rate) || 0;
                  const amount = (jamPerDay * rate).toFixed(2);
                  return <div className="px-6 py-3 text-right">{amount}</div>;
                }
                return (
                  <div className="px-6 py-3 text-right">
                    {parseFloat(info.getValue()).toFixed(2)}
                  </div>
                );
              },
              sortingFn: (rowA, rowB, columnId) => {
                if (rowA.original.isSubtotal && rowB.original.isSubtotal) {
                  return rowA.index - rowB.index;
                }
                if (rowA.original.isSubtotal) return 1;
                if (rowB.original.isSubtotal) return -1;

                const a = rowA.getValue(columnId);
                const b = rowB.getValue(columnId);

                const aNum =
                  typeof a === "number" ? a : parseFloat(a as string);
                const bNum =
                  typeof b === "number" ? b : parseFloat(b as string);

                if (!isNaN(aNum) && !isNaN(bNum)) {
                  return aNum - bNum;
                }

                return (a?.toString() ?? "").localeCompare(b?.toString() ?? "");
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
                      handleCellChange(info.row.index, col.id, e.target.checked)
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
                  return rowA.index - rowB.index;
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
    [
      columns,
      editableRowId,
      editableCellIndex,
      handleCellChange,
      handleCellClick,
      handleDeleteRow,
      handleKeyDown,
    ]
  );

  //T
  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      const isSorted = newSorting.length > 0;
      setIsSorting(isSorted);
      setData((prevData) => {
        if (isSorted) {
          return prevData.filter((row) => !row.isSubtotal);
        } else {
          return recalculateSubtotals(prevData);
        }
      });
    },
    state: { sorting },
  });

  const isSortableColumn = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId);
    return column && column.type !== "action" && column.type !== "checkbox";
  };

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
    let baseClass = "cursor-pointer ";
    switch (columnType) {
      case "number":
      case "rate":
      case "readonly":
      case "amount":
        return baseClass + "text-right";
      case "checkbox":
      case "action":
        return "text-center";
      default:
        return baseClass + "text-left";
    }
  };

  return (
    <div ref={tableRef} className="p-8 w-auto">
      <div className="flex items-center mb-4 w-auto">
        {hasAmountColumn && (
          <button
            onClick={handleAddSubtotalRow}
            className={`px-4 py-2 ml-2 border border-gray-300 font-medium rounded-full ${
              canAddSubtotal
                ? "hover:bg-gray-100 active:bg-gray-200"
                : "opacity-50 cursor-not-allowed"
            }`}
            disabled={!canAddSubtotal}
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
                  className={`px-6 py-2 border border-b-2 border-gray-300 text-base leading-4 font-bold text-gray-600 uppercase tracking-wider group ${getHeaderClass(
                    columns.find((col) => col.id === header.id)?.type ||
                      "string"
                  )}`}
                  onClick={(e) => {
                    if (isSortableColumn(header.column.id)) {
                      table.getColumn(header.column.id)?.toggleSorting();
                    }
                  }}
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
              className={`${
                row.original.isSubtotal
                  ? "border-t border-b border-gray-300"
                  : ""
              } ${row.id === selectedRowId ? "shadow-top-bottom" : ""} ${
                !row.original.isSubtotal
                  ? "border border-gray-300 hover:bg-gray-100"
                  : ""
              }`}
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
                        Subtotal: {cell.getValue() as ReactNode}
                      </td>
                    );
                  } else {
                    return null;
                  }
                } else {
                  return (
                    <td
                      key={cell.id}
                      className={`relative px-6 py-4 whitespace-no-wrap cursor-default ${
                        row.original.isSubtotal ? "" : "border border-gray-300"
                      } ${
                        cell.column.id === "actions"
                          ? "border border-gray-300"
                          : ""
                      } ${
                        row.id === editableRowId &&
                        cellIndex === editableCellIndex
                          ? "cell-highlight before:absolute before:inset-[-1px] before:border-[1.5px] before:border-gray-400 before:pointer-events-none before:z-10"
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
