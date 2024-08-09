import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconChevronLeft } from "@tabler/icons-react";
import Tab from "../components/Tab"; // Make sure this path is correct

const CatalogueAddStaffPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    // ... (previous form data state)
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("New staff data:", formData);
    navigate("/catalogue/staff");
  };

  const renderInput = (name: string, label: string, type: string = "text") => (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        type={type}
        id={name}
        name={name}
        value={formData[name as keyof typeof formData]}
        onChange={handleInputChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
      />
    </div>
  );

  return (
    <div className="container mx-auto px-4">
      <button
        onClick={() => navigate("/catalogue/staff")}
        className="ml-3 mb-6 pl-2.5 pr-4 py-2 flex items-center font-medium hover:bg-gray-100 active:bg-gray-200 rounded-full text-gray-700 hover:text-gray-800 transition-colors duration-200"
      >
        <IconChevronLeft className="mr-1" size={20} />
        Back
      </button>
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-gray-900">Add New Staff</h1>
          <p className="mt-1 text-sm text-gray-500">
            Masukkan maklumat kakitangan baharu di sini. Klik "Save" apabila
            anda selesai.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="pl-6 pt-5">
            <Tab
              labels={[
                "Personal and contact data",
                "Work data",
                "Documents",
                "Additional data",
              ]}
            >
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("id", "ID")}
                  {renderInput("name", "Name")}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("telephoneNo", "Telephone Number")}
                  {renderInput("email", "Email", "email")}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("gender", "Gender")}
                  {renderInput("nationality", "Nationality")}
                  {renderInput("birthdate", "Birthdate", "date")}
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {renderInput("address", "Address")}
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("job", "Job")}
                  {renderInput("location", "Location")}
                  {renderInput("dateJoined", "Date Joined", "date")}
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("icNo", "IC Number")}
                  {renderInput("bankAccountNumber", "Bank Account Number")}
                  {renderInput("epcNo", "EPC Number")}
                  {renderInput("incomeTaxNo", "Income Tax Number")}
                  {renderInput("socsoNo", "SOCSO Number")}
                  {renderInput("document", "Document")}
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("paymentType", "Payment Type")}
                  {renderInput("paymentPreference", "Payment Preference")}
                  {renderInput("race", "Race")}
                  {renderInput("agama", "Agama")}
                  {renderInput("dateResigned", "Date Resigned", "date")}
                </div>
              </div>
            </Tab>
          </div>
          <div className="mt-8 py-3 text-right">
            <button
              type="submit"
              className="px-5 py-2 border border-gray-300 rounded-full font-medium text-base text-gray-700 hover:bg-gray-100 hover:text-gray-800 active:text-gray-900 active:bg-gray-200 transition-colors duration-200"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CatalogueAddStaffPage;
