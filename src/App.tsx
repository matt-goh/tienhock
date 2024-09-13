import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import React from "react";
import Sidebar from "./components/Sidebar";
import { routes } from "./components/SidebarData";
import "./index.css";

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
        <aside className="sidebar-hidden">
          <Sidebar />
        </aside>
        <main className="flex justify-center w-full py-[60px]">
          <Routes>
            {routes.map((route: any) => (
              <Route
                key={route.path}
                path={route.path}
                element={React.createElement(route.component)}
              />
            ))}
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
