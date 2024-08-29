// src/App.tsx
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import React from "react";
import CatalogueStaffFormPage from "./pages/CatalogueStaffFormPage";
import CatalogueProductPage from "./pages/CatalogueJobCategoryPage";
import CatalogueBasicPage from "./pages/CatalogueBasicPage";
import CatalogueStaffPage from "./pages/CatalogueStaffPage";
import CatalogueJobPage from "./pages/CatalogueJobPage";
import Sidebar from "./components/Sidebar";
import CatalogueTaxPage from "./pages/CatalogueTaxPage";

const App: React.FC = () => {
  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            padding: "12px",
            fontSize: "0.875rem",
            lineHeight: "1.25rem",
            fontWeight: 500,
          },
        }}
      />
      <div className="flex">
        <aside className="hidden xl:flex">
          <Sidebar />
        </aside>
        <main className="flex justify-center w-full py-[60px]">
          <Routes>
            <Route path="/catalogue/staff" element={<CatalogueStaffPage />} />
            <Route
              path="/catalogue/staff/new"
              element={<CatalogueStaffFormPage />}
            />
            <Route
              path="/catalogue/staff/:id"
              element={<CatalogueStaffFormPage />}
            />
            <Route path="/catalogue/job" element={<CatalogueJobPage />} />
            <Route
              path="/catalogue/product"
              element={<CatalogueProductPage />}
            />
            <Route
              path="/catalogue/section"
              element={
                <CatalogueBasicPage
                  title="Section Catalogue"
                  apiEndpoint="sections"
                  tableKey="catalogueSection"
                />
              }
            />
            <Route
              path="/catalogue/location"
              element={
                <CatalogueBasicPage
                  title="Location Catalogue"
                  apiEndpoint="locations"
                  tableKey="catalogueLocation"
                />
              }
            />
            <Route
              path="/catalogue/bank"
              element={
                <CatalogueBasicPage
                  title="Bank Catalogue"
                  apiEndpoint="banks"
                  tableKey="catalogueBank"
                />
              }
            />
            <Route path="/catalogue/tax" element={<CatalogueTaxPage />} />
            <Route
              path="/catalogue/nationality"
              element={
                <CatalogueBasicPage
                  title="Nationality Catalogue"
                  apiEndpoint="nationalities"
                  tableKey="catalogueNationality"
                />
              }
            />
            <Route
              path="/catalogue/race"
              element={
                <CatalogueBasicPage
                  title="Race Catalogue"
                  apiEndpoint="races"
                  tableKey="catalogueRace"
                />
              }
            />
            <Route
              path="/catalogue/agama"
              element={
                <CatalogueBasicPage
                  title="Agama Catalogue"
                  apiEndpoint="agamas"
                  tableKey="catalogueAgama"
                />
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
