import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
  useCallback,
} from "react";
import {
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
  IconSquareMinusFilled,
  IconTrash,
} from "@tabler/icons-react";
import { ColumnType, TableProps, ColumnConfig } from "../../types/types";
import TableEditableCell from "./TableEditableCell";
import TableHeader from "./TableHeader";
import TablePagination from "./TablePagination";
import ToolTip from "../ToolTip";

interface TableSelection {
  selectedRows: Set<number>;
  hoveredRowIndex: number | null;
  isHeaderHovered: boolean;
}

// Type guard to check if a property exists on an object
function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  prop: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function TableEditing<T extends Record<string, any>>({
  ref,
  initialData,
  columns,
  onSelectionChange,
  onClearSelection,
  onChange,
  tableKey,
}: TableProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previousCellValues, setPreviousCellValues] = useState<{
    [key: string]: any;
  }>({});
  const [originalData, setOriginalData] = useState<T[]>(initialData);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isSorting, setIsSorting] = useState(false);
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
  // Selection related states (only used when tableKey is "invoice" or "consolidate")
  const [selection, setSelection] = useState<TableSelection>({
    selectedRows: new Set(),
    hoveredRowIndex: null,
    isHeaderHovered: false,
  });

  // Constants
  const isSortingDisabled = [
    "invoice",
    "invoiceJP",
    "orderDetails",
    "orderDetailsJP",
    "customerProducts",
    "einvoice-submit",
    "consolidate",
  ].includes(tableKey || "");

  const isSelectionEnabled = [
    "invoice",
    "invoiceJP",
    "consolidate",
    "einvoice-submit",
  ].includes(tableKey || "");

  React.useImperativeHandle(ref, () => ({
    selection,
    pageSelectionState,
    clearSelection: () => {
      setSelection((prev) => ({
        ...prev,
        selectedRows: new Set(),
      }));
    },
  }));

  // Get all indices (not just current page)
  const getAllRowIndices = () => {
    return Array.from({ length: data.length }, (_, i) => i);
  };

  // HSA
  const handleSelectAll = useCallback(() => {
    if (!isSelectionEnabled) return;

    const allIndices = getAllRowIndices();

    setSelection((prev) => {
      // If there are any selections (indeterminate or all selected), clear them
      if (prev.selectedRows.size > 0) {
        onSelectionChange?.(0, false, []); // Notify parent of cleared selection
        return { ...prev, selectedRows: new Set() };
      }

      // If nothing is selected, select all visible rows
      const newSelectedRows = new Set(allIndices);
      // Pass the actual filtered data to the parent
      const selectedData = Array.from(newSelectedRows).map(
        (index) => data[index]
      );
      onSelectionChange?.(newSelectedRows.size, true, selectedData);
      return { ...prev, selectedRows: newSelectedRows };
    });
  }, [isSelectionEnabled, data, onSelectionChange]);

  // Handle row selection
  const handleRowSelection = useCallback(
    (visibleIndex: number) => {
      if (!isSelectionEnabled) return;

      const actualIndex =
        pagination.pageIndex * pagination.pageSize + visibleIndex;
      setSelection((prev) => {
        const newSelectedRows = new Set(prev.selectedRows);
        if (newSelectedRows.has(actualIndex)) {
          newSelectedRows.delete(actualIndex);
        } else {
          newSelectedRows.add(actualIndex);
        }

        // Get the selected data
        const selectedData = Array.from(newSelectedRows).map(
          (index) => data[index]
        );
        onSelectionChange?.(newSelectedRows.size, false, selectedData);

        return { ...prev, selectedRows: newSelectedRows };
      });
    },
    [pagination, isSelectionEnabled, data, onSelectionChange]
  );

  const handleHeaderRowMouseEnter = useCallback(() => {
    setSelection((prev) => ({ ...prev, isHeaderHovered: true }));
  }, []);

  const handleHeaderRowMouseLeave = useCallback(() => {
    setSelection((prev) => ({ ...prev, isHeaderHovered: false }));
  }, []);

  const handleClearAllSelections = useCallback(() => {
    if (!isSelectionEnabled) return;

    setSelection((prev) => {
      onSelectionChange?.(0, false, []); // Notify parent of cleared selection
      return { ...prev, selectedRows: new Set() };
    });
  }, [isSelectionEnabled, onSelectionChange]);

  useEffect(() => {
    if (onClearSelection) {
      onClearSelection(handleClearAllSelections);
    }
  }, [handleClearAllSelections, onClearSelection]);

  // Update page selection state calculation for global selection
  const pageSelectionState = useMemo(() => {
    if (!isSelectionEnabled) {
      return { isAllSelected: false, isIndeterminate: false };
    }

    const allIndices = getAllRowIndices();
    const selectedCount = allIndices.filter((index) =>
      selection.selectedRows.has(index)
    ).length;

    return {
      isAllSelected:
        selectedCount === allIndices.length && allIndices.length > 0,
      isIndeterminate: selectedCount > 0 && selectedCount < allIndices.length,
    };
  }, [isSelectionEnabled, data.length, selection.selectedRows]);

  const renderSelectionColumn = () => {
    if (!isSelectionEnabled) return null;

    const visibleRows = table.getRowModel().rows;
    const { pageIndex, pageSize } = pagination;

    return (
      <div className="rounded-lg">
        <div className="flex flex-col">
          {/* Header checkbox - now controls global selection */}
          <div
            className="h-[49px] flex items-center justify-center"
            onMouseEnter={() =>
              setSelection((prev) => ({ ...prev, isHeaderHovered: true }))
            }
            onMouseLeave={() =>
              setSelection((prev) => ({ ...prev, isHeaderHovered: false }))
            }
          >
            <button
              onClick={handleSelectAll}
              className={`p-2 rounded-full transition-opacity duration-200 ${
                selection.isHeaderHovered ||
                pageSelectionState.isAllSelected ||
                pageSelectionState.isIndeterminate
                  ? "opacity-100"
                  : "opacity-0"
              } hover:bg-default-100 active:bg-default-200`}
            >
              {pageSelectionState.isAllSelected ? (
                <IconSquareCheckFilled
                  className="text-blue-600"
                  width={20}
                  height={20}
                />
              ) : pageSelectionState.isIndeterminate ? (
                <IconSquareMinusFilled
                  className="text-blue-600"
                  width={20}
                  height={20}
                />
              ) : (
                <IconSquare
                  className="text-default-400"
                  width={20}
                  height={20}
                />
              )}
            </button>
          </div>

          {/* Row checkboxes */}
          {visibleRows.map((row, index) => {
            const actualIndex = pageIndex * pageSize + index;
            const isVisible =
              selection.hoveredRowIndex === index ||
              selection.selectedRows.has(actualIndex);

            return (
              <div
                key={row.id}
                className="h-[49px] flex items-center justify-center"
                onMouseEnter={() =>
                  setSelection((prev) => ({ ...prev, hoveredRowIndex: index }))
                }
                onMouseLeave={() =>
                  setSelection((prev) => ({ ...prev, hoveredRowIndex: null }))
                }
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRowSelection(index);
                  }}
                  className={`p-2 rounded-full transition-opacity duration-200 ${
                    isVisible ? "opacity-100" : "opacity-0"
                  } hover:bg-default-100 active:bg-default-200`}
                >
                  {selection.selectedRows.has(actualIndex) ? (
                    <IconSquareCheckFilled
                      className="text-blue-600"
                      width={20}
                      height={20}
                    />
                  ) : (
                    <IconSquare
                      className="text-default-400"
                      width={20}
                      height={20}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Refs
  const addRowBarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLTableElement>(null);

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
    // Reset selection when data changes (like when filters are applied)
    setSelection((prev) => ({
      ...prev,
      selectedRows: new Set(),
    }));
    // Notify parent of cleared selection
    onSelectionChange?.(0, false, []);
  }, [data, onSelectionChange]);

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
    if (ref && "current" in ref && ref.current) {
      // Only update if values have actually changed
      if (
        ref.current.selection !== selection ||
        ref.current.pageSelectionState !== pageSelectionState
      ) {
        Object.assign(ref.current, {
          selection,
          pageSelectionState,
        });
      }
    }
  }, [selection, pageSelectionState]);

  const calculateAmount = useCallback((row: T): number => {
    const quantity = parseFloat(row.qty?.toString() || "0");
    const price = parseFloat(row.price?.toString() || "0");
    return quantity * price;
  }, []);

  const updateAmounts = useCallback(
    (currentData: T[]): T[] => {
      let total = 0;
      const updatedData = currentData.map((row) => {
        if (row.istotal) return row;
        if (row.issubtotal) return row;

        const amount = calculateAmount(row);
        total += amount;

        return {
          ...row,
        };
      });

      return updatedData;
    },
    [calculateAmount]
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
      (col) =>
        isEditableColumn(col) &&
        col.type !== "listbox" &&
        col.type !== "combobox"
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
      if (row.istotal) {
        rowIndex = (rowIndex + 1) % totalRows;
        colIndex = 0;
        continue;
      }

      const column = allColumns[colIndex];
      if (
        !row.issubtotal &&
        isEditableColumn(column) &&
        column.type !== "listbox" &&
        column.type !== "combobox"
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
        !sortedRows[currentRowIndex].original.istotal
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
      ...(tableKey === "focItems" && { isfoc: true }),
      ...(tableKey === "returnedGoods" && { isreturned: true }),
    } as T;

    setData((prevData) => {
      let newData = [...prevData];
      let totalRow: T | undefined;

      // Check if the last row is a Total row
      if (newData.length > 0 && newData[newData.length - 1].istotal) {
        totalRow = newData.pop();
      }

      // Add the new row
      newData.push(newRow);

      // If there was a Total row, add it back at the end
      if (totalRow) {
        newData.push(totalRow);
      }

      if (onChange) {
        onChange(newData);
      }
      return newData;
    });

    return true;
  }, [columns, onChange, tableKey]);

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

  // RS
  const recalculateSubtotals = useCallback(
    (currentData: T[]): T[] => {
      let currentSubtotal = 0;
      const recalculatedData: T[] = [];

      currentData.forEach((row, index) => {
        if (row.issubtotal) {
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

  // HDR
  const handleDeleteRow = useCallback(
    (rowIndex: number, event: React.MouseEvent) => {
      event.stopPropagation();

      setData((prevData) => {
        // Keep track of the total row
        const totalRow = prevData.find((row) => row.istotal);

        // Filter out the row to delete while maintaining original order
        const filteredData = prevData.filter((row, idx) => {
          if (row.istotal) return false; // Remove total row (we'll add it back)

          return idx !== rowIndex;
        });

        // Recalculate subtotals while maintaining order
        const recalculatedData = recalculateSubtotals(filteredData);

        if (onChange) {
          onChange(recalculatedData);
        }

        // Add back total row if it exists
        return totalRow ? [...recalculatedData, totalRow] : recalculatedData;
      });
    },
    [data, onChange, recalculateSubtotals]
  );

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

      // Show action column
      if (columnType === "action") {
        return (
          <div className="flex items-center justify-center h-full">
            <button
              className={`p-2 rounded-full text-default-500 hover:bg-default-200 active:bg-default-300 hover:text-default-600 ${
                isSorting ? "opacity-50 cursor-not-allowed" : ""
              }`}
              onClick={(event) => {
                if (!isSorting) {
                  handleDeleteRow(row.index, event);
                }
              }}
              disabled={isSorting}
              type="button"
            >
              <IconTrash stroke={2} width={20} height={20} />
            </button>
          </div>
        );
      }

      // Custom cell renderer
      if (columnConfig.cell) {
        return columnConfig.cell({
          getValue: () => cell.getValue(),
          row: { original: { ...row.original, isSorting } },
        });
      }

      if (
        [
          "number",
          "rate",
          "string",
          "float",
          "date",
          "listbox",
          "combobox",
        ].includes(columnType)
      ) {
        return (
          <TableEditableCell
            value={cell.getValue()}
            onChange={(val) => handleCellChange(row.index, cell.column.id, val)}
            type={columns[cellIndex].type}
            editable={!isSorting && isEditableColumn(columns[cellIndex])}
            focus={row.id === editableRowId && cellIndex === editableCellIndex}
            onKeyDown={(e) => handleKeyDown(e, row.id, cellIndex)}
            isSorting={isSorting}
            previousCellValue={cell.getValue()}
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
  const tableColumns: ColumnDef<T>[] = allColumns.map((col): ColumnDef<T> => {
    const commonHeaderContent = (column: any) => (
      <div
        className={`flex items-center w-full h-full ${
          ["number", "rate", "amount", "float"].includes(col.type)
            ? "justify-end"
            : ""
        } ${
          !isSortingDisabled
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
              setData((prevData) => prevData.filter((row) => !row.issubtotal));
            }
          }
        }}
      >
        {["number", "rate", "amount", "float"].includes(col.type) ? (
          <>
            {!isSortingDisabled && (
              <span className="mr-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-default-200 active:bg-default-300 duration-200 rounded-full">
                {getSortIcon(col.id, col.type, column.getIsSorted())}
              </span>
            )}
            <span className={`select-none ${!isSortingDisabled ? "pl-2" : ""}`}>
              {col.header}
            </span>
          </>
        ) : (
          <>
            <span className={`select-none ${!isSortingDisabled ? "pr-2" : ""}`}>
              {col.header}
            </span>
            {!isSortingDisabled && (
              <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-default-200 active:bg-default-300 duration-200 rounded-full">
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
          className={`relative flex items-center w-full h-full ${
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
                className={`p-2 rounded-full text-default-500 hover:bg-default-200 active:bg-default-300 hover:text-default-600 ${
                  isSorting ? "opacity-50 cursor-not-allowed" : ""
                }`}
                onClick={(event) => {
                  if (!isSorting) {
                    handleDeleteRow(info.row.index, event);
                  }
                }}
                disabled={isSorting}
                type="button"
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
            if (hasProperty(row, col.id)) {
              return row[col.id];
            }
            return calculateAmount(row).toFixed(2);
          },
          cell: (info) => {
            const value = info.getValue();
            return (
              <div className="px-6 py-3 text-right">
                {typeof value === "number" ? value.toFixed(2) : String(value)}
              </div>
            );
          },
          sortingFn: isSortingDisabled
            ? undefined
            : (rowA, rowB, columnId) => {
                if (rowA.original.issubtotal && rowB.original.issubtotal) {
                  return rowA.index - rowB.index;
                }
                if (rowA.original.issubtotal) return 1;
                if (rowB.original.issubtotal) return -1;

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
          accessorFn: (row: T) =>
            hasProperty(row, col.id) ? row[col.id] : undefined,
          cell: (info) => {
            return commonCellContent(info);
          },
          sortingFn: isSortingDisabled
            ? undefined
            : (rowA, rowB, columnId) => {
                if (rowA.original.istotal) return 1;
                if (rowB.original.istotal) return -1;
                if (rowA.original.issubtotal && rowB.original.issubtotal) {
                  return rowA.index - rowB.index;
                }
                if (rowA.original.issubtotal) return 1;
                if (rowB.original.issubtotal) return -1;

                const a = rowA.getValue(columnId);
                const b = rowB.getValue(columnId);

                if (typeof a === "number" && typeof b === "number") {
                  return a - b;
                }
                return (a?.toString() ?? "").localeCompare(b?.toString() ?? "");
              },
        } as ColumnDef<T>;
    }
  });

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
            setData((prevData) => prevData.filter((row) => !row.issubtotal));
          } else {
            setData((prevData) => {
              const recalculatedData = originalData.map((row) => {
                if (!row.issubtotal) {
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

  //HCC
  const handleCellClick = useCallback(
    (rowId: string | undefined, cellIndex: number) => {
      if (isSorting || !rowId) return;

      const row = table.getRowModel().rows.find((r) => r.id === rowId);
      if (!row || row.original.istotal || row.original.isSubtotalQty) return;

      const column = columns[cellIndex];
      const isEditableRegularRow =
        !row.original.issubtotal && isEditableColumn(column);

      if (isEditableRegularRow) {
        setEditableRowId(rowId);
        setEditableCellIndex(cellIndex);
        setSelectedRowId(rowId);
        setPreviousCellValues((prev) => ({
          ...prev,
          [`${rowId}-${column.id}`]: row.original[column.id],
        }));
      }
    },
    [isSorting, columns, table]
  );

  // HCC
  const handleCellChange = useCallback(
    (rowIndex: number, columnId: string, value: any) => {
      setData((prevData) => {
        const updatedData = prevData.map((row, index) => {
          if (index === rowIndex) {
            const updatedRow = { ...row, [columnId]: value };
            if (columnId === "qty" || columnId === "price") {
              const newAmount = calculateAmount(updatedRow);
              return {
                ...updatedRow,
                total: newAmount.toFixed(2),
              };
            }
            return updatedRow;
          }
          return row;
        });

        const recalculatedData = updateAmounts(updatedData);

        if (onChange) {
          onChange(recalculatedData);
        }

        return recalculatedData;
      });

      if (sorting.some((sort) => sort.id === columnId)) {
        table.setSorting([...sorting]);
      }
    },
    [onChange, sorting, calculateAmount, updateAmounts, table]
  );

  const isLastPage = table.getCanNextPage() === false;

  return (
    <div ref={tableRef} className="flex flex-col items-center w-auto">
      <div className="flex gap-2">
        {/* Separate Selection Column */}
        {isSelectionEnabled && renderSelectionColumn()}

        {/* Main Table */}
        <div className="rounded-lg border border-default-300 w-fit">
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
                  isSortableColumn={isSortableColumn}
                  columnWidths={columnWidths}
                  onColumnResize={handleColumnResize}
                  onHeaderRowMouseEnter={handleHeaderRowMouseEnter}
                  onHeaderRowMouseLeave={handleHeaderRowMouseLeave}
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
                      tableKey === "invoice" ? "group" : ""
                    } ${
                      isLastRow
                        ? "border-b-0 rounded-b-lg"
                        : "border-b border-default-300"
                    } ${row.id === selectedRowId ? "shadow-top-bottom" : ""}
                     ${row.id === editableRowId ? "relative z-10" : ""}}`}
                    onClick={() =>
                      row.original.issubtotal || row.original.istotal
                        ? setSelectedRowId(row.id)
                        : null
                    }
                    onMouseEnter={() => {
                      if (isSelectionEnabled) {
                        setSelection((prev) => ({
                          ...prev,
                          hoveredRowIndex: rowIndex,
                        }));
                      }
                    }}
                    onMouseLeave={() => {
                      if (isSelectionEnabled) {
                        setSelection((prev) => ({
                          ...prev,
                          hoveredRowIndex: null,
                        }));
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      const isLastRow =
                        rowIndex === table.getRowModel().rows.length - 1;
                      const isFirstCell = cellIndex === 0;
                      const isLastCell =
                        cellIndex === row.getVisibleCells().length - 1;
                      if (row.original.istotal || row.original.issubtotal) {
                        if (
                          cell.column.id ===
                          columns.find((col) => col.type === "amount")?.id
                        ) {
                          if (row.original.istotal) {
                            // Get the subtotal (before rounding)
                            const subtotal = parseFloat(
                              row.original.amount || 0
                            );
                            // Get current rounding value
                            const currentRounding = parseFloat(
                              row.original.rounding || 0
                            );

                            return (
                              <td
                                key={cell.id}
                                colSpan={columns.length - 2}
                                className="py-3 pr-6 font-semibold"
                              >
                                <div className="flex justify-end items-center">
                                  <span className="text-sm text-default-400">
                                    Rounding:
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={currentRounding.toFixed(2)}
                                    onChange={(e) => {
                                      // Parse the value and restrict to 2 decimal places
                                      let value = e.target.value;
                                      // If user enters more than 2 decimal places, truncate it
                                      if (
                                        value.includes(".") &&
                                        value.split(".")[1].length > 2
                                      ) {
                                        value = parseFloat(value).toFixed(2);
                                      }

                                      const roundingValue =
                                        parseFloat(value) || 0;

                                      // Update the rounding value and recalculate total
                                      setData((prevData) => {
                                        const updatedData = prevData.map(
                                          (dataRow) => {
                                            if (dataRow.istotal) {
                                              // Calculate new total = subtotal + rounding
                                              const newTotal =
                                                subtotal + roundingValue;

                                              return {
                                                ...dataRow,
                                                rounding: roundingValue,
                                                totalamountpayable: newTotal,
                                                // Also update the cell value for display
                                                [cell.column.id]:
                                                  newTotal.toFixed(2),
                                              };
                                            }
                                            return dataRow;
                                          }
                                        );

                                        // Call the onChange prop to ensure parent component is updated
                                        if (onChange) {
                                          onChange(updatedData);
                                        }

                                        return updatedData;
                                      });
                                    }}
                                    className="w-10 py-1 bg-transparent border-none text-center text-sm text-default-400"
                                  />
                                </div>
                              </td>
                            );
                          } else {
                            // For subtotal rows, keep behavior the same
                            return (
                              <td
                                key={cell.id}
                                colSpan={columns.length - 1}
                                className="py-3 pr-6 text-right font-semibold"
                              >
                                Subtotal: {cell.getValue() as ReactNode}
                              </td>
                            );
                          }
                        } else if (
                          cell.column.id === columns[columns.length - 1].id &&
                          !row.original.istotal
                        ) {
                          // Keep the behavior for the last cell of subtotal rows
                          return (
                            <td
                              key={cell.id}
                              className="border-l border-default-300"
                            >
                              {renderCell(row, cell, cellIndex, isLastRow)}
                            </td>
                          );
                        } else if (
                          cell.column.id === columns[columns.length - 1].id &&
                          row.original.istotal
                        ) {
                          // Explicitly calculate and display the total amount
                          const subtotal = parseFloat(row.original.amount || 0);
                          const roundingValue = parseFloat(
                            row.original.rounding || 0
                          );

                          return (
                            <td
                              key={cell.id}
                              className="py-3 pr-6 text-right font-semibold rounded-br-lg"
                              colSpan={1}
                            >
                              Total: {row.original.total}
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
                              isSorting ? "bg-default-50" : "cursor-default"
                            } ${
                              row.id === editableRowId &&
                              cellIndex === editableCellIndex &&
                              !isSorting
                                ? "cell-highlight before:absolute before:inset-[-1px] before:border-[2px] before:border-default-400 before:pointer-events-none before:z-10"
                                : ""
                            } ${
                              isFirstCell
                                ? "border-l-0"
                                : "border-l border-default-300"
                            }
                          ${isLastCell ? "border-r-0" : ""}
                          ${
                            isLastRow
                              ? "border-b-0"
                              : "border-b border-default-300"
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
      </div>
      {isLastPage && !isSelectionEnabled && (
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
              className={`bg-default-200 rounded-full hover:bg-default-300 transition-colors duration-200 mt-1.5 flex items-center justify-center w-full hover:cursor-row-resize ${
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
            background-color: rgba(156, 163, 175, 0.75); /* bg-default-400/75 */
          }
          .active-bg:active {
            background-color: rgba(156, 163, 175, 0.75); /* bg-default-400/75 */
          }
        `}</style>
        </>
      )}
      <div className="flex justify-between items-center mt-4 w-full">
        {isSelectionEnabled && <div className="w-[48px]"></div>}
        {data.length >= 10 && <TablePagination table={table} />}
      </div>
    </div>
  );
}

export default TableEditing;
