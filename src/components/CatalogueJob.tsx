import React, { useState, useEffect, Fragment } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
  Transition,
  Label,
  Field,
} from "@headlessui/react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import Table from "./Table";
import { ColumnConfig, Job, Product } from "../types/types";
import NewJobModal from "./NewJobModal";

type JobSelection = Job | null;

const CatalogueJob: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewJobModal, setShowNewJobModal] = useState(false);

  const productColumns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly", width: 50 },
    { id: "name", header: "Name", type: "readonly" },
    { id: "amount", header: "Amount", type: "readonly", width: 50 },
    { id: "remark", header: "Remark", type: "readonly", width: 300 },
  ];

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (selectedJob) {
      fetchProducts(selectedJob.id);
    } else {
      setProducts([]);
    }
  }, [selectedJob]);

  useEffect(() => {
    if (jobs.length > 0 && !selectedJob) {
      setSelectedJob(jobs[0]);
    }
  }, [jobs]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5000/api/jobs");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
      setJobs(data);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (jobId: string) => {
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
    } finally {
      setLoading(false);
    }
  };

  const handleJobAdded = () => {
    fetchJobs();
    setSelectedJob(null);
    setShowNewJobModal(false);
  };

  const handleJobSelection = (selection: Job | "add") => {
    if (selection === "add") {
      setShowNewJobModal(true);
    } else {
      setSelectedJob(selection);
    }
  };

  const handleDeleteProducts = async (selectedIds: string[]) => {
    if (!selectedJob) return;

    try {
      for (const productId of selectedIds) {
        // First, remove the association from the job_products table
        await fetch(`http://localhost:5000/api/job_products`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jobId: selectedJob.id,
            productId: productId,
          }),
        });

        // Then, delete the product itself
        await fetch(`http://localhost:5000/api/products/${productId}`, {
          method: "DELETE",
        });
      }

      // Refresh products after deletion
      await fetchProducts(selectedJob.id);
    } catch (error) {
      console.error("Error deleting products:", error);
      // Handle error (e.g., show error message to user)
    }
  };

  return (
    <div className={`flex justify-center py-[60px]`}>
      <div className="flex flex-col items-start w-full max-w-4xl px-4">
        <div className={`w-full text-lg font-medium text-gray-700 mb-4`}>
          Job Catalogue
        </div>
        <div
          className={`w-full flex justify-center items-center space-x-4 mb-4`}
        >
          <div className={`${selectedJob ? "w-48" : "w-full max-w-xs"}`}>
            <Field>
              <Listbox value={selectedJob} onChange={handleJobSelection}>
                {({ open }) => (
                  <div className="relative">
                    <ListboxButton
                      className={`relative w-full cursor-default rounded-lg border border-gray-300 bg-white py-2 pl-4 pr-10 text-left focus:outline-none focus:border-gray-400`}
                    >
                      <span className="block truncate">
                        {selectedJob ? selectedJob.name : "Select a job"}
                      </span>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <IconChevronDown
                          className="h-5 w-5 text-gray-400"
                          aria-hidden="true"
                        />
                      </span>
                    </ListboxButton>
                    <Transition
                      show={open}
                      as={Fragment}
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <ListboxOptions
                        static
                        className="absolute z-20 w-full p-1 mt-11 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg"
                      >
                        <ListboxOption
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 pl-4 pr-4 text-left ${
                              active
                                ? "bg-gray-100 text-gray-900"
                                : "text-gray-900"
                            }`
                          }
                          value="add"
                        >
                          {({ selected }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-medium" : "font-normal"
                                }`}
                              >
                                + Add Job
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
                                  <IconCheck
                                    stroke={2}
                                    width="22"
                                    height="22"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                        {jobs.map((job) => (
                          <ListboxOption
                            key={job.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none rounded text-left py-2 pl-4 pr-4 ${
                                active
                                  ? "bg-gray-100 text-gray-900"
                                  : "text-gray-900"
                              }`
                            }
                            value={job}
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
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
                                    <IconCheck
                                      stroke={2}
                                      width="22"
                                      height="22"
                                    />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </Transition>
                  </div>
                )}
              </Listbox>
            </Field>
          </div>
          {selectedJob && (
            <>
              <div className="">
                <span className="font-semibold">ID:</span>{" "}
                <span>{selectedJob.id}</span>
              </div>
              <div className="">
                <span className="font-semibold">Section:</span>{" "}
                <span>{selectedJob.section}</span>
              </div>
            </>
          )}
        </div>

        <NewJobModal
          isOpen={showNewJobModal}
          onClose={() => setShowNewJobModal(false)}
          onJobAdded={handleJobAdded}
        />
        {loading ? (
          <p className="mt-4 text-center">Loading...</p>
        ) : selectedJob && products.length > 0 ? (
          <div className="w-full">
            <div className="overflow-x-auto relative">
              <Table
                initialData={products}
                columns={productColumns}
                onShowDeleteButton={() => {}}
                onDelete={handleDeleteProducts}
              />
            </div>
          </div>
        ) : selectedJob ? (
          <p className="mt-4 text-center">No products found for this job.</p>
        ) : null}
      </div>
    </div>
  );
};

export default CatalogueJob;
