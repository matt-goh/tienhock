// src/App.tsx
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import React from "react";
import CatalogueProductPage from "./pages/CatalogueProductPage";
import CatalogueJobPage from "./pages/CatalogueJobPage";
import CataloguePage from "./pages/CataloguePage";
import Sidebar from "./components/Sidebar";

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
        <main className="flex justify-center w-full">
          <Routes>
            <Route path="/catalogue/job" element={<CatalogueJobPage />} />
            <Route
              path="/catalogue/product"
              element={<CatalogueProductPage />}
            />
            <Route
              path="/catalogue/section"
              element={
                <CataloguePage
                  title="Section Catalogue"
                  apiEndpoint="sections"
                  tableKey="catalogueSection"
                />
              }
            />
            <Route
              path="/catalogue/location"
              element={
                <CataloguePage
                  title="Location Catalogue"
                  apiEndpoint="locations"
                  tableKey="catalogueLocation"
                />
              }
            />
            <Route
              path="/catalogue/nationality"
              element={
                <CataloguePage
                  title="Nationality Catalogue"
                  apiEndpoint="nationalities"
                  tableKey="catalogueNationality"
                />
              }
            />
            <Route
              path="/catalogue/race"
              element={
                <CataloguePage
                  title="Race Catalogue"
                  apiEndpoint="races"
                  tableKey="catalogueRace"
                />
              }
            />
            <Route
              path="/catalogue/agama"
              element={
                <CataloguePage
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
