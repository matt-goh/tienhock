// src/pages/Catalogue/LocationPage.tsx
import React, { useState, useMemo, useCallback } from "react";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconSearch,
  IconMapPin,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  useLocationsCache,
  Location,
} from "../../utils/catalogue/useLocationsCache";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import LocationModal from "../../components/Catalogue/LocationModal";

const LocationPage: React.FC = () => {
  const { locations, isLoading, error, refreshLocations } = useLocationsCache();
  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [locationToEdit, setLocationToEdit] = useState<Location | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);

  // Filtered locations
  const filteredLocations = useMemo(() => {
    if (!searchTerm) return locations;
    const term = searchTerm.toLowerCase();
    return locations.filter(
      (loc: { id: string; name: string; }) =>
        loc.id.toLowerCase().includes(term) ||
        loc.name.toLowerCase().includes(term)
    );
  }, [locations, searchTerm]);

  // Sorted by ID
  const sortedLocations = useMemo(() => {
    return [...filteredLocations].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true })
    );
  }, [filteredLocations]);

  // Handlers
  const handleAddClick = () => {
    setLocationToEdit(null);
    setShowModal(true);
  };

  const handleEditClick = (location: Location) => {
    setLocationToEdit(location);
    setShowModal(true);
  };

  const handleDeleteClick = (location: Location) => {
    setLocationToDelete(location);
    setShowDeleteDialog(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setLocationToEdit(null);
  };

  const handleSaveLocation = useCallback(
    async (locationData: Location) => {
      const isEditing = !!locationData.originalId;

      try {
        if (isEditing) {
          await api.put(`/api/locations/${locationData.originalId}`, {
            id: locationData.id,
            name: locationData.name,
            newId: locationData.id !== locationData.originalId ? locationData.id : undefined,
          });
          toast.success("Location updated successfully");
        } else {
          await api.post("/api/locations", locationData);
          toast.success("Location created successfully");
        }
        refreshLocations();
      } catch (err: any) {
        console.error("Error saving location:", err);
        throw new Error(err.message || "Failed to save location");
      }
    },
    [refreshLocations]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!locationToDelete) return;

    try {
      await api.delete("/api/locations", [locationToDelete.id]);
      toast.success("Location deleted successfully");
      setShowDeleteDialog(false);
      setLocationToDelete(null);
      refreshLocations();
    } catch (err: any) {
      console.error("Error deleting location:", err);
      toast.error(err.message || "Failed to delete location");
    }
  }, [locationToDelete, refreshLocations]);

  // Loading state
  if (isLoading) {
    return (
      <div className="mt-40 flex w-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mt-20 flex w-full items-center justify-center text-rose-600 dark:text-rose-400">
        Error loading locations: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-2">
          <IconMapPin className="text-sky-500" size={24} />
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Location Catalogue
          </h1>
        </div>

        <div className="flex w-full flex-col items-center justify-end gap-3 md:w-auto md:flex-row">
          {/* Search */}
          <div className="relative w-full md:w-64">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400 dark:text-gray-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search ID or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-default-400 dark:placeholder:text-gray-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-300"
              >
                ×
              </button>
            )}
          </div>

          {/* Add Button */}
          <Button
            onClick={handleAddClick}
            color="sky"
            variant="filled"
            icon={IconPlus}
            iconPosition="left"
            size="md"
            className="w-full md:w-auto"
          >
            Add Location
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-default-600 dark:text-gray-400">
        <span>
          Total: <strong className="text-default-800 dark:text-gray-200">{locations.length}</strong> locations
        </span>
        {searchTerm && (
          <span>
            Showing: <strong className="text-default-800 dark:text-gray-200">{filteredLocations.length}</strong> results
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
          <thead className="bg-default-50 dark:bg-gray-800/50">
            <tr>
              <th className="w-24 px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-default-600 dark:text-gray-300">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-default-600 dark:text-gray-300">
                Name
              </th>
              <th className="w-28 px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-default-600 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-100 dark:divide-gray-700/50">
            {sortedLocations.length > 0 ? (
              sortedLocations.map((location) => (
                <tr
                  key={location.id}
                  className="hover:bg-default-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  onClick={() => handleEditClick(location)}
                >
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center justify-center w-10 h-7 rounded-md bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-mono text-sm font-medium">
                      {location.id}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-default-800 dark:text-gray-200">
                    {location.name}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(location);
                        }}
                        className="p-1.5 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-600 dark:text-sky-400 transition-colors"
                        title="Edit"
                      >
                        <IconPencil size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(location);
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 transition-colors"
                        title="Delete"
                      >
                        <IconTrash size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-12 text-center text-sm text-default-500 dark:text-gray-400"
                >
                  {searchTerm
                    ? "No locations match your search."
                    : "No locations found. Add one to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <LocationModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleSaveLocation}
        initialData={locationToEdit}
        existingLocations={locations}
      />

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setLocationToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Location"
        message={`Are you sure you want to delete "${locationToDelete?.name}" (ID: ${locationToDelete?.id})? This action cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default LocationPage;
