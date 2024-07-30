import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
  useCallback,
} from "react";
import {
  createColumnHelper,
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
import "react-datepicker/dist/react-datepicker.css";
import {
  IconArrowsSort,
  IconCancel,
  IconDeviceFloppy,
  IconEdit,
  IconSortAscendingLetters,
  IconSortAscendingNumbers,
  IconSortDescendingLetters,
  IconSortDescendingNumbers,
  IconSquare,
  IconSquareCheckFilled,
  IconTrash,
} from "@tabler/icons-react";
import { ColumnType, TableProps, ColumnConfig } from "../types/types";
import TableEditableCell from "./TableEditableCell";
import DeleteButton from "./DeleteButton";
import TableHeader from "./TableHeader";
import TablePagination from "./TablePagination";
import { setTime } from "react-datepicker/dist/date_utils";

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
}: TableProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previousCellValues, setPreviousCellValues] = useState<{
    [key: string]: any;
  }>({});
  const [originalData, setOriginalData] = useState<T[]>(initialData);
  const [editingData, setEditingData] = useState<T[]>([]);
  const [canAddSubtotal, setCanAddSubtotal] = useState(true);
  const [selectedRowForSubtotal, setSelectedRowForSubtotal] = useState<
    string | null
  >(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<{
    index: number;
    id: string;
  } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isSorting, setIsSorting] = useState(false);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [isIndeterminate, setIsIndeterminate] = useState(false);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLTableElement>(null);

  const DRAG_THRESHOLD = 38; // Pixels to drag before adding/removing a row

  const tableData = useMemo(
    () => (isEditing ? editingData : data),
    [isEditing, editingData, data]
  );

  // Recalculate total pages when tableData changes
  const totalPages = useMemo(
    () => Math.ceil(data.length / itemsPerPage),
    [data.length, itemsPerPage]
  );

  // Get current page's data
  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return tableData.slice(startIndex, endIndex);
  }, [currentPage, itemsPerPage, tableData]);

  const columnWidths: { [k: string]: number } = Object.fromEntries(
    columns.map((col) => [col.id, col.width || 200])
  );

  const isEditableColumn = (col: ColumnConfig) => {
    return !["selection", "readonly", "action", "amount", "checkbox"].includes(
      col.type
    );
  };

  // Update currentPage if it's greater than totalPages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
    setCanAddSubtotal(hasAmountValuesAfterLastSubtotal(data));
  }, [data]);

  useEffect(() => {
    setData((prevData) =>
      recalculateSubtotals(
        prevData.map((row) => {
          if (!row.isSubtotal) {
            return { ...row };
          }
          return row;
        })
      )
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

  useEffect(() => {
    if (isEditing) {
      setOriginalData([...initialData]);
    }
  }, [isEditing, initialData]);

  //HCC
  const handleCellClick = useCallback(
    (rowId: string | undefined, cellIndex: number) => {
      if (isSorting || !rowId) return;

      const row = table.getRowModel().rows.find((r) => r.id === rowId);
      if (!row || row.original.isSubtotal) return;

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

      const findNextEditableCell = (
        startRowIndex: number,
        startColIndex: number
      ): { rowIndex: number; colIndex: number } => {
        let rowIndex = startRowIndex;
        let colIndex = startColIndex;

        const totalRows = sortedRows.length;
        const editableColumns = allColumns.filter(isEditableColumn);
        const totalEditableCols = editableColumns.length;

        for (let i = 0; i < totalRows * totalEditableCols; i++) {
          colIndex++;
          if (colIndex >= allColumns.length) {
            colIndex = 0;
            rowIndex = (rowIndex + 1) % totalRows;
          }

          const column = allColumns[colIndex];
          if (
            !sortedRows[rowIndex].original.isSubtotal &&
            isEditableColumn(column)
          ) {
            return {
              rowIndex,
              colIndex,
            };
          }
        }

        // If we've cycled through all cells and found nothing, return to the first editable cell
        const firstEditableColIndex = allColumns.findIndex(isEditableColumn);
        return {
          rowIndex: 0,
          colIndex: firstEditableColIndex,
        };
      };

      const { rowIndex: nextRowIndex, colIndex: nextColIndex } =
        findNextEditableCell(currentRowIndex, cellIndex);
      if (
        e.key === "Enter" &&
        // Check if next row exists
        nextRowIndex === 0 &&
        currentRowIndex === sortedRows.length - 1
      ) {
        handleAddRow();
        setTimeout(() => {
          const newRows = table.getRowModel().rows;
          const newRowId = newRows[newRows.length - 1].id;
          setSelectedRowId(newRowId);
          setEditableRowId(newRowId);
          setEditableCellIndex(allColumns.findIndex(isEditableColumn));
        }, 10);
      } else {
        const nextRowId = sortedRows[nextRowIndex].id;
        setSelectedRowId(nextRowId);
        setEditableRowId(nextRowId);
        setEditableCellIndex(nextColIndex);
      }
    }
  };

  // HAR
  const handleAddRow = useCallback(() => {
    const newRow = {
      id: Math.random().toString(36).substr(2, 9),
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
      const newPageIndex = Math.floor(data.length / pagination.pageSize);
      const currentLastItemIndex =
        (pagination.pageIndex + 1) * pagination.pageSize;

      // If the current page is full, move to the next page
      if (currentLastItemIndex === prevData.length) {
        setTimeout(() => {
          setPagination((prev) => ({
            ...prev,
            pageIndex: newPageIndex + 1,
          }));
          table.nextPage();
        }, 0);
      }

      return newData;
    });

    return true;
  }, [columns, onChange, pagination]);

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

  const handleItemsPerPageChange = useCallback((newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

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

        // Check if we need to go back to the previous page
        const totalPages = Math.ceil(newData.length / itemsPerPage);
        if (currentPage > totalPages) {
          setCurrentPage(totalPages);
        }

        return newData;
      }
      return prevData;
    });
  }, [onChange, isRowEmpty, currentPage, itemsPerPage]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    setIsAddRowBarActive(true);
    setRowsToAddOrRemove(0);
    initialDragY.current = e.clientY;
  }, []);

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
      const isLastPageNotFull =
        currentPage === Math.ceil(data.length / itemsPerPage) &&
        data.length % itemsPerPage !== 0;

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
      isDragging,
      removableRowsAbove,
      handleAddRow,
      handleRemoveEmptyRow,
      currentPage,
      totalPages,
      data.length,
      itemsPerPage,
    ]
  );

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

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsAddRowBarActive(false);
    setRowsToAddOrRemove(0);
    if (addRowBarRef.current) {
      addRowBarRef.current.style.top = "0px";
    }
    updateRemovableRowsAbove();
  }, [updateRemovableRowsAbove]);

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
  const recalculateSubtotals = (currentData: T[]): T[] => {
    let currentSubtotal = 0;

    return currentData.map((row, index) => {
      if (row.isSubtotal) {
        const subtotalAmount = currentSubtotal.toFixed(2);
        currentSubtotal = 0;
        return {
          ...row,
          id: row.id || `subtotal-${Math.random().toString(36).substr(2, 9)}`, // Preserve existing ID or create a new one
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
    if (rowToDelete && rowToDelete.id) {
      try {
        const response = await fetch(
          `http://localhost:5000/api/jobs/${rowToDelete.id}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          throw new Error("Failed to delete job from the database");
        }
      } catch (error) {
        console.error("Error deleting job:", error);
        // Handle error (e.g., show error message to user)
        return;
      }
    }

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

  // HRS
  const handleRowSelection = useCallback((row: Row<T>) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(row.id)) {
        newSet.delete(row.id);
        setSelectedRowForSubtotal(null);
      } else {
        if (newSet.size === 0) {
          setSelectedRowForSubtotal(row.id);
        } else {
          setSelectedRowForSubtotal(null);
        }
        newSet.add(row.id);
      }

      updateSelectionState(newSet);
      return newSet;
    });
  }, []);

  // HDS
  const handleDeleteSelected = async () => {
    const selectedIds = Array.from(selectedRows);
    await onDelete(selectedIds);
    setSelectedRows(new Set());
    // Refresh data or update local state as needed
  };

  useEffect(() => {
    updateSelectionState(selectedRows);
  }, [selectedRows, data]);

  const columnHelper = createColumnHelper<T>();

  const checkboxColumn: ColumnConfig = {
    id: "selection",
    header: "",
    type: "selection",
    width: 10,
  };

  // HC
  const handleCancel = useCallback(() => {
    setEditingData([]);
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  // HS
  const handleSave = useCallback(() => {
    setData(editingData);
    setEditingData([]);
    if (onSave) {
      onSave();
    }
  }, [editingData, onSave]);

  const allColumns = useMemo(
    () => (isEditing ? [checkboxColumn, ...columns] : columns),
    [columns, isEditing]
  );

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
        isEditableColumn(columnConfig);

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
              {isAllSelected ? (
                <IconSquareCheckFilled
                  width={20}
                  height={20}
                  className="text-blue-600"
                />
              ) : selectedRows.has(row.id) ? (
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

      if (row.original.isSubtotal) {
        if (columnType === "amount") {
          return (
            <React.Fragment>
              <td
                colSpan={columns.length - 1}
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

      if (["number", "rate", "string", "float", "date"].includes(columnType)) {
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
            isSorting={isSorting}
            previousCellValue={amount}
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
  const tableColumns: ColumnDef<T>[] = useMemo(
    () =>
      allColumns.map((col): ColumnDef<T> => {
        // CHC

        const commonHeaderContent = (column: any) => (
          <div
            className={`flex items-center group cursor-pointer w-full h-full ${
              ["number", "rate", "amount", "float"].includes(col.type)
                ? "justify-end"
                : ""
            }`}
            onClick={() => {
              if (isSortableColumn(column.id)) {
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
                <span
                  className={`mr-2 ${
                    column.getIsSorted()
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  } transition-opacity p-2 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 rounded-full`}
                >
                  {getSortIcon(col.id, col.type, column.getIsSorted())}
                </span>
                <span className="select-none">{col.header}</span>
              </>
            ) : (
              <>
                <span className="select-none">{col.header}</span>
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
              isSorting={isSorting}
              previousCellValue={info.getValue()}
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
            });
          case "readonly":
          case "amount":
            return columnHelper.accessor(
              (row: T) => {
                const amountValue = row[col.id as keyof T];
                return typeof amountValue === "number" ||
                  typeof amountValue === "string"
                  ? amountValue
                  : 0;
              },
              {
                id: col.id,
                header: ({ column }) => commonHeaderContent(column),
                cell: (info) => {
                  const value = info.getValue();
                  return (
                    <div className="px-6 py-3 text-right">
                      {typeof value === "number" ? value.toFixed(2) : "0.00"}
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

                  return (a?.toString() ?? "").localeCompare(
                    b?.toString() ?? ""
                  );
                },
              }
            ) as ColumnDef<T>;
          case "checkbox":
            return columnHelper.accessor((row: T) => row[col.id as keyof T], {
              id: col.id,
              header: col.header,
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
            }) as ColumnDef<T>;
          default:
            return columnHelper.accessor(
              (row: T) => row[col.id as keyof T] as string,
              {
                id: col.id,
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
                  return (a?.toString() ?? "").localeCompare(
                    b?.toString() ?? ""
                  );
                },
              }
            ) as ColumnDef<T>;
        }
      }),
    [
      columns,
      isEditing,
      isSorting,
      selectedRows,
      editableRowId,
      isAllSelected,
      isIndeterminate,
      editableCellIndex,
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
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      pagination,
    },
    onPaginationChange: setPagination,
    pageCount: Math.ceil(data.length / pagination.pageSize),
    //OSC
    onSortingChange: (updater) => {
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

  // HSA
  const handleSelectAll = useCallback(() => {
    setSelectedRows((prev) => {
      if (isAllSelected || isIndeterminate) {
        // If all are selected or in indeterminate state, clear the selection
        updateSelectionState(new Set());
        return new Set();
      } else {
        // Select all non-subtotal rows
        const allRowIds = table
          .getRowModel()
          .rows.filter((row) => !row.original.isSubtotal)
          .map((row) => row.id);
        const newSet = new Set(allRowIds);
        updateSelectionState(newSet);
        return newSet;
      }
    });
  }, [isAllSelected, isIndeterminate, table]);

  // USS
  const updateSelectionState = useCallback(
    (selectedRows: Set<string>) => {
      const selectableRowCount = table
        .getRowModel()
        .rows.filter((row) => !row.original.isSubtotal).length;
      const allSelected =
        selectedRows.size === selectableRowCount && selectableRowCount > 0;
      const someSelected = selectedRows.size > 0 && !allSelected;
      setIsAllSelected(allSelected);
      setIsIndeterminate(someSelected);
      setShowDeleteButton(selectedRows.size > 0);
      setCanAddSubtotal(
        selectedRows.size <= 1 && hasAmountValuesAfterLastSubtotal(data)
      );
      if (onShowDeleteButton) {
        onShowDeleteButton(selectedRows.size > 0);
      }
    },
    [table, hasAmountValuesAfterLastSubtotal, data, onShowDeleteButton]
  );

  const isLastPage = table.getCanNextPage() === false;

  return (
    <div ref={tableRef} className="w-auto">
      <div className="rounded-lg border border-gray-300 w-fit">
        <table
          className="w-auto border-collapse border-spacing-0 rounded-lg"
          ref={tableContainerRef}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableHeader
                key={headerGroup.id}
                headerGroup={headerGroup}
                columns={columns}
                isEditing={isEditing}
                isAllSelected={isAllSelected}
                isIndeterminate={isIndeterminate}
                handleSelectAll={handleSelectAll}
                isSortableColumn={isSortableColumn}
                columnWidths={columnWidths}
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
                    row.original.isSubtotal ? setSelectedRowId(row.id) : null
                  }
                >
                  {row.getVisibleCells().map((cell, cellIndex) => {
                    const isLastRow =
                      rowIndex === table.getRowModel().rows.length - 1;
                    const isFirstCell = cellIndex === 0;
                    const isLastCell =
                      cellIndex === row.getVisibleCells().length - 1;
                    if (row.original.isSubtotal) {
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
                            colSpan={columns.length - 1}
                            className={`py-3 pr-6 text-right font-semibold`}
                          >
                            Subtotal: {cell.getValue() as ReactNode}
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
                            isSorting ? "bg-gray-100" : "cursor-default"
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
                          isLastRow ? "border-b-0" : "border-b border-gray-300"
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
          isAllSelected={isAllSelected}
          style={{
            marginRight: `${
              hasAmountColumn && hasNumberColumn ? "235px" : "128px"
            }`,
          }}
        />
      )}
      {hasAmountColumn && hasNumberColumn && isEditing && (
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
      {!isEditing ? (
        <div
          className="absolute top-[-57px] right-0 px-3 py-2 rounded-full hover:bg-gray-100 active:bg-gray-200 cursor-pointer text-gray-600 font-medium flex items-center transition-colors duration-200"
          onClick={onToggleEditing}
        >
          <IconEdit className="mr-1.5" />
          <span>Edit</span>
        </div>
      ) : (
        <div className="absolute top-[-57px] right-0 flex border border-gray-300 rounded-lg">
          <div
            className="px-4 py-2 hover:text-sky-500 active:text-sky-600 rounded-l-lg hover:bg-gray-100 active:bg-gray-200 cursor-pointer text-gray-600 font-medium flex items-center border-r border-gray-300 transition-colors duration-200"
            onClick={handleSave}
          >
            <IconDeviceFloppy />
          </div>
          <div
            className="px-4 py-2 hover:text-rose-500 active:text-rose-600 rounded-r-lg hover:bg-gray-100 active:bg-gray-200 cursor-pointer text-gray-600 font-medium flex items-center transition-colors duration-200"
            onClick={handleCancel}
          >
            <IconCancel />
          </div>
        </div>
      )}
      {isEditing && isLastPage && (
        <>
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
      <div className="flex justify-between items-center mt-4">
        {tableData.length > itemsPerPage && <TablePagination table={table} />}
      </div>
    </div>
  );
}

export default Table;
