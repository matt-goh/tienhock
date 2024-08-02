import React, { useState, useEffect, Fragment, useCallback } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Field,
} from "@headlessui/react";
import { IconCheck, IconChevronDown, IconTrash } from "@tabler/icons-react";
import _ from "lodash";
import Table from "../components/Table";
import { ColumnConfig, Job, Product } from "../types/types";
import NewJobModal from "../components/NewJobModal";
import DeleteDialog from "../components/DeleteDialog";
import toast from "react-hot-toast";

type JobSelection = Job | null;

const CatalogueJobPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [editedJob, setEditedJob] = useState<Job | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [originalProducts] = useState<Product[]>([]);
  const [originalJobState, setOriginalJobState] = useState<{
    job: Job | null;
    products: Product[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [hoveredJob, setHoveredJob] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
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
      toast.error("Failed to fetch jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedJob]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const fetchProducts = useCallback(async (jobId: string) => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:5000/api/jobs/${jobId}/products`
      );
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJob) {
      fetchProducts(selectedJob.id);
      setEditedJob(selectedJob);
    } else {
      setProducts([]);
      setEditedJob(null);
    }
  }, [selectedJob, fetchProducts]);

  const handleJobAdded = useCallback(async (newJob: Omit<Job, "id">) => {
    try {
      const response = await fetch("http://localhost:5000/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newJob),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message);
      }

      const data = await response.json();
      setJobs((prevJobs) => [...prevJobs, data.job]);
      setSelectedJob(data.job);
      setShowNewJobModal(false);
      toast.success("Job added successfully");
    } catch (error) {
      console.error("Error adding job:", error);
      toast.error(
        (error as Error).message || "Failed to add job. Please try again."
      );
    }
  }, []);

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
        toast.error(
          `Cannot delete job. There are still ${count} product(s) associated with this job. Please delete all associated products first.`
        );
      } else {
        setJobToDelete(job);
        setShowDeleteDialog(true);
      }
    } catch (error) {
      console.error("Error checking associated products:", error);
      toast.error("An error occurred while checking associated products.");
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
      toast.success("Job deleted successfully");
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("An error occurred while deleting the job.");
    }
  }, [jobToDelete, selectedJob]);

  const isRowFromDatabase = useCallback((product: Product) => {
    return (
      product.id !== undefined &&
      product.id !== null &&
      !product.id.startsWith("new_")
    );
  }, []);

  const handleDeleteProducts = useCallback(
    async (selectedIndices: number[]) => {
      if (!selectedJob) {
        return;
      }

      const sortedIndices = selectedIndices.sort((a, b) => b - a);
      const productsToDeleteFromDB: string[] = [];
      let updatedProducts = [...products];

      for (const index of sortedIndices) {
        const product = updatedProducts[index];
        if (isRowFromDatabase(product)) {
          productsToDeleteFromDB.push(product.id);
        }
        updatedProducts.splice(index, 1);
      }

      // Update local state immediately
      setProducts(updatedProducts);

      if (productsToDeleteFromDB.length > 0) {
        try {
          const response = await fetch(`http://localhost:5000/api/products`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: productsToDeleteFromDB }),
          });

          if (!response.ok) {
            throw new Error("Failed to delete products on the server");
          }

          toast.success("Selected products deleted successfully");
        } catch (error) {
          console.error("Error deleting selected products:", error);
          toast.error(
            "Failed to delete some products from the server. Please try again."
          );
          // Refresh products from the server in case of error
          await fetchProducts(selectedJob.id);
          return;
        }
      } else {
        toast.success("Selected rows removed");
      }

      // Ensure the Table component is updated with the new data
      handleDataChange(updatedProducts);
    },
    [selectedJob, products, isRowFromDatabase, fetchProducts]
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

  // TE
  const toggleEditing = useCallback(() => {
    setIsEditing((prev) => {
      if (!prev) {
        // Entering edit mode
        setOriginalJobState({
          job: editedJob ? _.cloneDeep(editedJob) : null,
          products: _.cloneDeep(products),
        });
      }
      return !prev;
    });
  }, [editedJob, products]);

  const handleCancel = useCallback(() => {
    if (originalJobState) {
      setEditedJob(originalJobState.job);
      setProducts(originalJobState.products);
    }
    setIsEditing(false);
  }, [originalJobState]);

  // HS
  const handleSave = useCallback(async () => {
    if (!editedJob) return;

    // Check for empty job ID
    if (!editedJob.id.trim()) {
      toast.error("Job ID cannot be empty");
      return;
    }

    // Check for duplicate job ID
    const isDuplicateJobId = jobs.some(
      (job) => job.id === editedJob.id && job.id !== selectedJob?.id
    );
    if (isDuplicateJobId) {
      toast.error("A job with this ID already exists");
      return;
    }

    // Check for empty product IDs
    const emptyProductId = products.find((product) => !product.id.trim());
    if (emptyProductId) {
      toast.error("Product ID cannot be empty");
      return;
    }

    // Check for duplicate product IDs
    const productIds = new Set();
    const duplicateProductId = products.find((product) => {
      if (productIds.has(product.id)) {
        return true;
      }
      productIds.add(product.id);
      return false;
    });

    if (duplicateProductId) {
      toast.error(`Duplicate product ID: ${duplicateProductId.id}`);
      return;
    }

    try {
      // Update job
      const jobResponse = await fetch(
        `http://localhost:5000/api/jobs/${selectedJob?.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editedJob.name,
            section: editedJob.section,
            newId: editedJob.id !== selectedJob?.id ? editedJob.id : undefined,
          }),
        }
      );

      if (!jobResponse.ok) {
        const errorData = await jobResponse.json();
        throw new Error(errorData.message);
      }

      const updatedJob = await jobResponse.json();

      // Send all products to the server
      const productsResponse = await fetch(
        "http://localhost:5000/api/products/batch",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: updatedJob.job.id,
            products: products.map((product) => ({
              ...product,
              newId:
                product.id !==
                originalProducts.find((p) => p.id === product.id)?.id
                  ? product.id
                  : undefined,
            })),
          }),
        }
      );

      if (!productsResponse.ok) {
        const errorData = await productsResponse.json();
        throw new Error(
          `Failed to update/insert products: ${errorData.message}`
        );
      }

      const result = await productsResponse.json();

      // Update local state with the result from the server
      setProducts(result.products);
      setSelectedJob(updatedJob.job);
      setJobs((jobs) =>
        jobs.map((job) => (job.id === selectedJob?.id ? updatedJob.job : job))
      );
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [editedJob, selectedJob, products, jobs, originalProducts]);

  // HJPC
  const handleJobPropertyChange = useCallback(
    (property: keyof Job, value: string) => {
      if (editedJob) {
        setEditedJob(
          (prev) =>
            ({
              ...prev!,
              [property]: value,
              newId: property === "id" ? value : prev!.id,
            } as Job)
        );
      }
    },
    [editedJob]
  );

  // HDC
  const handleDataChange = useCallback(
    (updatedData: Product[]) => {
      setTimeout(() => setProducts(updatedData), 0);

      const newChangedProducts = new Set<string>();
      updatedData.forEach((product, index) => {
        const originalProduct = originalProducts[index];

        if (!originalProduct) {
          newChangedProducts.add(product.id);
        } else if (
          product.id !== originalProduct.id ||
          product.name !== originalProduct.name ||
          product.amount !== originalProduct.amount ||
          product.remark !== originalProduct.remark
        ) {
          newChangedProducts.add(product.id);
        }
      });

      // Trigger a re-render of the Table component
      setTimeout(() => setProducts([...updatedData]), 0);
    },
    [originalProducts]
  );

  return (
    <div className={`flex justify-center py-[60px]`}>
      <div className="flex flex-col items-start max-w-4xl">
        <div className={`w-full text-lg text-center font-medium text-gray-700 mb-4`}>
          Job Catalogue
        </div>
        <div className={`w-full flex justify-start items-center mb-4`}>
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
                            className="absolute inset-y-0 right-0 flex items-center pr-2 my-2 z-10"
                            onMouseEnter={() => setHoveredJob(job.id)}
                            onMouseLeave={() => setHoveredJob(null)}
                          >
                            <div className="relative w-8 h-8 flex items-center justify-center">
                              {hoveredJob === job.id && (
                                <button
                                  onClick={(e) => handleDeleteJob(job, e)}
                                  className="delete-button absolute inset-0 flex items-center justify-center rounded-lg bg-white hover:bg-gray-100 active:bg-gray-200 focus:outline-none"
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
        {loading ? (
          <p className="mt-4 text-center">Loading...</p>
        ) : selectedJob && products.length > 0 ? (
          <div className="w-full">
            <div className="relative">
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
                onToggleEditing={toggleEditing}
                onSave={handleSave}
                onCancel={handleCancel}
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
