import React, { useState } from "react";
import { IconX, IconChevronDown, IconChevronUp } from "@tabler/icons-react";

interface CustomerOption {
  id: string;
  name: string;
}

interface CustomerFilterTagsProps {
  customers: string[];
  onRemove: (customerIds: string[]) => void;
  cachedCustomerOptions: CustomerOption[];
}

const CustomerFilterTags = ({
  customers,
  onRemove,
  cachedCustomerOptions,
}: CustomerFilterTagsProps) => {
  const [showAll, setShowAll] = useState(false);
  const INITIAL_SHOW_COUNT = 5;

  const visibleCustomers = showAll
    ? customers
    : customers.slice(0, INITIAL_SHOW_COUNT);

  const handleRemove = (customer: string) => {
    const filteredIds = customers
      .filter((c) => c !== customer)
      .map((c) => {
        const option = cachedCustomerOptions.find((opt) => opt.name === c);
        return option?.id;
      })
      .filter((id): id is string => id !== undefined);

    onRemove(filteredIds);
  };

  return (
    <div className="px-2.5 py-1">
      <div className="flex flex-wrap gap-2">
        {visibleCustomers.map((customer) => (
          <span
            key={customer}
            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-800 cursor-pointer"
            onClick={() => handleRemove(customer)}
          >
            {customer}
            <button 
              className="ml-1 text-sky-600 hover:text-sky-800"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(customer);
              }}
            >
              <IconX size={14} />
            </button>
          </span>
        ))}

        {customers.length > INITIAL_SHOW_COUNT && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors duration-200"
          >
            {showAll ? (
              <>
                Show Less
                <IconChevronUp size={14} className="ml-1" />
              </>
            ) : (
              <>
                +{customers.length - INITIAL_SHOW_COUNT} more
                <IconChevronDown size={14} className="ml-1" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default CustomerFilterTags;