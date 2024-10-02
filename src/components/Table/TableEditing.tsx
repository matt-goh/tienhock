import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
  useCallback,
} from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  Cell,
  Row,
  ColumnDef,
  getPaginationRowModel,
  PaginationState,
} from "@tanstack/react-table";
import {
  IconArrowsSort,
  IconSortAscendingLetters,
  IconSortAscendingNumbers,
  IconSortDescendingLetters,
  IconSortDescendingNumbers,
  IconSquare,
  IconSquareCheckFilled,
  IconTrash,
} from "@tabler/icons-react";
import { ColumnType, TableProps, ColumnConfig } from "../../types/types";
import TableEditableCell from "./TableEditableCell";
import DeleteButton from "./DeleteButton";
import TableHeader from "./TableHeader";
import TablePagination from "./TablePagination";
import ToolTip from "../ToolTip";

function TableEditing<T extends Record<string, any>>({
  initialData,
  columns,
  onShowDeleteButton,
  onDelete,
  onChange,
  tableKey,
}: TableProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previousCellValues, setPreviousCellValues] = useState<{
    [key: string]: any;
  }>({});
  const [originalData, setOriginalData] = useState<T[]>(initialData);
  const [canAddSubtotal, setCanAddSubtotal] = useState(true);
  const [selectedRowForSubtotal, setSelectedRowForSubtotal] = useState<
    number | null
  >(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<{
    index: number;
    id: string;
  } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isSorting, setIsSorting] = useState(false);
  const [isAllSelectedGlobal, setIsAllSelectedGlobal] = useState(false);
  const [isIndeterminateGlobal, setIsIndeterminateGlobal] = useState(false);
  const [tableWidth, setTableWidth] = useState(0);
  const [isLastRowHovered, setIsLastRowHovered] = useState(false);
  const [isAddRowBarHovered, setIsAddRowBarHovered] = useState(false);
  const [isAddRowBarActive, setIsAddRowBarActive] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    Object.fromEntries(columns.map((col) => [col.id, col.width || 200]))
  );

  // Refs
  const addRowBarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLTableElement>(null);

  // Constants
  const isSortingDisabled = [
    "orderDetails",
    "focItems",
    "returnedGoods",
  ].includes(tableKey || "");

  const isEditableColumn = (col: ColumnConfig) => {
    return !["selection", "readonly", "action", "amount", "checkbox"].includes(
      col.type
    );
  };

  const handleColumnResize = useCallback((columnId: string, width: number) => {
    setColumnWidths((prev) => ({
      ...prev,
      [columnId]: width,
    }));
  }, []);

  useEffect(() => {
    if (pagination.pageIndex >= Math.ceil(data.length / pagination.pageSize)) {
      setPagination((prev) => ({
        ...prev,
        pageIndex: Math.max(
          0,
          Math.ceil(data.length / pagination.pageSize) - 1
        ),
      }));
    }
  }, [data.length, pagination.pageIndex, pagination.pageSize]);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const updateTableWidth = () => {
      if (tableContainerRef.current) {
        setTableWidth(tableContainerRef.current.offsetWidth);
      }
    };

    updateTableWidth();
    window.addEventListener("resize", updateTableWidth);

    return () => {
      window.removeEventListener("resize", updateTableWidth);
    };
  }, []);

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

  useEffect(() => {
    setCanAddSubtotal(hasAmountValuesAfterLastSubtotal(data));
  }, [data]);

  //HCC
  const handleCellClick = useCallback(
    (rowId: string | undefined, cellIndex: number) => {
      if (isSorting || !rowId) return;

      const row = table.getRowModel().rows.find((r) => r.id === rowId);
      if (!row || row.original.isSubtotal || row.original.isTotal) return;

      const filteredCellIndex = cellIndex;
      const columnId = columns[filteredCellIndex]?.id;
      if (!columnId) return;

      const cellValue = row.original[columnId];

      // Always update these states
      setEditableRowId(rowId);
      setEditableCellIndex(cellIndex);
      setSelectedRowId(rowId);
      setPreviousCellValues((prev) => ({
        ...prev,
        [`${rowId}-${columnId}`]: cellValue,
      }));
    },
    [isSorting, columns]
  );

  //HCC
  const handleCellChange = useCallback(
    (rowIndex: number, columnId: string, value: any) => {
      setData((prevData) => {
        const updatedData = prevData.map((row, index) => {
          if (index === rowIndex) {
            return { ...row, [columnId]: value };
          }
          return row;
        });

        if (onChange) {
          onChange(updatedData);
        }

        return updatedData;
      });

      if (sorting.some((sort) => sort.id === columnId)) {
        table.setSorting([...sorting]);
      }
    },
    [onChange, sorting]
  );

  // Helper function to find the next editable cell
  const findNextEditableCell = (
    startRowIndex: number,
    startColIndex: number,
    moveToNextRow: boolean
  ): { rowIndex: number; colIndex: number } | null => {
    const sortedRows = table.getRowModel().rows;
    let rowIndex = startRowIndex;
    let colIndex = startColIndex;

    const totalRows = sortedRows.length;
    const editableColumns = allColumns.filter(
      (col) => isEditableColumn(col) && col.type !== "listbox"
    );
    const totalEditableCols = editableColumns.length;

    if (moveToNextRow) {
      rowIndex = (rowIndex + 1) % totalRows;
      colIndex = editableColumns[0]?.id
        ? allColumns.findIndex((col) => col.id === editableColumns[0].id)
        : 0;
    } else {
      colIndex++;
    }

    for (let i = 0; i < totalRows * totalEditableCols; i++) {
      if (colIndex >= allColumns.length) {
        colIndex = 0;
        rowIndex = (rowIndex + 1) % totalRows;
      }

      const row = sortedRows[rowIndex].original;
      if (row.isTotal) {
        rowIndex = (rowIndex + 1) % totalRows;
        colIndex = 0;
        continue;
      }

      const column = allColumns[colIndex];
      if (
        !row.isSubtotal &&
        isEditableColumn(column) &&
        column.type !== "listbox"
      ) {
        return { rowIndex, colIndex };
      }

      colIndex++;
    }

    return null;
  };

  // HKD
  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowId: string,
    cellIndex: number
  ) => {
    if (e.key === "Escape") {
      const columnId = columns[cellIndex - 1].id;
      const previousValue = previousCellValues[`${rowId}-${columnId}`];
      if (previousValue !== undefined) {
        const rowIndex = table
          .getRowModel()
          .rows.findIndex((row) => row.id === rowId);
        handleCellChange(rowIndex, columnId, previousValue);
      }
      setEditableCellIndex(null);
      setEditableRowId(null);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      const sortedRows = table.getRowModel().rows;
      const currentRowIndex = sortedRows.findIndex((row) => row.id === rowId);
      const isLastPage = !table.getCanNextPage();
      const isLastRow = currentRowIndex === sortedRows.length - 1;
      const isLastColumn = cellIndex === allColumns.length - 1;

      const moveToNextRow = e.key === "Enter" && isLastColumn;

      if (
        e.key === "Enter" &&
        isLastColumn &&
        isLastRow &&
        isLastPage &&
        !sortedRows[currentRowIndex].original.isTotal
      ) {
        setTimeout(() => {
          const newRows = table.getRowModel().rows;
          const newRowId = newRows[newRows.length - 1].id;
          setSelectedRowId(newRowId);
          setEditableRowId(newRowId);
          setEditableCellIndex(allColumns.findIndex(isEditableColumn));
        }, 10);
      } else {
        const nextEditableCell = findNextEditableCell(
          currentRowIndex,
          cellIndex,
          moveToNextRow
        );

        if (nextEditableCell) {
          const { rowIndex: nextRowIndex, colIndex: nextColIndex } =
            nextEditableCell;
          const nextRowId = sortedRows[nextRowIndex].id;
          setSelectedRowId(nextRowId);
          setEditableRowId(nextRowId);
          setEditableCellIndex(nextColIndex);
        } else if (isLastRow && isLastPage) {
          // If we're on the last row of the last page and can't find next editable cell, do nothing
          return;
        }
      }
    }
  };

  // HAR
  const handleAddRow = useCallback(() => {
    const newRow = {
      id: `new_${Math.random().toString(36).substr(2, 9)}`,
      ...Object.fromEntries(
        columns.map((col) => {
          switch (col.type) {
            case "number":
            case "rate":
            case "float":
            case "amount":
            case "readonly":
              return [col.id, 0];
            case "checkbox":
              return [col.id, false];
            default:
              return [col.id, ""];
          }
        })
      ),
    } as T;

    setData((prevData) => {
      let newData;
      const hasTotalRow =
        prevData.length > 0 && prevData[prevData.length - 1].isTotal;

      if (hasTotalRow) {
        // Insert the new row before the total row
        newData = [
          ...prevData.slice(0, -1),
          newRow,
          prevData[prevData.length - 1],
        ];
      } else {
        // No total row, just add the new row at the end
        newData = [...prevData, newRow];
      }

      if (onChange) {
        onChange(newData);
      }
      return newData;
    });

    return true;
  }, [columns, onChange]);

  // HMD
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsAddRowBarActive(true);
  }, []);

  // HMU
  const handleMouseUp = useCallback(() => {
    setIsAddRowBarActive(false);
    if (addRowBarRef.current) {
      addRowBarRef.current.style.top = "0px";
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseUp]);

  //HASR
  const handleAddSubtotalRow = () => {
    if (!canAddSubtotal) return;

    setData((prevData) => {
      let insertIndex: number;
      let subtotalEndIndex: number;

      if (selectedRowForSubtotal) {
        insertIndex =
          prevData.findIndex((row) => row.id === selectedRowForSubtotal) + 1;
        subtotalEndIndex = insertIndex - 1;
      } else {
        const lastNonSubtotalRowWithAmount = prevData.reduceRight(
          (acc, row, index) => {
            if (!row.isSubtotal && parseFloat(row.amount) > 0 && acc === -1) {
              return index;
            }
            return acc;
          },
          -1
        );
        insertIndex = lastNonSubtotalRowWithAmount + 1;
        subtotalEndIndex = lastNonSubtotalRowWithAmount;
      }

      if (insertIndex === 0) return prevData;

      const newData = [...prevData];
      const subtotalRow = createSubtotalRow(0, subtotalEndIndex);
      newData.splice(insertIndex, 0, subtotalRow);

      const recalculatedData = recalculateSubtotals(newData);
      setOriginalData(recalculatedData);
      return recalculatedData;
    });

    setSelectedRowForSubtotal(null);
  };

  // CS
  const createSubtotalRow = (subtotalAmount: number, endIndex: number): T =>
    ({
      id: `subtotal-${Math.random().toString(36).substr(2, 9)}`,
      ...Object.fromEntries(columns.map((col) => [col.id, ""])),
      [columns.find((col) => col.type === "amount")?.id || "amount"]:
        subtotalAmount.toFixed(2),
      isSubtotal: true,
      subtotalEndIndex: endIndex,
    } as unknown as T);

  // RS
  const recalculateSubtotals = useCallback(
    (currentData: T[]): T[] => {
      let currentSubtotal = 0;
      const recalculatedData: T[] = [];

      currentData.forEach((row, index) => {
        if (row.isSubtotal) {
          const subtotalAmount = currentSubtotal.toFixed(2);
          recalculatedData.push({
            ...row,
            id: row.id || `subtotal-${Math.random().toString(36).substr(2, 9)}`,
            [columns.find((col) => col.type === "amount")?.id || "amount"]:
              subtotalAmount,
            subtotalEndIndex: index - 1,
          });
          currentSubtotal = 0;
        } else {
          const amount = parseFloat(row.amount) || 0;
          currentSubtotal += amount;
          recalculatedData.push(row);
        }
      });

      return recalculatedData;
    },
    [columns]
  );

  //HAV
  const hasAmountValuesAfterLastSubtotal = (data: T[]): boolean => {
    const lastSubtotalIndex = data.reduceRight((acc, row, index) => {
      if (row.isSubtotal && acc === -1) return index;
      return acc;
    }, -1);

    const remainingRows =
      lastSubtotalIndex === -1 ? data : data.slice(lastSubtotalIndex + 1);
    return remainingRows.some((row) => parseFloat(row.amount) > 0);
  };

  // DR
  const deleteRow = async (rowIndex: number) => {
    setData((oldData) => {
      const newData = oldData.filter((_, index) => index !== rowIndex);
      const updatedData = recalculateSubtotals(newData);
      setOriginalData(updatedData);
      return updatedData;
    });

    setRowToDelete(null);
  };

  // HDR
  const handleDeleteRow = async (rowIndex: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const rowData = data[rowIndex];
    if (rowData.id) {
      setRowToDelete({ index: rowIndex, id: rowData.id });
    } else {
      // For rows not in the database, delete immediately
      deleteRow(rowIndex);
    }
  };

  // HDS
  const handleDeleteSelected = useCallback(async () => {
    const selectedIndices = Array.from(selectedRows);
    if (onDelete) {
      await onDelete(selectedIndices);
    }
    // Clear selection after deletion
    setSelectedRows(new Set());

    // Update the table data
    setData((prevData) => {
      const updatedData = prevData.filter(
        (_, index) => !selectedIndices.includes(index)
      );
      return updatedData;
    });

    // Recalculate subtotals if necessary
    setData((prevData) => recalculateSubtotals(prevData));

    // Update pagination if necessary
    if (pagination.pageIndex >= Math.ceil(data.length / pagination.pageSize)) {
      setPagination((prev) => ({
        ...prev,
        pageIndex: Math.max(
          0,
          Math.ceil(data.length / pagination.pageSize) - 1
        ),
      }));
    }
  }, [selectedRows, onDelete, data.length, pagination.pageSize]);

  const allColumns = useMemo(() => columns, [columns]);

  const isSortableColumn = (columnId: string) => {
    if (isSortingDisabled) return false;
    const column = columns.find((col) => col.id === columnId);
    return column && column.type !== "action" && column.type !== "checkbox";
  };

  const getSortIcon = (
    columnId: string,
    columnType: ColumnType,
    isSorted: false | "asc" | "desc"
  ) => {
    if (isSortingDisabled) return null;
    if (
      columnType === "number" ||
      columnType === "rate" ||
      columnType === "amount" ||
      columnType === "float"
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

  const hasAmountColumn = useMemo(() => {
    return columns.some((col) => col.type === "amount");
  }, [columns]);

  const hasNumberColumn = useMemo(() => {
    return columns.some((col) => col.type === "number");
  }, [columns]);

  //RC
  const renderCell = (
    row: Row<T>,
    cell: Cell<T, unknown>,
    cellIndex: number,
    isLastRow: boolean
  ): ReactNode => {
    const renderCellContent = () => {
      const columnType = allColumns[cellIndex].type;
      const columnConfig = allColumns[cellIndex];
      const isEditable =
        !isSorting &&
        !row.original.isSubtotal &&
        !row.original.isTotal &&
        isEditableColumn(columnConfig);

      // Custom cell renderer
      if (columnConfig.cell) {
        return columnConfig.cell({
          getValue: () => cell.getValue(),
          row: { original: { ...row.original, isSorting } },
        });
      }

      // Handle special rows (Less, Tax, and Total)
      if (row.original.isLess || row.original.isTax || row.original.isTotal) {
        if (cellIndex === 0) {
          return (
            <input
              className="w-full h-full px-6 py-3 m-0 outline-none bg-transparent cursor-default"
              tabIndex={-1}
              type="text"
              readOnly
              value={cell.getValue() as string}
              style={{ boxSizing: "border-box" }}
            />
          );
        } else if (cellIndex === 1) {
          const colspan = row.original.colspan || columns.length - 3;
          return (
            <input
              className="w-full h-full px-6 py-3 m-0 outline-none bg-transparent cursor-default"
              tabIndex={-1}
              type="text"
              readOnly
              value={cell.getValue() as string}
              style={{ boxSizing: "border-box" }}
            />
          );
        } else if (cellIndex === columns.length - 2) {
          const value = cell.getValue();
          return (
            <input
              className="w-full h-full px-6 py-3 m-0 outline-none bg-transparent text-right cursor-default"
              tabIndex={-1}
              type="text"
              readOnly
              value={
                typeof value === "number" ? value.toFixed(2) : (value as string)
              }
              style={{ boxSizing: "border-box" }}
            />
          );
        } else if (cellIndex === columns.length - 1) {
          // Action column
          return (
            <div className="flex items-center justify-center h-full">
              <button
                className={`p-2 rounded-full text-gray-500 hover:bg-gray-200 active:bg-gray-300 hover:text-gray-600 ${
                  isSorting ? "opacity-50 cursor-not-allowed" : ""
                }`}
                onClick={(event) => {
                  if (!isSorting) {
                    handleDeleteRow(row.index, event);
                  }
                }}
                disabled={isSorting}
              >
                <IconTrash stroke={2} width={20} height={20} />
              </button>
            </div>
          );
        } else {
          return null;
        }
      }

      if (columnType === "selection") {
        return (
          <div className="flex items-center justify-center h-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRowSelection(row);
              }}
              className="p-2 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors duration-200"
              disabled={isSorting}
            >
              {isAllSelectedGlobal ? (
                <IconSquareCheckFilled
                  width={20}
                  height={20}
                  className="text-blue-600"
                />
              ) : selectedRows.has(row.index) ? (
                <IconSquareCheckFilled
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
        );
      }

      if (row.original.isSubtotal || row.original.isTotal) {
        if (columnType === "action") {
          return (
            <div className="flex items-center justify-center h-full">
              <button
                className={`p-2 rounded-full text-gray-500 hover:bg-gray-100 active:bg-gray-200 hover:text-gray-600 ${
                  isSorting ? "opacity-50 cursor-not-allowed" : ""
                }`}
                onClick={(event) => {
                  if (!isSorting) {
                    handleDeleteRow(row.index, event);
                  }
                }}
                disabled={isSorting}
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

      if (
        ["number", "rate", "string", "float", "date", "listbox"].includes(
          columnType
        )
      ) {
        return (
          <TableEditableCell
            value={cell.getValue()}
            onChange={(val) => {
              if (!isSorting) {
                handleCellChange(row.index, cell.column.id, val);
              }
            }}
            type={columnType}
            editable={isEditable && !isSorting}
            focus={
              isEditable &&
              !isSorting &&
              row.id === editableRowId &&
              cellIndex === editableCellIndex
            }
            onKeyDown={(e) => !isSorting && handleKeyDown(e, row.id, cellIndex)}
            isSorting={isSorting}
            previousCellValue={
              previousCellValues[`${row.id}-${cell.column.id}`] ??
              cell.getValue()
            }
            options={columnConfig.options}
          />
        );
      }

      if (columnType === "amount") {
        return (
          <TableEditableCell
            value={cell.getValue()}
            onChange={() => {}}
            type={columnType}
            editable={false}
            focus={false}
            onKeyDown={() => {}}
            isSorting={isSorting}
            previousCellValue={cell.getValue()}
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
            isSorting={isSorting}
            previousCellValue={cell.getValue()}
          />
        );
      }

      if (columnType === "checkbox") {
        return (
          <div className="flex items-center justify-center h-full">
            <TableEditableCell
              value={cell.getValue()}
              onChange={(val) =>
                handleCellChange(row.index, cell.column.id, val)
              }
              type="checkbox"
              editable={!isSorting}
              focus={false}
              onKeyDown={() => {}}
              isSorting={isSorting}
              previousCellValue={cell.getValue()}
            />
          </div>
        );
      }

      return (
        <TableEditableCell
          value={cell.getValue()}
          onChange={() => {}}
          type={columnType}
          editable={false}
          focus={false}
          onKeyDown={() => {}}
          isSorting={isSorting}
          previousCellValue={cell.getValue()}
        />
      );
    };

    if (isLastRow) {
      return (
        <div
          onMouseEnter={() => setIsLastRowHovered(true)}
          onMouseLeave={() => setIsLastRowHovered(false)}
        >
          {renderCellContent() as ReactNode}
        </div>
      );
    }

    return renderCellContent() as ReactNode;
  };

  // TC
  const tableColumns: ColumnDef<T>[] = useMemo(
    () =>
      allColumns.map((col): ColumnDef<T> => {
        const commonHeaderContent = (column: any) => (
          <div
            className={`flex items-center w-full h-full ${
              ["number", "rate", "amount", "float"].includes(col.type)
                ? "justify-end"
                : ""
            } ${
              isSortingDisabled
                ? ["number", "rate", "amount", "float"].includes(col.type)
                  ? "pl-2"
                  : "pr-2"
                : "group cursor-pointer"
            }`}
            onClick={() => {
              if (!isSortingDisabled && isSortableColumn(column.id)) {
                const currentIsSorted = column.getIsSorted();
                column.toggleSorting();
                const newIsSorted = column.getIsSorted();
                setIsSorting(newIsSorted !== false);
                if (currentIsSorted !== false && newIsSorted === false) {
                  // Sorting was cleared, recalculate subtotals
                  setData((prevData) => recalculateSubtotals(prevData));
                } else if (newIsSorted !== false) {
                  // New sorting applied, remove subtotals
                  setData((prevData) =>
                    prevData.filter((row) => !row.isSubtotal)
                  );
                }
              }
            }}
          >
            {["number", "rate", "amount", "float"].includes(col.type) ? (
              <>
                {!isSortingDisabled && (
                  <span className="mr-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-gray-200 active:bg-gray-300 duration-200 rounded-full">
                    {getSortIcon(col.id, col.type, column.getIsSorted())}
                  </span>
                )}
                <span
                  className={`select-none ${isSortingDisabled ? "pl-2" : ""}`}
                >
                  {col.header}
                </span>
              </>
            ) : (
              <>
                <span
                  className={`select-none ${isSortingDisabled ? "pr-2" : ""}`}
                >
                  {col.header}
                </span>
                {!isSortingDisabled && (
                  <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-gray-200 active:bg-gray-300 duration-200 rounded-full">
                    {getSortIcon(col.id, col.type, column.getIsSorted())}
                  </span>
                )}
              </>
            )}
          </div>
        );

        const commonCellContent = (info: any) => (
          <div
            onClick={(event) => {
              event.stopPropagation();
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
              isSorting={isSorting}
              previousCellValue={info.getValue()}
            />
          </div>
        );

        const baseColumn: Partial<ColumnDef<T>> = {
          id: col.id,
          size: columnWidths[col.id],
          header: ({ column }) => (
            <div
              className={`relative flex items-center h-full ${
                isSortingDisabled ? "py-2" : ""
              }`}
            >
              {commonHeaderContent(column)}
            </div>
          ),
        };

        switch (col.type) {
          case "action":
            return {
              ...baseColumn,
              cell: (info) => (
                <div className="flex items-center justify-center h-full">
                  <button
                    className={`p-2 rounded-full text-gray-500 hover:bg-gray-200 active:bg-gray-300 hover:text-gray-600 ${
                      isSorting ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    onClick={(event) => {
                      if (!isSorting) {
                        handleDeleteRow(info.row.index, event);
                      }
                    }}
                    disabled={isSorting}
                  >
                    <IconTrash stroke={2} width={20} height={20} />
                  </button>
                </div>
              ),
            } as ColumnDef<T>;
          case "readonly":
          case "amount":
            return {
              ...baseColumn,
              accessorFn: (row: T) => {
                const amountValue = row[col.id as keyof T];
                return typeof amountValue === "number" ||
                  typeof amountValue === "string"
                  ? amountValue
                  : 0;
              },
              cell: (info) => {
                const value = info.getValue();
                return (
                  <div className="px-6 py-3 text-right">
                    {typeof value === "number" ? value.toFixed(2) : "0.00"}
                  </div>
                );
              },
              sortingFn: isSortingDisabled
                ? undefined
                : (rowA, rowB, columnId) => {
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

                    return (a?.toString() ?? "").localeCompare(
                      b?.toString() ?? ""
                    );
                  },
            } as ColumnDef<T>;
          case "checkbox":
            return {
              ...baseColumn,
              accessorFn: (row: T) => row[col.id as keyof T],
              cell: (info) => (
                <div className="flex items-center justify-center h-full">
                  <TableEditableCell
                    value={info.getValue()}
                    onChange={(val) =>
                      handleCellChange(info.row.index, col.id, val)
                    }
                    type="checkbox"
                    editable={!isSorting}
                    focus={false}
                    onKeyDown={() => {}}
                    isSorting={isSorting}
                    previousCellValue={info.cell.getValue()}
                  />
                </div>
              ),
            } as ColumnDef<T>;
          default:
            return {
              ...baseColumn,
              accessorFn: (row: T) => row[col.id as keyof T] as string,
              cell: (info) => {
                const row = info.row.original as T & {
                  isTotal?: boolean;
                  isSubtotal?: boolean;
                };
                return commonCellContent(info);
              },
              sortingFn: isSortingDisabled
                ? undefined
                : (rowA, rowB, columnId) => {
                    if (rowA.original.isTotal) return 1;
                    if (rowB.original.isTotal) return -1;
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
                    return (a?.toString() ?? "").localeCompare(
                      b?.toString() ?? ""
                    );
                  },
            } as ColumnDef<T>;
        }
      }),
    [
      columns,
      isSorting,
      selectedRows,
      columnWidths,
      editableRowId,
      editableCellIndex,
      isSortingDisabled,
      isAllSelectedGlobal,
      isIndeterminateGlobal,
      handleColumnResize,
      handleCellChange,
      handleCellClick,
      handleKeyDown,
    ]
  );

  // TuRT
  const table = useReactTable<T>({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: isSortingDisabled ? undefined : getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    onPaginationChange: setPagination,
    state: {
      sorting: isSortingDisabled ? [] : sorting,
      pagination,
    },
    //OSC
    onSortingChange: isSortingDisabled
      ? undefined
      : (updater) => {
          const newSorting =
            typeof updater === "function" ? updater(sorting) : updater;
          setSorting(newSorting);
          const isSorted = newSorting.length > 0;
          setIsSorting(isSorted);
          if (isSorted) {
            setData((prevData) => prevData.filter((row) => !row.isSubtotal));
          } else {
            setData((prevData) => {
              const recalculatedData = originalData.map((row) => {
                if (!row.isSubtotal) {
                  return { ...row };
                }
                return row;
              });
              const newData = recalculateSubtotals(recalculatedData);
              setOriginalData(newData);
              return newData;
            });
          }
        },
  });

  // USS
  const updateSelectionState = useCallback(
    (selectedRows: Set<number>) => {
      const allRowsCount = data.filter((row) => !row.isSubtotal).length;
      const isAllSelected = selectedRows.size === allRowsCount;
      const isIndeterminate = selectedRows.size > 0 && !isAllSelected;

      setIsAllSelectedGlobal(isAllSelected);
      setIsIndeterminateGlobal(isIndeterminate);

      setShowDeleteButton(selectedRows.size > 0);
      setCanAddSubtotal(
        selectedRows.size <= 1 && hasAmountValuesAfterLastSubtotal(data)
      );
      if (onShowDeleteButton) {
        onShowDeleteButton(selectedRows.size > 0);
      }
    },
    [data, onShowDeleteButton]
  );

  useEffect(() => {
    updateSelectionState(selectedRows);
  }, [selectedRows, data, updateSelectionState]);

  // HSA
  const handleSelectAll = useCallback(() => {
    setSelectedRows((prev) => {
      let newSet: Set<number>;
      if (isAllSelectedGlobal || isIndeterminateGlobal) {
        // Deselect all rows across all pages
        newSet = new Set();
      } else {
        // Select all rows across all pages
        newSet = new Set(
          data.filter((row) => !row.isSubtotal).map((_, index) => index)
        );
      }
      updateSelectionState(newSet);
      return newSet;
    });
  }, [isAllSelectedGlobal, isIndeterminateGlobal, data, updateSelectionState]);

  // HRS
  const handleRowSelection = useCallback(
    (row: Row<T>) => {
      setSelectedRows((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(row.index)) {
          newSet.delete(row.index);
        } else {
          newSet.add(row.index);
        }
        updateSelectionState(newSet);
        return newSet;
      });
    },
    [updateSelectionState]
  );

  const isLastPage = table.getCanNextPage() === false;

  return (
    <div ref={tableRef} className="flex flex-col items-center w-auto">
      <div className="rounded-lg border border-gray-300 w-fit">
        <table
          className="w-auto border-collapse border-spacing-0 rounded-lg"
          ref={tableContainerRef}
          style={{ tableLayout: "fixed" }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableHeader
                key={headerGroup.id}
                headerGroup={headerGroup}
                columns={columns}
                isEditing={true}
                isAllSelectedGlobal={isAllSelectedGlobal}
                isIndeterminateGlobal={isIndeterminateGlobal}
                handleSelectAll={handleSelectAll}
                isSortableColumn={isSortableColumn}
                columnWidths={columnWidths}
                onColumnResize={handleColumnResize}
              />
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isLastRow =
                rowIndex === table.getRowModel().rows.length - 1;
              return (
                <tr
                  key={row.id}
                  className={`border-t ${
                    isLastRow
                      ? "border-b-0 rounded-b-lg"
                      : "border-b border-gray-300"
                  } ${row.id === selectedRowId ? "shadow-top-bottom" : ""}
                    ${
                      selectedRows.has(row.original.id)
                        ? "bg-blue-50 hover:bg-blue-50"
                        : "hover:bg-gray-100"
                    } ${row.id === editableRowId ? "relative z-10" : ""}}`}
                  onClick={() =>
                    row.original.isSubtotal || row.original.isTotal
                      ? setSelectedRowId(row.id)
                      : null
                  }
                >
                  {row.getVisibleCells().map((cell, cellIndex) => {
                    const isLastRow =
                      rowIndex === table.getRowModel().rows.length - 1;
                    const isFirstCell = cellIndex === 0;
                    const isLastCell =
                      cellIndex === row.getVisibleCells().length - 1;
                    // Special handling for Less, Tax, and Total rows
                    if (
                      row.original.isLess ||
                      row.original.isTax
                    ) {
                      if (
                        cellIndex === 0 ||
                        cellIndex === 1 ||
                        cellIndex === columns.length - 2 ||
                        cellIndex === columns.length - 1
                      ) {
                        return (
                          <td
                            key={cell.id}
                            className={`relative px-6 py-4 whitespace-no-wrap cursor-default
                        ${
                          isFirstCell
                            ? "border-l-0"
                            : "border-l border-gray-300"
                        }
                        ${isLastCell ? "border-r-0" : ""}
                        ${isLastRow ? "border-b-0" : "border-b border-gray-300"}
                        ${isLastCell && isLastRow ? "rounded-br-lg" : ""}
                        ${isFirstCell && isLastRow ? "rounded-bl-lg" : ""}`}
                            colSpan={cellIndex === 1 ? columns.length - 3 : 1}
                            style={{
                              padding: "0",
                              boxSizing: "border-box",
                              width:
                                `${columnWidths[cell.column.id]}px` || "auto",
                            }}
                          >
                            {renderCell(row, cell, cellIndex, isLastRow)}
                          </td>
                        );
                      } else {
                        return null;
                      }
                    }
                    if (row.original.isTotal || row.original.isSubtotal) {
                      if (cell.column.id === "selection") {
                        return (
                          <td
                            key={cell.id}
                            className="border-r border-gray-300"
                          >
                            {renderCell(row, cell, cellIndex, isLastRow)}
                          </td>
                        );
                      } else if (
                        cell.column.id ===
                        columns.find((col) => col.type === "amount")?.id
                      ) {
                        return (
                          <td
                            key={cell.id}
                            colSpan={columns.length}
                            className={`py-3 pr-6 text-right font-semibold rounded-br-lg rounded-bl-lg`}
                          >
                            {row.original.isTotal ? "Total:" : "Subtotal:"}{" "}
                            {cell.getValue() as ReactNode}
                          </td>
                        );
                      } else if (cell.column.id === "actions") {
                        return (
                          <td
                            key={cell.id}
                            className="border-l border-gray-300"
                          >
                            {renderCell(row, cell, cellIndex, isLastRow)}
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
                            isSorting ? "bg-gray-50" : "cursor-default"
                          } ${
                            row.id === editableRowId &&
                            cellIndex === editableCellIndex &&
                            !isSorting
                              ? "cell-highlight before:absolute before:inset-[-1px] before:border-[2px] before:border-gray-400 before:pointer-events-none before:z-10"
                              : ""
                          } ${
                            isFirstCell
                              ? "border-l-0"
                              : "border-l border-gray-300"
                          }
                          ${isLastCell ? "border-r-0" : ""}
                          ${
                            isLastRow
                              ? "border-b-0"
                              : "border-b border-gray-300"
                          } ${isLastCell && isLastRow ? "rounded-br-lg" : ""} ${
                            isFirstCell && isLastRow ? "rounded-bl-lg" : ""
                          }`}
                          onClick={() => handleCellClick(row.id, cellIndex)}
                          style={{
                            padding: "0",
                            boxSizing: "border-box",
                            width:
                              `${columnWidths[cell.column.id]}px` || "auto",
                          }}
                        >
                          {renderCell(row, cell, cellIndex, isLastRow)}
                        </td>
                      );
                    }
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* SDB */}
      {showDeleteButton && (
        <DeleteButton
          onDelete={handleDeleteSelected}
          selectedCount={selectedRows.size}
          isAllSelected={isAllSelectedGlobal}
          style={{
            marginRight: `${
              hasAmountColumn && hasNumberColumn ? "235px" : "128px"
            }`,
          }}
        />
      )}
      {hasAmountColumn && hasNumberColumn && (
        <button
          onClick={handleAddSubtotalRow}
          className={`absolute top-[-57px] right-0 mr-[128px] px-4 py-2 border border-gray-300 font-medium rounded-full ${
            canAddSubtotal && !isSorting
              ? "hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200"
              : "opacity-50 cursor-not-allowed"
          }`}
          disabled={!canAddSubtotal || isSorting}
        >
          Subtotal
        </button>
      )}
      {isLastPage && (
        <>
          <ToolTip
            content={"Klik untuk menambah baris baharu"}
            position="bottom"
            visible={isAddRowBarHovered}
          >
            <div
              ref={addRowBarRef}
              style={{
                width: `${tableWidth}px`,
                height: "16px",
                userSelect: "none",
                opacity:
                  isLastRowHovered || isAddRowBarHovered || isAddRowBarActive
                    ? 1
                    : 0,
                transition: "opacity 0.2s ease-in-out",
              }}
              className={`bg-gray-200 rounded-full hover:bg-gray-300 transition-colors duration-200 mt-1.5 flex items-center justify-center w-full hover:cursor-row-resize ${
                isAddRowBarActive ? "active-bg" : ""
              } 
          }`}
              onMouseDown={handleMouseDown}
              onClick={handleAddRow}
              onMouseEnter={() => setIsAddRowBarHovered(true)}
              onMouseLeave={() => setIsAddRowBarHovered(false)}
            ></div>
          </ToolTip>
          <style>{`
          .active-bg {
            background-color: rgba(156, 163, 175, 0.75); /* bg-gray-400/75 */
          }
          .active-bg:active {
            background-color: rgba(156, 163, 175, 0.75); /* bg-gray-400/75 */
          }
        `}</style>
        </>
      )}
      <div className="flex justify-between items-center mt-4 w-full">
        {data.length >= 10 && <TablePagination table={table} />}
      </div>
    </div>
  );
}

export default TableEditing;
