import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerList } from "../../types/types";
import { IconTrash } from "@tabler/icons-react";

interface CustomerCardProps {
  customer: CustomerList;
  onDeleteClick: (customer: CustomerList) => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  onDeleteClick,
}) => {
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isTrashHovered, setIsTrashHovered] = useState(false);
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/catalogue/customer/${customer.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(customer);
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
      <div className="pr-8">
        <div className="mb-2">
          <h3 className="font-semibold">{customer.name}</h3>
          <div className="text-sm text-default-500">{customer.id}</div>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-sky-100 text-sky-800">
            {customer.salesman}
          </span>
        </div>
        <p className="text-sm">Phone no: {customer.phone_number || "-"}</p>
        <p className="text-sm">TIN: {customer.tin_number || "-"}</p>
        <p className="text-sm">ID Number: {customer.id_number || "-"}</p>
      </div>

      <div className="absolute inset-y-0 top-2 right-2">
        <div className="relative w-8 h-8">
          {isCardHovered && (
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

export default CustomerCard;
