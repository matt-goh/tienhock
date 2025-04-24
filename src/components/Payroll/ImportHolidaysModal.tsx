// src/components/Payroll/ImportHolidaysModal.tsx
import React, { useState, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { format, parse } from "date-fns";
import { IconAlertTriangle } from "@tabler/icons-react";

interface ImportHolidaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  existingHolidays: Array<{ holiday_date: string; description: string }>;
  selectedYear: number;
}

interface ParsedHoliday {
  date: Date;
  day: string;
  description: string;
  isDuplicate: boolean;
  existingDescription?: string;
}

const ImportHolidaysModal: React.FC<ImportHolidaysModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  existingHolidays,
  selectedYear,
}) => {
  const [inputText, setInputText] = useState("");
  const [parsedHolidays, setParsedHolidays] = useState<ParsedHoliday[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false);

  const parseHolidayText = () => {
    try {
      const lines = inputText.trim().split("\n");
      const holidays: ParsedHoliday[] = [];

      // Skip header line if it exists
      const startIndex = lines[0].toLowerCase().includes("date") ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try to parse the line (handle both tab and multiple spaces)
        const parts = line.split(/\t+|\s{2,}/);
        if (parts.length < 3) continue;

        const [dateStr, day, ...descriptionParts] = parts;
        const description = descriptionParts.join(" ");

        // Parse date like "1 Jan" with the selected year
        try {
          const parsedDate = parse(
            `${dateStr} ${selectedYear}`,
            "d MMM yyyy",
            new Date()
          );
          if (isNaN(parsedDate.getTime())) continue;

          // Check if it's a duplicate
          const existingHoliday = existingHolidays.find((h) => {
            const existingDate = new Date(h.holiday_date);
            return existingDate.toDateString() === parsedDate.toDateString();
          });

          holidays.push({
            date: parsedDate,
            day,
            description,
            isDuplicate: !!existingHoliday,
            existingDescription: existingHoliday?.description,
          });
        } catch {
          continue;
        }
      }

      setParsedHolidays(holidays);
      setShowPreview(true);
    } catch (error) {
      console.error("Error parsing holiday text:", error);
      toast.error("Failed to parse holiday data. Please check the format.");
    }
  };

  const handleImport = async () => {
    setIsImporting(true);

    try {
      // Filter holidays based on duplicate handling preference
      const holidaysToImport = parsedHolidays.filter(
        (holiday) => !holiday.isDuplicate || overwriteDuplicates
      );

      // Prepare data for batch import
      const batchData = holidaysToImport.map((holiday) => ({
        holiday_date: format(holiday.date, "yyyy-MM-dd"),
        description: holiday.description,
      }));

      // Make a single batch API call
      await api.post("/api/holidays/batch", {
        holidays: batchData,
        overwrite: overwriteDuplicates,
      });

      toast.success(
        `Successfully imported ${holidaysToImport.length} holidays`
      );
      onImportComplete();
      onClose();
    } catch (error: any) {
      console.error("Error importing holidays:", error);
      toast.error(error.response?.data?.message || "Failed to import holidays");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setInputText("");
    setParsedHolidays([]);
    setShowPreview(false);
    setOverwriteDuplicates(false);
    onClose();
  };

  const duplicateCount = parsedHolidays.filter((h) => h.isDuplicate).length;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Import Holidays for {selectedYear}
                </DialogTitle>

                {!showPreview ? (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">
                      Paste holiday data in the format: Date, Day, Holiday
                      Description
                    </p>
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      placeholder="1 Jan	Wed	New Year's Day&#10;29 Jan	Wed	Chinese New Year&#10;..."
                    />
                    <div className="mt-4 flex justify-end space-x-3">
                      <Button variant="outline" onClick={handleClose}>
                        Cancel
                      </Button>
                      <Button
                        color="sky"
                        variant="filled"
                        onClick={parseHolidayText}
                        disabled={!inputText.trim()}
                      >
                        Preview Import
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    {duplicateCount > 0 && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start">
                        <IconAlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 mr-2" />
                        <div>
                          <p className="text-sm text-amber-800">
                            {duplicateCount} duplicate
                            {duplicateCount > 1 ? "s" : ""} found
                          </p>
                          <div className="mt-2">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={overwriteDuplicates}
                                onChange={(e) =>
                                  setOverwriteDuplicates(e.target.checked)
                                }
                                className="h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-amber-700">
                                Overwrite existing holidays
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="max-h-96 overflow-y-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Day
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Description
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {parsedHolidays.map((holiday, index) => (
                            <tr
                              key={index}
                              className={
                                holiday.isDuplicate ? "bg-amber-50" : ""
                              }
                            >
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {format(holiday.date, "dd MMM yyyy")}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {holiday.day}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {holiday.description}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {holiday.isDuplicate ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                    Duplicate
                                    {holiday.existingDescription &&
                                      holiday.existingDescription !==
                                        holiday.description && (
                                        <span className="ml-1 text-amber-600">
                                          (Current:{" "}
                                          {holiday.existingDescription})
                                        </span>
                                      )}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    New
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        {parsedHolidays.length} total, {duplicateCount}{" "}
                        duplicates
                        {overwriteDuplicates || duplicateCount === 0
                          ? ` • ${
                              parsedHolidays.length -
                              duplicateCount +
                              (overwriteDuplicates ? duplicateCount : 0)
                            } will be imported`
                          : ` • ${
                              parsedHolidays.length - duplicateCount
                            } will be imported (duplicates will be skipped)`}
                      </div>
                      <div className="flex space-x-3">
                        <Button
                          variant="outline"
                          onClick={() => setShowPreview(false)}
                          disabled={isImporting}
                        >
                          Back
                        </Button>
                        <Button
                          color="sky"
                          variant="filled"
                          onClick={handleImport}
                          disabled={isImporting || parsedHolidays.length === 0}
                        >
                          {isImporting ? "Importing..." : "Import"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ImportHolidaysModal;
