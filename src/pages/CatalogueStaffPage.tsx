import { useState } from "react";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react";
import { useNavigate } from 'react-router-dom';

const sampleEmployees = [
  {
    id: 1,
    name: "Toni Kross",
    role: "Product Designer",
    department: "Designer",
    management: "Management",
    empCode: "01102021-7437",
    joiningDate: "03-Jan-2022",
  },
  {
    id: 2,
    name: "Wade Warren",
    role: "ISO Developer",
    department: "Developer",
    management: "Non-Management",
    empCode: "7569768-673",
    joiningDate: "11-Jan-2021",
  },
  {
    id: 3,
    name: "Leslie Alexander",
    role: "Web Designer",
    department: "Developer",
    management: "Non-Management",
    empCode: "647637-009",
    joiningDate: "08-Feb-2022",
  },
  {
    id: 4,
    name: "Robert Fox",
    role: "UX/UI Designer",
    department: "Designer",
    management: "Non-Management",
    empCode: "6656647-6137",
    joiningDate: "01-Aug-2021",
  },
  // Add more sample employees here...
];

type Employee = {
  id: number;
  name: string;
  role: string;
  department: string;
  management: string;
  empCode: string;
  joiningDate: string;
};

const EmployeeCard = ({ employee }: { employee: Employee }) => (
  <div
    className="hover:bg-gray-100 active:bg-gray-200 border text-left rounded-lg p-4 transition-all duration-200 cursor-pointer"
    onClick={() => {}}
  >
    <div className="mb-2">
      <h3 className="font-semibold">{employee.name}</h3>
      <p className="text-sm text-gray-500">{employee.role}</p>
    </div>
    <div className="flex space-x-2 mb-2">
      <span className="bg-sky-100 text-sky-800 text-xs font-medium px-2.5 py-0.5 rounded">
        {employee.department}
      </span>
      <span className="bg-teal-100 text-teal-800 text-xs font-medium px-2.5 py-0.5 rounded">
        {employee.management}
      </span>
    </div>
    <p className="text-sm">IC: {employee.empCode}</p>
    <p className="text-sm">Phone no: {employee.joiningDate}</p>
  </div>
);

const CatalogueStaffPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  const filteredEmployees = sampleEmployees.filter((employee) =>
    employee.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl text-gray-700 font-bold">
          Staffs ({sampleEmployees.length})
        </h1>
        <div className="flex">
          <button
            className="flex items-center px-4 py-2 font-medium text-gray-700 border rounded-full hover:bg-gray-100 hover:text-gray-800 active:text-gray-900 active:bg-gray-200 transition-colors duration-200"
            onClick={() => navigate("/catalogue/staff/new")}
          >
            <IconPlus stroke={2} size={18} className="mr-2" />
            Add New
          </button>
        </div>
      </div>

      <div className="flex mb-6">
        <div className="relative flex-grow mr-4">
          <IconSearch
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={22}
          />
          <input
            type="text"
            placeholder="Search"
            className="w-full pl-11 pr-4 py-2 border focus:border-gray-500 rounded-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="px-4 py-2 border rounded-full text-gray-600 hover:bg-gray-100">
          Filters
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredEmployees.map((employee) => (
          <EmployeeCard key={employee.id} employee={employee} />
        ))}
      </div>

      <div className="mt-6 flex justify-between items-center text-gray-700">
        <button className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-gray-100 active:bg-gray-200 hover:bg-accent hover:text-accent-foreground">
          <IconChevronLeft className="w-5 h-5 mr-2" /> Previous
        </button>
        <div className="flex space-x-2">
          {[1, 2, 3, "...", 8, 9, 10].map((page, index) => (
            <button
              key={index}
              className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-gray-100 active:bg-gray-200 ${
                page === 1
                  ? "border border-gray-200 font-semibold"
                  : "font-medium"
              }`}
            >
              {page}
            </button>
          ))}
        </div>
        <button className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-gray-100 active:bg-gray-200 hover:bg-accent hover:text-accent-foreground">
          Next <IconChevronRight className="w-5 h-5 ml-2" />
        </button>
      </div>
    </div>
  );
};

export default CatalogueStaffPage;
