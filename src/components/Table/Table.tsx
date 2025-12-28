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
  IconEdit,
  IconSortAscendingLetters,
  IconSortAscendingNumbers,
  IconSortDescendingLetters,
  IconSortDescendingNumbers,
  IconSquare,
  IconSquareCheckFilled,
} from "@tabler/icons-react";
import { ColumnType, TableProps, ColumnConfig } from "../../types/types";
import TableEditableCell from "./TableEditableCell";
import DeleteButton from "./DeleteButton";
import TableHeader from "./TableHeader";
import TablePagination from "./TablePagination";
import ToolTip from "../ToolTip";

function Table<T extends Record<string, any>>({
  initialData,
  columns,
  onShowDeleteButton,
  onDelete,
  onChange,
  isEditing,
  onToggleEditing,
  onSave,
  onCancel,
  tableKey,
}: TableProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [editingData, setEditingData] = useState<T[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previousCellValues, setPreviousCellValues] = useState<{
    [key: string]: any;
  }>({});
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isSorting, setIsSorting] = useState(false);
  const [isAllSelectedGlobal, setIsAllSelectedGlobal] = useState(false);
  const [isIndeterminateGlobal, setIsIndeterminateGlobal] = useState(false);
  const [tableWidth, setTableWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [rowsToAddOrRemove, setRowsToAddOrRemove] = useState(0);
  const addRowBarRef = useRef<HTMLDivElement>(null);
  const initialDragY = useRef(0);
  const [isLastRowHovered, setIsLastRowHovered] = useState(false);
  const [isAddRowBarHovered, setIsAddRowBarHovered] = useState(false);
  const [isAddRowBarActive, setIsAddRowBarActive] = useState(false);
  const [removableRowsAbove, setRemovableRowsAbove] = useState(0);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    Object.fromEntries(columns.map((col) => [col.id, col.width || 200]))
  );
  const tableRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLTableElement>(null);
  const isSortingDisabled = [
    "orderDetails",
  ].includes(tableKey || "");

  const DRAG_THRESHOLD = 38; // Pixels to drag before adding/removing a row

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

  const disableAddRowBar = tableKey === "catalogueProduct";
  const isCatalogueProduct = tableKey === "catalogueProduct";

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
    if (!isEditing) {
      setData(initialData);
    }
  }, [initialData, isEditing]);

  useEffect(() => {
    if (isEditing) {
      setEditingData([...data]);
    }
  }, [isEditing, data]);

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
    setData((prevData) =>
      prevData.map((row) => {
        if (!row.isSubtotal) {
          return { ...row };
        }
        return row;
      })
    );
  }, []);

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
  }, [isEditing]);

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
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      const sortedRows = table.getRowModel().rows;
      const currentRowIndex = sortedRows.findIndex((row) => row.id === rowId);
      const isLastPage = !table.getCanNextPage();
      const isLastRow = currentRowIndex === sortedRows.length - 1;
      const isLastColumn = cellIndex === allColumns.length - 1;

      const findNextEditableCell = (
        startRowIndex: number,
        startColIndex: number,
        moveToNextRow: boolean
      ): { rowIndex: number; colIndex: number } => {
        let rowIndex = startRowIndex;
        let colIndex = startColIndex;

        const totalRows = sortedRows.length;
        const editableColumns = allColumns.filter(
          (col) => isEditableColumn(col) && col.type !== "listbox"
        );
        const totalEditableCols = editableColumns.length;

        if (moveToNextRow) {
          rowIndex = (rowIndex + 1) % totalRows;
          colIndex = editableColumns[0].id
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

          const column = allColumns[colIndex];
          if (
            !sortedRows[rowIndex].original.isSubtotal &&
            isEditableColumn(column) &&
            column.type !== "listbox"
          ) {
            return {
              rowIndex,
              colIndex,
            };
          }

          colIndex++;
        }

        // If we've cycled through all cells and found nothing, return to the first editable cell
        const firstEditableColIndex = allColumns.findIndex(isEditableColumn);
        return {
          rowIndex: 0,
          colIndex: firstEditableColIndex,
        };
      };

      const moveToNextRow = e.key === "Enter" && isLastColumn;

      if (e.key === "Enter" && isLastColumn && isLastRow && isLastPage) {
        // Add new row only on the last page
        handleAddRow();
        setTimeout(() => {
          const newRows = table.getRowModel().rows;
          const newRowId = newRows[newRows.length - 1].id;
          setSelectedRowId(newRowId);
          setEditableRowId(newRowId);
          setEditableCellIndex(allColumns.findIndex(isEditableColumn));
        }, 10);
      } else if (e.key === "Tab" && isLastColumn && isLastRow && isLastPage) {
        // Loop back to the first cell on the first page
        table.setPageIndex(0);
        setTimeout(() => {
          const newRows = table.getRowModel().rows;
          const newRowId = newRows[0].id;
          setSelectedRowId(newRowId);
          setEditableRowId(newRowId);
          setEditableCellIndex(allColumns.findIndex(isEditableColumn));
        }, 10);
      } else if (
        (e.key === "Enter" || e.key === "Tab") &&
        isLastColumn &&
        isLastRow
      ) {
        // Move to the next page
        table.nextPage();
        setTimeout(() => {
          const newRows = table.getRowModel().rows;
          const newRowId = newRows[0].id;
          setSelectedRowId(newRowId);
          setEditableRowId(newRowId);
          setEditableCellIndex(allColumns.findIndex(isEditableColumn));
        }, 10);
      } else {
        const { rowIndex: nextRowIndex, colIndex: nextColIndex } =
          findNextEditableCell(currentRowIndex, cellIndex, moveToNextRow);

        const nextRowId = sortedRows[nextRowIndex].id;
        setSelectedRowId(nextRowId);
        setEditableRowId(nextRowId);
        setEditableCellIndex(nextColIndex);
      }
    }
  };

  const isRowEmpty = useCallback((row: T) => {
    return Object.entries(row).every(([key, value]) => {
      if (key === "id" || key === "isSubtotal") return true;
      return (
        value === "" ||
        value === 0 ||
        value === false ||
        value === null ||
        value === undefined
      );
    });
  }, []);

  const updateRemovableRowsAbove = useCallback(() => {
    let count = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (isRowEmpty(data[i])) {
        count++;
      } else {
        break;
      }
    }
    setRemovableRowsAbove(count);
  }, [data, isRowEmpty]);

  useEffect(() => {
    updateRemovableRowsAbove();
  }, [data, updateRemovableRowsAbove]);

  // HRER
  const handleRemoveEmptyRow = useCallback(() => {
    setData((prevData) => {
      const lastRow = prevData[prevData.length - 1];
      if (lastRow && isRowEmpty(lastRow)) {
        const newData = prevData.slice(0, -1);
        if (onChange) {
          onChange(newData);
        }

        return newData;
      }
      return prevData;
    });
  }, [onChange, isRowEmpty]);

  // HMD
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disableAddRowBar) return;
      e.preventDefault();
      setIsDragging(true);
      setIsAddRowBarActive(true);
      setRowsToAddOrRemove(0);
      initialDragY.current = e.clientY;
    },
    [disableAddRowBar]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsAddRowBarActive(false);
    setRowsToAddOrRemove(0);
    if (addRowBarRef.current) {
      addRowBarRef.current.style.top = "0px";
    }
    updateRemovableRowsAbove();
  }, [updateRemovableRowsAbove]);

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
  }, [
    selectedRows,
    onDelete,
    data.length,
    pagination.pageSize,
    pagination.pageIndex,
  ]);

  const checkboxColumn: ColumnConfig = useMemo(
    () => ({
      id: "selection",
      header: "",
      type: "selection",
      width: 10,
    }),
    [] // No dependencies since this object is static
  );

  // HC
  const handleCancel = useCallback(() => {
    setEditingData([]);
    setSelectedRows(new Set());
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  // HS
  const handleSave = useCallback(() => {
    setData(editingData);
    setEditingData([]);
    setSelectedRows(new Set());
    if (onSave) {
      onSave();
    }
  }, [editingData, onSave]);

  const allColumns = useMemo(
    () => (isEditing ? [checkboxColumn, ...columns] : columns),
    [columns, isEditing, checkboxColumn]
  );

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

      if (columnType === "selection") {
        return (
          <div className="flex items-center justify-center h-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRowSelection(row);
              }}
              className="p-2 rounded-full hover:bg-default-200 active:bg-default-300 transition-colors duration-200"
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
                  className="text-default-400"
                />
              )}
            </button>
          </div>
        );
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
          {renderCellContent()}
        </div>
      );
    }

    return renderCellContent();
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
          isSortingDisabled
            ? ["number", "rate", "amount", "float"].includes(col.type)
              ? "pl-2"
              : "pr-2"
            : "group cursor-pointer"
        }`}
        onClick={() => {
          if (!isSortingDisabled && isSortableColumn(column.id)) {
            column.toggleSorting();
            const newIsSorted = column.getIsSorted();
            setIsSorting(newIsSorted !== false);
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
            <span className={`select-none ${isSortingDisabled ? "pl-2" : ""}`}>
              {col.header}
            </span>
          </>
        ) : (
          <>
            <span className={`select-none ${isSortingDisabled ? "pr-2" : ""}`}>
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
          className={`relative flex items-center h-full ${
            isSortingDisabled ? "py-2" : ""
          }`}
        >
          {commonHeaderContent(column)}
        </div>
      ),
    };

    switch (col.type) {
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
          accessorFn: (row: T) => row[col.id as keyof T] as string,
          cell: (info) => {
            const row = info.row.original as T & {
              isTotal?: boolean;
              isSubtotal?: boolean;
            };
            if (row.isTotal || row.isSubtotal) {
              if (col.type === "amount") {
                return (
                  <>
                    <td
                      colSpan={columns.length - 1}
                      className="py-3 pr-6 text-right font-semibold border-t border-b"
                    >
                      {row.isTotal ? "Total:" : "Subtotal:"}
                    </td>
                    <td className="py-3 pr-6 text-right font-semibold border-t border-b">
                      {info.getValue() as React.ReactNode}
                    </td>
                  </>
                );
              }
              return null;
            }
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
        },
  });

  // HAR
  const handleAddRow = useCallback(() => {
    if (disableAddRowBar) return false;
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
      const newData = [...prevData, newRow];
      if (onChange) {
        onChange(newData);
      }

      // Calculate the correct page index for the new row
      const currentLastItemIndex =
        (pagination.pageIndex + 1) * pagination.pageSize;

      // If the current page is full, move to the next page
      if (currentLastItemIndex === prevData.length) {
        table.nextPage();
      }

      return newData;
    });

    return true;
  }, [columns, onChange, pagination, disableAddRowBar, table]);

  // UR
  const updateRows = useCallback(() => {
    if (rowsToAddOrRemove > 0) {
      handleAddRow();
      setRowsToAddOrRemove((prev) => prev - 1);
    } else if (rowsToAddOrRemove < 0 && removableRowsAbove > 0) {
      handleRemoveEmptyRow();
      setRowsToAddOrRemove((prev) => prev + 1);
      setRemovableRowsAbove((prev) => prev - 1);
    }

    if (rowsToAddOrRemove !== 0) {
      requestAnimationFrame(updateRows);
    }
  }, [
    rowsToAddOrRemove,
    handleAddRow,
    handleRemoveEmptyRow,
    removableRowsAbove,
  ]);

  // HMM
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const currentY = e.clientY;
      const mouseDelta = currentY - initialDragY.current;

      // Update the bar position
      if (addRowBarRef.current) {
        addRowBarRef.current.style.top = `${mouseDelta}px`;
      }

      // Check if we're on the last page and it's not full
      const isLastPage = !table.getCanNextPage();
      const isLastPageNotFull =
        isLastPage && data.length % pagination.pageSize !== 0;

      // Calculate rows to add or remove
      const newRowsToAddOrRemove = Math.floor(mouseDelta / DRAG_THRESHOLD);

      // Only allow adding rows if we're on the last page and it's not full
      if (newRowsToAddOrRemove > 0 && !isLastPageNotFull) {
        return;
      }

      setRowsToAddOrRemove(newRowsToAddOrRemove);

      // Immediately add or remove rows
      if (newRowsToAddOrRemove > 0 && isLastPageNotFull) {
        handleAddRow();
        initialDragY.current += DRAG_THRESHOLD;
      } else if (newRowsToAddOrRemove < 0 && removableRowsAbove > 0) {
        handleRemoveEmptyRow();
        initialDragY.current -= DRAG_THRESHOLD;
      }
    },
    [
      table,
      isDragging,
      removableRowsAbove,
      handleAddRow,
      handleRemoveEmptyRow,
      data.length,
      pagination,
    ]
  );

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      updateRows();
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, updateRows]);

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
    [onChange, sorting, table]
  );

  //HCC
  const handleCellClick = useCallback(
    (rowId: string | undefined, cellIndex: number) => {
      if (isSorting || !rowId) return;

      const row = table.getRowModel().rows.find((r) => r.id === rowId);
      if (!row || row.original.isSubtotal || row.original.isTotal) return;

      const filteredCellIndex = isEditing ? cellIndex - 1 : cellIndex;
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
    [isSorting, columns, isEditing, table]
  );

  // USS
  const updateSelectionState = useCallback(
    (selectedRows: Set<number>) => {
      const allRowsCount = data.filter((row) => !row.isSubtotal).length;
      const isAllSelected = selectedRows.size === allRowsCount;
      const isIndeterminate = selectedRows.size > 0 && !isAllSelected;

      setIsAllSelectedGlobal(isAllSelected);
      setIsIndeterminateGlobal(isIndeterminate);

      setShowDeleteButton(selectedRows.size > 0);
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
                isEditing={isEditing ?? false}
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
                      : "border-b border-default-300"
                  } ${row.id === selectedRowId ? "shadow-top-bottom" : ""}
                  ${
                    selectedRows.has(row.original.id)
                      ? "bg-blue-50 hover:bg-blue-50"
                      : "hover:bg-default-100"
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
                    if (row.original.isTotal || row.original.isSubtotal) {
                      if (cell.column.id === "selection") {
                        return (
                          <td
                            key={cell.id}
                            className="border-r border-default-300"
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
                            className={`py-3 pr-6 text-right font-semibold`}
                          >
                            {row.original.isTotal ? "Total:" : "Subtotal:"}{" "}
                            {cell.getValue() as ReactNode}
                          </td>
                        );
                      } else if (cell.column.id === "actions") {
                        return (
                          <td
                            key={cell.id}
                            className="border-l border-default-300"
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
      {/* SDB */}
      {showDeleteButton && isEditing && (
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
      {isEditing && isLastPage && (
        <>
          <ToolTip
            content={
              isCatalogueProduct
                ? 'Sila tambah produk baharu dalam halaman "Job".'
                : "Klik untuk menambah baris baharu\nSeret untuk menambah atau mengalih keluar baris"
            }
            position="bottom"
            visible={isAddRowBarHovered && !isDragging}
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
              onClick={disableAddRowBar ? undefined : handleAddRow}
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
        {data.length >= 10 && <TablePagination table={table} />}
      </div>
    </div>
  );
}

export default Table;
