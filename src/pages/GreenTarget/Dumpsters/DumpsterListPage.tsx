// src/pages/GreenTarget/Dumpsters/DumpsterListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import DumpsterAvailabilityCalendar from "../../../components/GreenTarget/DumpsterAvailabilityCalander";

// Define the Dumpster interface
interface Dumpster {
  tong_no: string;
  status: "Available" | "Rented" | "Maintenance";
}

const DumpsterListPage = () => {
  const [dumpsters, setDumpsters] = useState<Dumpster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [dumpsterToDelete, setDumpsterToDelete] = useState<Dumpster | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchDumpsters();
  }, []);

  const fetchDumpsters = async () => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getDumpsters();
      setDumpsters(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch dumpsters. Please try again later.");
      console.error("Error fetching dumpsters:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (dumpster: Dumpster) => {
    setDumpsterToDelete(dumpster);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (dumpsterToDelete) {
      try {
        await greenTargetApi.deleteDumpster(dumpsterToDelete.tong_no);

        setDumpsters(
          dumpsters.filter((d) => d.tong_no !== dumpsterToDelete.tong_no)
        );
        toast.success("Dumpster deleted successfully");
        setIsDeleteDialogOpen(false);
        setDumpsterToDelete(null);
      } catch (err: any) {
        console.error("Error deleting dumpster:", err);
        if (err.message && err.message.includes("being used")) {
          toast.error(
            "Cannot delete dumpster: it is being used in one or more rentals"
          );
        } else {
          toast.error("Failed to delete dumpster. Please try again.");
        }
      }
    }
  };

  const filteredDumpsters = useMemo(() => {
    return dumpsters.filter((dumpster) => {
      const matchesSearch = dumpster.tong_no
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "All" || dumpster.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [dumpsters, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredDumpsters.length / ITEMS_PER_PAGE);

  const paginatedDumpsters = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDumpsters.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredDumpsters, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderPaginationButtons = () => {
    // Similar to the pagination in CustomerListPage
    const buttons = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
              i === currentPage
                ? "border border-default-200 font-semibold"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }
    } else {
      // Complex pagination logic (first, ellipsis, around current, ellipsis, last)
      // This is the same as in CustomerListPage
      // ...
    }

    return buttons;
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="relative w-full mx-20">
      <DumpsterAvailabilityCalendar />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl text-default-700 font-bold">
          Dumpsters ({filteredDumpsters.length})
        </h1>
        <div className="flex space-x-3">
          <div className="relative">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
              size={22}
            />
            <input
              type="text"
              placeholder="Search"
              className="w-full pl-11 py-2 border focus:border-default-500 rounded-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Listbox value={statusFilter} onChange={setStatusFilter}>
              <div className="relative">
                <ListboxButton className="w-full rounded-full border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
                  <span className="pl-2 block truncate">
                    {statusFilter === "All"
                      ? "All Statuses"
                      : statusFilter === "Available"
                      ? "Available"
                      : statusFilter === "Rented"
                      ? "Rented"
                      : "Maintenance"}
                  </span>
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <IconChevronDown
                      className="h-5 w-5 text-default-400"
                      aria-hidden="true"
                    />
                  </span>
                </ListboxButton>
                <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 text-default-900"
                          : "text-default-900"
                      }`
                    }
                    value="All"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          All Statuses
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 text-default-900"
                          : "text-default-900"
                      }`
                    }
                    value="Available"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          Available
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 text-default-900"
                          : "text-default-900"
                      }`
                    }
                    value="Rented"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          Rented
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 text-default-900"
                          : "text-default-900"
                      }`
                    }
                    value="Maintenance"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          Maintenance
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                </ListboxOptions>
              </div>
            </Listbox>
          </div>
          <Button
            onClick={() => navigate("/greentarget/dumpsters/new")}
            icon={IconPlus}
            variant="outline"
          >
            Add Dumpster
          </Button>
        </div>
      </div>

      {filteredDumpsters.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-default-500">No dumpsters found.</p>
        </div>
      ) : (
        <div className="bg-white border border-default-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Tong Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-default-200">
                {paginatedDumpsters.map((dumpster) => (
                  <tr
                    key={dumpster.tong_no}
                    className="hover:bg-default-50 cursor-pointer"
                    onClick={() =>
                      navigate(
                        `/greentarget/dumpsters/${encodeURIComponent(
                          dumpster.tong_no
                        )}`
                      )
                    }
                  >
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-default-900">
                      {dumpster.tong_no}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium ${
                          dumpster.status === "Available"
                            ? "bg-green-100 text-green-800"
                            : dumpster.status === "Rented"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {dumpster.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {dumpster.status !== "Rented" && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(dumpster);
                          }}
                          variant="outline"
                          color="rose"
                          size="sm"
                          icon={IconTrash}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {filteredDumpsters.length > 0 && (
        <div className="mt-6 flex justify-between items-center text-default-700">
          <button
            className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 active:bg-default-200"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft className="w-5 h-5 mr-2" /> Previous
          </button>
          <div className="flex space-x-2">{renderPaginationButtons()}</div>
          <button
            className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 active:bg-default-200"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <IconChevronRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Dumpster"
        message={`Are you sure you want to delete dumpster ${dumpsterToDelete?.tong_no}? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default DumpsterListPage;
