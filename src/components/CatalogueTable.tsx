import React from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import NewJobModal from "./NewJobModal";

interface Data {
  id: string;
  name: string;
  section: string;
  location: string;
  products_services: string;
}

const initialData: Data[] = [
  {
    id: "001",
    name: "John Doe",
    section: "Engineering",
    location: "New York",
    products_services: "Web Applications",
  },
  {
    id: "002",
    name: "Jane Smith",
    section: "Product",
    location: "San Francisco",
    products_services: "Mobile Apps",
  },
  // Add more initial data as needed
];

const columnHelper = createColumnHelper<Data>();

const columns = [
  columnHelper.accessor("id", {
    header: "ID",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("section", {
    header: "Section",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("location", {
    header: "Location",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("products_services", {
    header: "Products/Services",
    cell: (info) => info.getValue(),
  }),
];

const CatalogueTable: React.FC = () => {
  const [data] = React.useState<Data[]>(initialData);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="ml-[16rem] p-8 w-auto">
      <NewJobModal />
      <table className="min-w-full bg-white border-collapse border-spacing-0">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-6 py-3 border border-b-2 border-gray-300 text-base leading-4 font-bold text-gray-600 uppercase tracking-wider text-left"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className="border border-gray-300 hover:bg-gray-100"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-6 py-4 whitespace-no-wrap border-b border-r border-gray-300"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CatalogueTable;
