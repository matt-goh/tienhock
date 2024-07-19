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
  IconSquare,
  IconSquareCheckFilled,
  IconSquareMinusFilled,
  IconTrash,
  IconTrashX,
} from "@tabler/icons-react";
import { ColumnType, TableProps, Data, ColumnConfig } from "../types/types";
import TableEditableCell from "./TableEditableCell";

const Table: React.FC<TableProps> = ({ initialData, columns }) => {
  const [data, setData] = useState<Data[]>(initialData);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [editableCellIndex, setEditableCellIndex] = useState<number | null>(
    null
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previousValue, setPreviousValue] = useState<any>(null);
  const [originalData, setOriginalData] = useState<Data[]>(initialData);
  const [canAddSubtotal, setCanAddSubtotal] = useState(true);
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    Object.fromEntries(columns.map((col) => [col.id, col.width || 200]))
  );
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isSorting, setIsSorting] = useState(false);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [isIndeterminate, setIsIndeterminate] = useState(false);
  const [newRowCount, setNewRowCount] = useState<number>(4);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLTableElement>(null);

  const isEditableColumn = (col: ColumnConfig) => {
    return !["selection", "readonly", "action", "amount", "checkbox"].includes(
      col.type
    );
  };

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

  //HCC
  const handleCellClick = (rowId: string | undefined, cellIndex: number) => {
    if (isSorting || !rowId) return;

    const row = table.getRowModel().rows.find((r) => r.id === rowId);
    if (!row || row.original.isSubtotal) return;

    const columnConfig = allColumns[cellIndex];
    if (!isEditableColumn(columnConfig)) return; // Skip non-editable columns

    setEditableRowId(rowId);
    setEditableCellIndex(cellIndex);
    setSelectedRowId(rowId);

    const columnId = columns[cellIndex]?.id;
    if (!columnId) return;

    setPreviousValue(row.original[columnId]);
  };

  //HCC
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

      const newData = isSorting
        ? updatedData
        : recalculateSubtotals(updatedData);
      setOriginalData(newData);
      return newData;
    });

    if (sorting.some((sort) => sort.id === columnId)) {
      table.setSorting([...sorting]);
    }
  };

  // HKD
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
        nextRowIndex === 0
      ) {
        handleAddRow(1);
        setTimeout(() => {
          const newRows = table.getRowModel().rows;
          const newRowId = newRows[newRows.length - 1].id;
          setSelectedRowId(newRowId);
          setEditableRowId(newRowId);
          setEditableCellIndex(allColumns.findIndex(isEditableColumn));
        }, 0);
      } else {
        const nextRowId = sortedRows[nextRowIndex].id;
        setSelectedRowId(nextRowId);
        setEditableRowId(nextRowId);
        setEditableCellIndex(nextColIndex);
      }
    }
  };

  // HAR
  const handleAddRow = (count: number = newRowCount) => {
    const newRows = Array(count)
      .fill(null)
      .map(() => ({
        id: Math.random().toString(36).substr(2, 9), // Generate a unique id
        ...Object.fromEntries(
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
        ),
      }));
    setData((oldData) => recalculateSubtotals([...oldData, ...newRows]));
  };

  //HASR
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

      const recalculatedData = recalculateSubtotals(newData);
      setOriginalData(recalculatedData);
      return recalculatedData;
    });
  };

  // CS
  const createSubtotalRow = (subtotalAmount: number, endIndex: number) => ({
    id: `subtotal-${Math.random().toString(36).substr(2, 9)}`, // Generate a unique id for subtotal rows
    ...Object.fromEntries(columns.map((col) => [col.id, ""])),
    [columns.find((col) => col.type === "amount")?.id || "amount"]:
      subtotalAmount.toFixed(2),
    isSubtotal: true,
    subtotalEndIndex: endIndex,
  });

  // RS
  const recalculateSubtotals = (currentData: Data[]): Data[] => {
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
    const columnType = allColumns[cellIndex].type;
    const columnConfig = allColumns[cellIndex];
    const isEditable =
      !isSorting && !row.original.isSubtotal && isEditableColumn(columnConfig);

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
            {selectedRows.has(row.original.id) ? (
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

    if (["number", "rate", "string", "date"].includes(columnType)) {
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
        />
      );
    }

    if (columnType === "checkbox") {
      return (
        <div className="flex items-center justify-center h-full">
          <TableEditableCell
            value={cell.getValue()}
            onChange={(val) => handleCellChange(row.index, cell.column.id, val)}
            type="checkbox"
            editable={!isSorting}
            focus={false}
            onKeyDown={() => {}}
            isSorting={isSorting}
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
      />
    );
  };

  // HDR
  const handleDeleteRow = (rowIndex: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setData((oldData) => {
      const newData = oldData.filter((_, index) => index !== rowIndex);
      const updatedData = recalculateSubtotals(newData);
      setOriginalData(updatedData);
      return updatedData;
    });
  };

  // HMD
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

  const checkboxColumn: ColumnConfig = {
    id: "selection",
    header: "",
    type: "selection",
    width: 10,
  };

  const allColumns = useMemo(() => [checkboxColumn, ...columns], [columns]);

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

  // HRS
  const handleRowSelection = (row: Row<Data>) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(row.original.id)) {
        newSet.delete(row.original.id);
      } else {
        newSet.add(row.original.id);
      }
      updateSelectionState(newSet);
      return newSet;
    });
  };

  // HSA
  const handleSelectAll = () => {
    let newSelectedRows: Set<string>;
    if (isAllSelected || isIndeterminate) {
      newSelectedRows = new Set<string>();
    } else {
      newSelectedRows = new Set(data.map((row) => row.id));
    }
    setSelectedRows(newSelectedRows);
    updateSelectionState(newSelectedRows);
  };

  // USS
  const updateSelectionState = (selectedRows: Set<string>) => {
    const allSelected = selectedRows.size === data.length && data.length > 0;
    const someSelected = selectedRows.size > 0 && !allSelected;
    setIsAllSelected(allSelected);
    setIsIndeterminate(someSelected);
    setShowDeleteButton(selectedRows.size > 0);
  };

  // HDS
  const handleDeleteSelected = () => {
    setData((oldData) => {
      let newData: Data[];
      if (isAllSelected) {
        newData = []; // Delete all rows
      } else {
        newData = oldData.filter((row) => !selectedRows.has(row.id));
      }
      const updatedData = recalculateSubtotals(newData);
      setOriginalData(updatedData);
      setSelectedRows(new Set());
      updateSelectionState(new Set());
      return updatedData;
    });
  };

  useEffect(() => {
    updateSelectionState(selectedRows);
  }, [selectedRows, data]);

  //TC
  const tableColumns = useMemo(
    () =>
      allColumns.map((col) => {
        // CHC
        const commonHeaderContent = (column: any) => (
          <div
            className={`flex items-center group cursor-pointer w-full h-full ${
              ["number", "rate", "amount"].includes(col.type)
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
              isSorting={isSorting}
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
      selectedRows,
      isSorting,
      isAllSelected,
      isIndeterminate,
      handleCellChange,
      handleCellClick,
      handleKeyDown,
    ]
  );

  //T
  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
              const jamPerDay = parseFloat(row.jamPerDay) || 0;
              const rate = parseFloat(row.rate) || 0;
              return { ...row, amount: (jamPerDay * rate).toFixed(2) };
            }
            return row;
          });
          const newData = recalculateSubtotals(recalculatedData);
          setOriginalData(newData);
          return newData;
        });
      }
    },
    state: { sorting },
  });

  return (
    <div ref={tableRef} className="w-auto">
      <div
        className={`flex ${
          showDeleteButton ? "mr-[5.5rem]" : ""
        } items-center justify-end ${hasInputColumns ? "mb-4" : ""} w-auto`}
      >
        {hasInputColumns && (
          <>
            <div className="flex items-center">
              <button
                onClick={() => handleAddRow(4)}
                className={`ml-2 px-4 py-2 border border-gray-300 font-medium rounded-full ${
                  !isSorting
                    ? "hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200"
                    : "opacity-50 cursor-not-allowed"
                }`}
                disabled={isSorting}
              >
                Add rows
              </button>
            </div>
          </>
        )}
        {hasAmountColumn && (
          <button
            onClick={handleAddSubtotalRow}
            className={`ml-2 px-4 py-2 border border-gray-300 font-medium rounded-full ${
              canAddSubtotal && !isSorting
                ? "hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200"
                : "opacity-50 cursor-not-allowed"
            }`}
            disabled={!canAddSubtotal || isSorting}
          >
            Add Subtotal
          </button>
        )}
      </div>
      <table
        className="w-auto bg-white border-collapse border-spacing-0"
        ref={tableContainerRef}
      >
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
                  {header.column.id === "selection" ? (
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
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )
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
                  ${
                    row.original.isSubtotal
                      ? "border-t border-b border-gray-300"
                      : ""
                  } ${row.id === selectedRowId ? "shadow-top-bottom" : ""} ${
                !row.original.isSubtotal ? "border border-gray-300" : ""
              } ${
                selectedRows.has(row.original.id)
                  ? "bg-blue-50 hover:bg-blue-50"
                  : "hover:bg-gray-100"
              } ${row.id === editableRowId ? "relative z-10" : ""}`}
              onClick={() =>
                row.original.isSubtotal ? setSelectedRowId(row.id) : null
              }
            >
              {row.getVisibleCells().map((cell, cellIndex) => {
                if (row.original.isSubtotal) {
                  if (cell.column.id === "selection") {
                    return (
                      <td key={cell.id} className="border border-gray-300">
                        {renderCell(row, cell, cellIndex)}
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
                        className="py-3 pr-6 text-right font-semibold border border-gray-300"
                      >
                        Subtotal: {cell.getValue() as ReactNode}
                      </td>
                    );
                  } else if (cell.column.id === "actions") {
                    return (
                      <td key={cell.id} className="border border-gray-300">
                        {renderCell(row, cell, cellIndex)}
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
                      } border border-gray-300 ${
                        row.id === editableRowId &&
                        cellIndex === editableCellIndex &&
                        !isSorting
                          ? "cell-highlight before:absolute before:inset-[-1px] before:border-[2px] before:border-gray-400 before:pointer-events-none before:z-10"
                          : ""
                      }`}
                      onClick={() => handleCellClick(row.id, cellIndex)}
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
      {showDeleteButton && (
        <div className="absolute z-10 top-0 right-0">
          <button
            onClick={handleDeleteSelected}
            className="px-4 py-2 text-rose-500 font-medium border border-rose-500 hover:bg-rose-500 hover:text-white active:bg-rose-600 rounded-full transition-colors duration-200"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

export default Table;
