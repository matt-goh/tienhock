// src/components/Catalogue/CustomerCard.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerList } from "../../types/types";
import {
  IconTrash,
  IconUser,
  IconPhone,
  IconId,
  IconFileInvoice,
  IconCheck,
  IconX,
} from "@tabler/icons-react";

interface CustomerCardProps {
  customer: CustomerList;
  onDeleteClick: (customer: CustomerList) => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  onDeleteClick,
}) => {
  const [isCardHovered, setIsCardHovered] = useState(false);
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/catalogue/customer/${customer.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(customer);
  };

  // Determine e-Invoice status based on having both tin_number and id_number
  const hasEInvoiceInfo =
    Boolean(customer.tin_number) && Boolean(customer.id_number);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${
        isCardHovered ? "border-sky-200 shadow-md" : "border-default-200"
      } transition-all duration-200 cursor-pointer bg-white font-sans`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Card Header */}
      <div
        className={`px-4 py-3 border-b ${
          isCardHovered
            ? "bg-sky-50 border-sky-100"
            : "bg-default-50 border-default-100"
        } transition-colors duration-200`}
      >
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-default-800 truncate tracking-tight text-base">
            {customer.name}
          </h3>
          <div className="absolute top-3 right-3">
            {isCardHovered && (
              <button
                onClick={handleDeleteClick}
                className="p-1.5 rounded-full bg-white hover:bg-rose-50 text-default-500 hover:text-rose-600 transition-colors duration-150 shadow-sm"
                title="Delete customer"
              >
                <IconTrash size={16} stroke={1.5} />
              </button>
            )}
          </div>
        </div>
        <div className="text-sm text-default-500 mt-0.5 flex items-center">
          <span className="truncate">{customer.id}</span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3.5">
        {/* Salesman field - Always show */}
        <div className="flex items-start">
          <IconUser
            size={16}
            className="text-default-400 mt-0.5 flex-shrink-0 mr-2"
          />
          <div className="text-sm text-default-700 flex-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 tracking-wide">
              {customer.salesman || "Unassigned"}
            </span>
          </div>
        </div>

        {/* Phone Number - Only if exists */}
        {customer.phone_number && (
          <div className="flex items-center">
            <IconPhone
              size={16}
              className="text-default-400 flex-shrink-0 mr-2"
            />
            <div className="text-sm text-default-700 flex-1 truncate font-medium tracking-tight">
              {customer.phone_number}
            </div>
          </div>
        )}

        {/* ID Number - Only if exists */}
        {customer.id_number && (
          <div className="flex items-center">
            <IconId size={16} className="text-default-400 flex-shrink-0 mr-2" />
            <div className="text-sm text-default-700 flex-1 truncate font-medium tracking-tight">
              {customer.id_number}
            </div>
          </div>
        )}

        {/* E-Invoice Status - Only show if ready*/}
        {hasEInvoiceInfo ? (
          <div className="flex items-center">
            <IconFileInvoice
              size={16}
              className="text-default-400 flex-shrink-0 mr-2"
            />
            <div className="flex items-center font-medium">
              <span className="text-sm text-default-700 mr-1">e-Invoice:</span>
              <span className="inline-flex items-center text-xs text-green-700 bg-green-100 rounded-full px-2 py-0.5 tracking-wide">
                <IconCheck size={12} className="mr-1" /> Ready
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CustomerCard;
