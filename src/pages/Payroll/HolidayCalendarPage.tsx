// src/pages/Payroll/HolidayCalendarPage.tsx
import React, { useState, useEffect } from "react";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
  IconFileImport,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { format } from "date-fns";
import HolidayFormModal from "../../components/Payroll/HolidayFormModal";
import { useHolidayCache } from "../../utils/payroll/useHolidayCache";
import ImportHolidaysModal from "../../components/Payroll/ImportHolidaysModal";

interface Holiday {
  id: number;
  holiday_date: string;
  description: string;
  is_active: boolean;
}

const HolidayCalendarPage: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [holidayToDelete, setHolidayToDelete] = useState<Holiday | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [holidayToEdit, setHolidayToEdit] = useState<Holiday | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const {
    holidays: allHolidays,
    isLoading,
    refreshHolidays,
  } = useHolidayCache();

  const holidays = React.useMemo(() => {
    return allHolidays.filter((holiday) => {
      const holidayYear = new Date(holiday.holiday_date).getFullYear();
      return holidayYear === selectedYear;
    });
  }, [allHolidays, selectedYear]);

  const handleYearChange = (direction: "prev" | "next") => {
    setSelectedYear((year) => (direction === "prev" ? year - 1 : year + 1));
  };

  const handleDeleteHoliday = async () => {
    if (!holidayToDelete) return;

    try {
      await api.delete(`/api/holidays/${holidayToDelete.id}`);
      toast.success("Holiday deleted successfully");
      await refreshHolidays();
    } catch (error) {
      console.error("Error deleting holiday:", error);
      toast.error("Failed to delete holiday");
    } finally {
      setShowDeleteDialog(false);
      setHolidayToDelete(null);
    }
  };

  return (
    <div className="relative w-full mx-4 md:mx-6">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Holiday Calendar
        </h1>
        <div className="mt-4 md:mt-0 flex items-center gap-4">
          {/* Year Navigation */}
          <div className="flex items-center gap-2 border border-default-200 rounded-lg px-3 py-2">
            <button
              onClick={() => handleYearChange("prev")}
              className="p-1 hover:bg-default-100 rounded"
            >
              <IconChevronLeft size={20} />
            </button>
            <span className="font-medium">{selectedYear}</span>
            <button
              onClick={() => handleYearChange("next")}
              className="p-1 hover:bg-default-100 rounded"
            >
              <IconChevronRight size={20} />
            </button>
          </div>

          <Button
            onClick={() => setShowImportModal(true)}
            icon={IconFileImport}
            variant="outline"
          >
            Import
          </Button>

          <Button
            onClick={() => setShowAddModal(true)}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            Add Holiday
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-default-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-default-200">
            <thead className="bg-default-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Day
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Description
                </th>
                <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 bg-white">
              {holidays.length > 0 ? (
                holidays.map((holiday) => {
                  const date = new Date(holiday.holiday_date);
                  const dayOfWeek = date.toLocaleDateString("en-US", {
                    weekday: "long",
                  });
                  const isSunday = date.getDay() === 0;

                  return (
                    <tr
                      key={holiday.id}
                      className="hover:bg-default-50 cursor-pointer"
                      onClick={() => {
                        setHolidayToEdit(holiday);
                        setShowEditModal(true);
                      }}
                    >
                      <td className="px-4 py-3 text-sm text-default-700">
                        {format(date, "dd MMM yyyy")}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm ${
                          isSunday
                            ? "text-amber-600 font-medium"
                            : "text-default-700"
                        }`}
                      >
                        {dayOfWeek}
                      </td>
                      <td className="px-4 py-3 text-sm text-default-700">
                        {holiday.description || "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            className="text-sky-600 hover:text-sky-800"
                            title="Edit"
                          >
                            <IconPencil size={18} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click event
                              setHolidayToDelete(holiday);
                              setShowDeleteDialog(true);
                            }}
                            className="text-rose-600 hover:text-rose-800"
                            title="Delete"
                          >
                            <IconTrash size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-10 text-center text-sm text-default-500"
                  >
                    No holidays recorded for {selectedYear}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setHolidayToDelete(null);
        }}
        onConfirm={handleDeleteHoliday}
        title="Delete Holiday"
        message={`Are you sure you want to delete the holiday for ${
          holidayToDelete
            ? format(new Date(holidayToDelete.holiday_date), "dd MMM yyyy")
            : ""
        }?`}
        variant="danger"
      />
      <ImportHolidaysModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={refreshHolidays}
        existingHolidays={allHolidays}
        selectedYear={selectedYear}
      />
      <HolidayFormModal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setHolidayToEdit(null);
        }}
        holiday={holidayToEdit}
        onSave={() => {
          // The cache will be refreshed by HolidayFormModal
          // This is just to close the modal and reset states
        }}
      />
    </div>
  );
};

export default HolidayCalendarPage;
