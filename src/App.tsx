import {
  Route,
  BrowserRouter,
  Routes,
  useLocation,
  Navigate,
} from "react-router-dom";
import React from "react";
import { Toaster } from "react-hot-toast";
import { routes } from "./pages/pagesRoute";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import Login from "./pages/Auth/Login";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import Navbar from "./components/Navbar/Navbar";
import "./index.css";
import LoadingSpinner from "./components/LoadingSpinner";
import HomePage from "./pages/HomePage";

const Layout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const isPDFRoute = location.pathname === "/pdf-viewer";
  const isLoginRoute = location.pathname === "/login";

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const showNavbar = isAuthenticated && !isPDFRoute;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Show navbar if authenticated and not on PDF route */}
      {showNavbar && <Navbar />}

      <main
        className={`
          flex-1 overflow-y-auto
          flex justify-center w-full
          ${!isPDFRoute && !isLoginRoute ? "pt-6" : ""}
        `}
      >
        <Routes>
          {/* Login route */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
          />

          {/* Home route */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />

          {/* Company-specific home routes */}
          <Route
            path="/greentarget"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/jellypolly"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />

          {/* All routes from all companies */}
          {routes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <ProtectedRoute>
                  {React.createElement(route.component)}
                </ProtectedRoute>
              }
            />
          ))}
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <CompanyProvider>
          <Toaster
            position="top-right"
            containerStyle={{
              top: 80, // Offset for navbar height (64px) + margin
            }}
            toastOptions={{
              style: {
                padding: "12px",
                fontSize: "0.875rem",
                lineHeight: "1.25rem",
                fontWeight: 500,
              },
            }}
          />
          <Layout />
        </CompanyProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
