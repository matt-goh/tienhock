import React, { useState, useEffect, Fragment, useCallback } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Field,
} from "@headlessui/react";
import {
  IconCheck,
  IconChevronDown,
  IconDeviceFloppy,
  IconEdit,
  IconTrash,
  IconCancel,
} from "@tabler/icons-react";
import Table from "../components/Table";
import { ColumnConfig, Job, Product } from "../types/types";
import NewJobModal from "../components/NewJobModal";
import DeleteDialog from "../components/DeleteDialog";

type JobSelection = Job | null;

const CatalogueJobPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [editedJob, setEditedJob] = useState<Job | null>(null);
  const [originalJob, setOriginalJob] = useState<Job | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [changedProducts, setChangedProducts] = useState<Set<string>>(
    new Set()
  );
  const [originalProducts, setOriginalProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [hoveredJob, setHoveredJob] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const productColumns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly", width: 50 },
    { id: "name", header: "Name", type: "readonly" },
    {
      id: "amount",
      header: "Amount",
      type: isEditing ? "float" : "readonly",
      width: 50,
    },
    { id: "remark", header: "Remark", type: "readonly", width: 300 },
  ];

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5000/api/jobs");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
      setJobs(data);
      if (data.length > 0 && !selectedJob) {
        setSelectedJob(data[0]);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedJob]);

  const fetchProducts = useCallback(async (jobId: string) => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:5000/api/jobs/${jobId}/products`
      );
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setProducts(data);
      setOriginalProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (selectedJob) {
      fetchProducts(selectedJob.id);
      setEditedJob(selectedJob);
      setOriginalJob(selectedJob);
    } else {
      setProducts([]);
      setEditedJob(null);
      setOriginalJob(null);
    }
  }, [selectedJob, fetchProducts]);

  const handleJobAdded = useCallback(() => {
    fetchJobs();
    setShowNewJobModal(false);
  }, [fetchJobs]);

  // HJS
  const handleJobSelection = useCallback((selection: Job | null) => {
    if (selection === null) {
      setShowNewJobModal(true);
    } else {
      setSelectedJob(selection);
      setShowNewJobModal(false);
    }
  }, []);

  const handleNewJobModalClose = useCallback(() => {
    setShowNewJobModal(false);
  }, []);

  const handleDeleteJob = useCallback(async (job: Job, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(
        `http://localhost:5000/api/jobs/${job.id}/products/count`
      );
      if (!response.ok) throw new Error("Failed to check associated products");
      const { count } = await response.json();

      if (count > 0) {
        setDeleteError(
          `Cannot delete job. There are still ${count} product(s) associated with this job. Please delete all associated products first.`
        );
        setTimeout(() => setDeleteError(null), 10000);
      } else {
        setJobToDelete(job);
        setShowDeleteDialog(true);
      }
    } catch (error) {
      console.error("Error checking associated products:", error);
      setDeleteError("An error occurred while checking associated products.");
      setTimeout(() => setDeleteError(null), 10000);
    }
  }, []);

  const confirmDeleteJob = useCallback(async () => {
    if (!jobToDelete) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/jobs/${jobToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to delete job");

      setJobs((jobs) => jobs.filter((job) => job.id !== jobToDelete.id));
      if (selectedJob && selectedJob.id === jobToDelete.id) {
        setSelectedJob(null);
      }
      setShowDeleteDialog(false);
      setJobToDelete(null);
    } catch (error) {
      console.error("Error deleting job:", error);
      setDeleteError("An error occurred while deleting the job.");
      setTimeout(() => setDeleteError(null), 10000);
    }
  }, [jobToDelete, selectedJob]);

  const handleDeleteProducts = useCallback(
    async (selectedIds: string[]) => {
      if (!selectedJob) return;

      try {
        for (const productId of selectedIds) {
          await fetch(`http://localhost:5000/api/job_products`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: selectedJob.id, productId }),
          });

          await fetch(`http://localhost:5000/api/products/${productId}`, {
            method: "DELETE",
          });
        }

        await fetchProducts(selectedJob.id);
      } catch (error) {
        console.error("Error deleting products:", error);
      }
    },
    [selectedJob, fetchProducts]
  );

  const handleOptionClick = (e: React.MouseEvent, job: Job) => {
    if (!(e.target as HTMLElement).closest(".delete-button")) {
      handleJobSelection(job);
    }
  };

  const filteredJobs =
    query === ""
      ? jobs
      : jobs.filter((job) =>
          job.name.toLowerCase().includes(query.toLowerCase())
        );

  const toggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
    if (!isEditing) {
      setOriginalJob(selectedJob);
      setOriginalProducts([...products]);
      setChangedProducts(new Set());
    }
  }, [isEditing, selectedJob, products]);

  // HS
  const handleSave = useCallback(async () => {
    if (!editedJob) return;

    try {
      const jobResponse = await fetch(
        `http://localhost:5000/api/jobs/${editedJob.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editedJob),
        }
      );

      if (!jobResponse.ok) throw new Error("Failed to update job");

      for (const productId of Array.from(changedProducts)) {
        const product = products.find((p) => p.id === productId);
        if (product) {
          const productResponse = await fetch(
            `http://localhost:5000/api/products/${productId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(product),
            }
          );

          if (!productResponse.ok)
            throw new Error(`Failed to update product ${productId}`);
        }
      }

      setSelectedJob(editedJob);
      setJobs((jobs) =>
        jobs.map((job) => (job.id === editedJob.id ? editedJob : job))
      );
      setOriginalJob(editedJob);
      setOriginalProducts([...products]);
      setChangedProducts(new Set());
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating data:", error);
      // Handle error (e.g., show error message to user)
    }
  }, [editedJob, changedProducts, products]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedJob(originalJob);
    setProducts(originalProducts);
    setChangedProducts(new Set());
  }, [originalJob, originalProducts]);

  // HJPC
  const handleJobPropertyChange = useCallback(
    (property: keyof Job, value: string) => {
      if (editedJob) {
        setEditedJob(
          (prev) =>
            ({
              ...prev!,
              [property]: value,
            } as Job)
        );
      }
    },
    [editedJob]
  );

  const handleDataChange = useCallback(
    (updatedData: Product[]) => {
      setProducts(updatedData);
      const newChangedProducts = new Set(changedProducts);
      updatedData.forEach((product, index) => {
        const originalProduct = originalProducts[index];
        if (JSON.stringify(product) !== JSON.stringify(originalProduct)) {
          newChangedProducts.add(product.id);
        } else {
          newChangedProducts.delete(product.id);
        }
      });
      setChangedProducts(newChangedProducts);
    },
    [originalProducts, changedProducts]
  );

  return (
    <div className={`flex justify-center py-[60px]`}>
      <div className="flex flex-col items-start w-full max-w-4xl px-4">
        <div className={`w-full text-lg font-medium text-gray-700 mb-4`}>
          Job Catalogue
        </div>
        <div className={`w-full flex justify-center items-center mb-4`}>
          <div className={`${selectedJob ? "w-54 mr-4" : "w-full max-w-xs"}`}>
            {!isEditing ? (
              <Field>
                <Combobox value={selectedJob} onChange={handleJobSelection}>
                  <div className="relative">
                    <ComboboxInput
                      className="w-full cursor-default rounded-lg border border-gray-300 bg-white py-2 pl-4 pr-10 text-left focus:outline-none focus:border-gray-400"
                      displayValue={(job: Job | null) => job?.name || ""}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Select a job"
                    />
                    <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                      <IconChevronDown
                        className="h-5 w-5 text-gray-400"
                        aria-hidden="true"
                      />
                    </ComboboxButton>
                    <ComboboxOptions className="absolute z-20 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                      <ComboboxOption
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 pl-4 pr-12 text-left ${
                            active
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-900"
                          }`
                        }
                        value={null}
                      >
                        + Add Job
                      </ComboboxOption>
                      {jobs.length !== 0 && (
                        <div className="border-t border-gray-150 w-full my-1"></div>
                      )}
                      {filteredJobs.map((job) => (
                        <div
                          key={job.id}
                          className="relative"
                          onClick={(e) => handleOptionClick(e, job)}
                        >
                          <ComboboxOption
                            value={job}
                            className={({ active }) =>
                              `cursor-pointer select-none rounded text-left py-2 pl-4 pr-12 ${
                                active
                                  ? "bg-gray-100 text-gray-900"
                                  : "text-gray-900"
                              }`
                            }
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {job.name}
                                </span>
                                <span className="absolute inset-y-0 right-0 flex items-center mr-3 my-2">
                                  <div className="relative w-6 h-6 flex items-center justify-center">
                                    {selected && (
                                      <IconCheck
                                        className="text-gray-600"
                                        stroke={2}
                                        width={22}
                                        height={22}
                                      />
                                    )}
                                  </div>
                                </span>
                              </>
                            )}
                          </ComboboxOption>
                          <div
                            className="absolute inset-y-0 right-0 flex items-center pr-3 my-2 z-10"
                            onMouseEnter={() => setHoveredJob(job.id)}
                            onMouseLeave={() => setHoveredJob(null)}
                          >
                            <div className="relative w-6 h-6 flex items-center justify-center">
                              {hoveredJob === job.id && (
                                <button
                                  onClick={(e) => handleDeleteJob(job, e)}
                                  className="delete-button absolute inset-0 flex items-center justify-center rounded-full bg-white"
                                >
                                  <IconTrash
                                    className="text-red-600 active:text-red-700"
                                    stroke={1.5}
                                    width={20}
                                    height={20}
                                  />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </ComboboxOptions>
                  </div>
                </Combobox>
              </Field>
            ) : (
              <>
                <span className="font-semibold">Job name:</span>{" "}
                <input
                  type="text"
                  value={editedJob?.name || ""}
                  onChange={(e) =>
                    handleJobPropertyChange("name", e.target.value)
                  }
                  className="w-24 rounded-lg border border-gray-300 bg-white py-2 px-2 text-left focus:outline-none focus:border-gray-400"
                />
              </>
            )}
          </div>
          {selectedJob && (
            <div className="flex items-center">
              <div>
                <span className="font-semibold">ID:</span>{" "}
                {isEditing ? (
                  <input
                    type="text"
                    value={editedJob?.id || ""}
                    onChange={(e) =>
                      handleJobPropertyChange("id", e.target.value)
                    }
                    className="w-24 rounded-lg border border-gray-300 bg-white py-2 px-2 text-left focus:outline-none focus:border-gray-400 mr-4"
                  />
                ) : (
                  <span className="mr-4">{selectedJob.id}</span>
                )}
              </div>
              <div>
                <span className="font-semibold">Section:</span>{" "}
                {isEditing ? (
                  <input
                    type="text"
                    value={editedJob?.section || ""}
                    onChange={(e) =>
                      handleJobPropertyChange("section", e.target.value)
                    }
                    className="w-24 rounded-lg border border-gray-300 bg-white py-2 px-2 text-left focus:outline-none focus:border-gray-400 mr-4"
                  />
                ) : (
                  <span className="mr-3">{selectedJob.section}</span>
                )}
              </div>
              {!isEditing ? (
                <div
                  className="px-2 py-2 rounded-full hover:bg-gray-100 active:bg-gray-200 cursor-pointer text-gray-600 font-medium flex items-center transition-colors duration-200"
                  onClick={toggleEditing}
                >
                  <IconEdit className="mr-1.5" />
                  <span>Edit</span>
                </div>
              ) : (
                <div className="flex border border-gray-300 rounded-lg">
                  <div
                    className="px-2 py-2 text-sky-500 hover:text-sky-600 active:text-sky-700 rounded-l-lg hover:bg-gray-100 active:bg-gray-200 cursor-pointer text-gray-600 font-medium flex items-center border-r border-gray-300 transition-colors duration-200"
                    onClick={handleSave}
                  >
                    <IconDeviceFloppy />
                  </div>
                  <div
                    className="px-2 py-2 text-rose-500 hover:text-rose-600 active:text-rose-700  rounded-r-lg hover:bg-gray-100 active:bg-gray-200 cursor-pointer text-gray-600 font-medium flex items-center transition-colors duration-200"
                    onClick={handleCancel}
                  >
                    <IconCancel />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <NewJobModal
          isOpen={showNewJobModal}
          onClose={handleNewJobModalClose}
          onJobAdded={handleJobAdded}
        />
        <DeleteDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={confirmDeleteJob}
          title="Delete Job"
          message="Are you sure you want to delete this job? This action cannot be undone."
        />
        {deleteError && (
          <div className="mb-4 text-rose-500 font-semibold">{deleteError}</div>
        )}
        {loading ? (
          <p className="mt-4 text-center">Loading...</p>
        ) : selectedJob && products.length > 0 ? (
          <div className="w-full">
            <div className="overflow-x-auto relative">
              <Table
                initialData={products}
                columns={productColumns.map((col) => ({
                  ...col,
                  type:
                    isEditing && col.type === "readonly" ? "string" : col.type,
                }))}
                onShowDeleteButton={() => {}}
                onDelete={handleDeleteProducts}
                onChange={handleDataChange}
                isEditing={isEditing}
              />
            </div>
          </div>
        ) : selectedJob ? (
          <p className="mt-4 text-center w-full">
            No products found for this job.
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default CatalogueJobPage;
