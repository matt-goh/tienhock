"use client";

import {
  IconBookmark,
  IconBuildingFactory2,
  IconChevronRight,
  IconFileInvoice,
  IconInvoice,
  IconListDetails,
  IconPackage,
  IconReportMoney,
} from "@tabler/icons-react";
import React, { useState } from "react";

const Popover: React.FC<{ options: { name: string; link: string }[] }> = ({
  options,
}) => {
  return (
    <div className="absolute left-full top-0 ml-2 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
      <ul className="p-2">
        {options.map((option, index) => (
          <li key={index} className="py-1 px-4 hover:bg-gray-100 rounded-lg">
            <a href={option.link} className="block">
              {option.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Sidebar: React.FC = () => {
  const [openItems, setOpenItems] = useState<string[]>(["bookmarks"]);
  const [openPayrollOptions, setOpenPayrollOptions] = useState<string[]>([]);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const handleToggle = (item: string) => {
    setOpenItems((prevItems) =>
      prevItems.includes(item)
        ? prevItems.filter((i) => i !== item)
        : [...prevItems, item]
    );
  };

  const handlePayrollToggle = (option: string) => {
    setOpenPayrollOptions((prevOptions) =>
      prevOptions.includes(option)
        ? prevOptions.filter((i) => i !== option)
        : [...prevOptions, option]
    );
  };

  return (
    <div className="relative">
      <div
        className={`fixed top-0 left-0 h-full bg-gray-100 transition-transform transform w-[240px]`}
      >
        <div className="pt-4 text-gray-500 font-medium text-left">
          <h2 className="text-xl font-bold pl-4">Tien Hock</h2>
          <ul className="mt-4 space-y-2 text-base">
            <li className="m-2">
              <button
                onClick={() => handleToggle("bookmarks")}
                className="block flex py-2 pl-4 hover:bg-gray-200 active:bg-gray-300 transition-colors hover:text-gray-600 rounded-lg focus:outline-none w-full text-left"
              >
                <IconBookmark stroke={1.5} />
                <span className="font-semibold ml-2">Bookmarks</span>
              </button>
            </li>
            <li className="m-2">
              <button
                onClick={() => handleToggle("payroll")}
                className="block flex py-2 pl-4 hover:bg-gray-200 active:bg-gray-300 transition-colors hover:text-gray-600 rounded-lg focus:outline-none w-full text-left"
              >
                <IconReportMoney stroke={1.5} />
                <span className="font-semibold ml-2">Payroll</span>
              </button>
              {openItems.includes("payroll") && (
                <ul className="mt-2 space-y-1">
                  <li className="relative">
                    <button
                      onClick={() => handlePayrollToggle("production")}
                      className="flex group justify-between items-center block py-2 pl-7 pr-2 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg w-full text-left focus:outline-none"
                    >
                      <span className="flex">
                        <IconBuildingFactory2
                          stroke={1.5}
                          className="icon icon-tabler icons-tabler-outline icon-tabler-building-factory-2 mr-2"
                        />
                        Production
                      </span>
                      <IconChevronRight
                        width="20"
                        height="20"
                        stroke={2}
                        className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right absolute right-2 transform transition-all duration-300 ${
                          openPayrollOptions.includes("production")
                            ? "rotate-90"
                            : ""
                        } opacity-0 group-hover:opacity-100`}
                      />
                    </button>
                    {openPayrollOptions.includes("production") && (
                      <ul className="mt-1 space-y-1">
                        <li
                          className="relative"
                          onMouseEnter={() => setHoveredOption("mee")}
                          onMouseLeave={() => setHoveredOption(null)}
                        >
                          <a
                            href=""
                            className="block flex items-center py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                          >
                            <svg width="24" height="24" className="mr-2"></svg>
                            Mee
                            <IconChevronRight
                              width="20"
                              height="20"
                              stroke={2}
                              className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                            />
                          </a>
                          {hoveredOption === "mee" && (
                            <Popover
                              options={[
                                { name: "Mee Option 1", link: "#" },
                                { name: "Mee Option 2", link: "#" },
                              ]}
                            />
                          )}
                        </li>
                        <li
                          className="relative"
                          onMouseEnter={() => setHoveredOption("bihun")}
                          onMouseLeave={() => setHoveredOption(null)}
                        >
                          <a
                            href=""
                            className="block flex items-center py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                          >
                            <svg width="24" height="24" className="mr-2"></svg>
                            Bihun
                            <IconChevronRight
                              width="20"
                              height="20"
                              stroke={2}
                              className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                            />
                          </a>
                          {hoveredOption === "bihun" && (
                            <Popover
                              options={[
                                { name: "Bihun Option 1", link: "#" },
                                { name: "Bihun Option 2", link: "#" },
                              ]}
                            />
                          )}
                        </li>
                      </ul>
                    )}
                  </li>
                  <li className="relative">
                    <button
                      onClick={() => handlePayrollToggle("pinjam")}
                      className="flex group justify-between items-center block py-2 pl-7 pr-2 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg w-full text-left focus:outline-none"
                    >
                      <span className="flex">
                        <IconInvoice stroke={1.5} className="mr-2" />
                        Pinjam
                      </span>
                      <IconChevronRight
                        width="20"
                        height="20"
                        stroke={2}
                        className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right absolute right-2 transform transition-all duration-300 ${
                          openPayrollOptions.includes("pinjam")
                            ? "rotate-90"
                            : ""
                        } opacity-0 group-hover:opacity-100`}
                      />
                    </button>
                    {openPayrollOptions.includes("pinjam") && (
                      <ul className="mt-1 space-y-1">
                        <li>
                          <a
                            href=""
                            className="block flex items-center py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                          >
                            <svg width="24" height="24" className="mr-2"></svg>
                            Entry
                            <IconChevronRight
                              width="20"
                              height="20"
                              stroke={2}
                              className={`absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                            />
                          </a>
                        </li>
                        <li>
                          <a
                            href=""
                            className="block flex items-center py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                          >
                            <svg width="24" height="24" className="mr-2"></svg>
                            Summary
                            <IconChevronRight
                              width="20"
                              height="20"
                              stroke={2}
                              className={`absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                            />
                          </a>
                        </li>
                      </ul>
                    )}
                  </li>
                </ul>
              )}
            </li>
            <li className="m-2">
              <button
                onClick={() => handleToggle("stock")}
                className="block flex py-2 pl-4 hover:bg-gray-200 active:bg-gray-300 transition-colors hover:text-gray-600 rounded-lg focus:outline-none w-full text-left"
              >
                <IconPackage stroke={1.5} />
                <span className="ml-2 font-semibold">Stock</span>
              </button>
              {openItems.includes("stock") && (
                <ul className="mt-2 space-y-1">
                  <li>
                    <a
                      href=""
                      className="block flex py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                    >
                      <svg width="24" height="24" className="mr-2"></svg>
                      Opening
                      <IconChevronRight
                        width="20"
                        height="20"
                        stroke={2}
                        className={`absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                      />
                    </a>
                  </li>
                  <li>
                    <a
                      href=""
                      className="block flex py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                    >
                      <svg width="24" height="24" className="mr-2"></svg>
                      Card
                      <IconChevronRight
                        width="20"
                        height="20"
                        stroke={2}
                        className={`absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                      />
                    </a>
                  </li>
                </ul>
              )}
            </li>
            <li className="m-2">
              <button
                onClick={() => handleToggle("statement")}
                className="block flex py-2 pl-4 hover:bg-gray-200 active:bg-gray-300 transition-colors hover:text-gray-600 rounded-lg focus:outline-none w-full text-left"
              >
                <IconFileInvoice stroke={1.5} />
                <span className="font-semibold ml-2">Statement</span>
              </button>
              {openItems.includes("statement") && (
                <ul className="mt-2 space-y-1">
                  <li>
                    <a
                      href=""
                      className="block flex py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                    >
                      <svg width="24" height="24" className="mr-2"></svg>
                      Option 1
                      <IconChevronRight
                        width="20"
                        height="20"
                        stroke={2}
                        className={`absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                      />
                    </a>
                  </li>
                  <li>
                    <a
                      href=""
                      className="block flex py-2 pl-7 hover:bg-gray-200 active:bg-gray-300 transition-colors rounded-lg focus:outline-none"
                    >
                      <svg width="24" height="24" className="mr-2"></svg>
                      Option 2
                      <IconChevronRight
                        width="20"
                        height="20"
                        stroke={2}
                        className={`absolute right-2 transform transition-all duration-300 group-hover:opacity-100`}
                      />
                    </a>
                  </li>
                </ul>
              )}
            </li>
            <li className="m-2">
              <button
                onClick={() => handleToggle("bookmarks")}
                className="block flex py-2 pl-4 hover:bg-gray-200 active:bg-gray-300 transition-colors hover:text-gray-600 rounded-lg focus:outline-none w-full text-left"
              >
                <IconListDetails stroke={1.5} />
                <span className="font-semibold ml-2">Catalogue</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
