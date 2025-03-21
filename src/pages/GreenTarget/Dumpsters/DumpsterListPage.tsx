// src/pages/GreenTarget/Dumpsters/DumpsterListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import { api } from "../../../routes/utils/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

// Define the Dumpster interface
interface Dumpster {
  tong_no: string;
  status: "available" | "rented" | "maintenance";
}

const DumpsterCard = ({
  dumpster,
  onDeleteClick,
}: {
  dumpster: Dumpster;
  onDeleteClick: (dumpster: Dumpster) => void;
}) => {
  const navigate = useNavigate();
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isTrashHovered, setIsTrashHovered] = useState(false);

  const handleClick = () => {
    navigate(`/greentarget/dumpsters/${encodeURIComponent(dumpster.tong_no)}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(dumpster);
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800";
      case "rented":
        return "bg-blue-100 text-blue-800";
      case "maintenance":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-default-100 text-default-800";
    }
  };

  return (
    <div
      className={`relative border text-left rounded-lg p-4 transition-all duration-200 cursor-pointer ${
        isCardHovered && !isTrashHovered
          ? "bg-default-100 active:bg-default-200"
          : ""
      }`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      <div className="mb-2">
        <h3 className="font-semibold">Dumpster {dumpster.tong_no}</h3>
      </div>
      <div className="mt-2">
        <span
          className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium ${getStatusColor(
            dumpster.status
          )}`}
        >
          {dumpster.status}
        </span>
      </div>
      <div className="absolute inset-y-0 top-2 right-2">
        <div className="relative w-8 h-8">
          {isCardHovered && dumpster.status !== "rented" && (
            <button
              onClick={handleDeleteClick}
              onMouseEnter={() => setIsTrashHovered(true)}
              onMouseLeave={() => setIsTrashHovered(false)}
              className="delete-button flex items-center justify-center absolute inset-0 rounded-lg transition-colors duration-200 bg-default-100 active:bg-default-200 focus:outline-none"
            >
              <IconTrash
                className="text-default-700 active:text-default-800"
                stroke={1.5}
                size={18}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchDumpsters();
  }, []);

  const fetchDumpsters = async () => {
    try {
      setLoading(true);
      const data = await api.get("/greentarget/api/dumpsters");
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
        await api.delete(
          `/greentarget/api/dumpsters/${encodeURIComponent(
            dumpsterToDelete.tong_no
          )}`
        );

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
        statusFilter === "all" || dumpster.status === statusFilter;
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border focus:border-default-500 rounded-full"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="rented">Rented</option>
            <option value="maintenance">Maintenance</option>
          </select>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedDumpsters.map((dumpster) => (
            <DumpsterCard
              key={dumpster.tong_no}
              dumpster={dumpster}
              onDeleteClick={handleDeleteClick}
            />
          ))}
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
