import {
  Route,
  BrowserRouter,
  Routes,
  useLocation,
  Navigate,
  matchPath,
} from "react-router-dom";
import React from "react";
import { Toaster } from "react-hot-toast";
import { routes, type RouteItem } from "./pages/pagesRoute";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Login from "./pages/Auth/Login";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import Navbar from "./components/Navbar/Navbar";
import "./index.css";
import LoadingSpinner from "./components/LoadingSpinner";
import HomePage from "./pages/HomePage";
import GreenTargetDashboardPage from "./pages/GreenTarget/GreenTargetDashboardPage";
import CustomerSignupPage from "./pages/GreenTarget/PublicForm/CustomerSignupPage";

const GT_SIGNUP_PREVIEW_PATH = "/greentarget/dev/customer-signup-preview";

const getCompanyNameFromPath = (pathname: string): string => {
  if (pathname.startsWith("/greentarget")) {
    return "Green Target";
  }

  if (pathname.startsWith("/jellypolly")) {
    return "Jelly Polly";
  }

  return "Tien Hock";
};

const getDocumentTitle = (pathname: string): string => {
  const companyName: string = getCompanyNameFromPath(pathname);

  if (pathname === "/login") {
    return "Login | Tien Hock ERP";
  }

  if (
    pathname === "/" ||
    pathname === "/greentarget" ||
    pathname === "/jellypolly"
  ) {
    return `Dashboard | ${companyName} ERP`;
  }

  if (pathname === "/pdf-viewer") {
    return `PDF Viewer | ${companyName} ERP`;
  }

  const matchingRoute: RouteItem | undefined = routes.find(
    (route: RouteItem): boolean =>
      matchPath({ path: route.path, end: true }, pathname) !== null
  );

  return matchingRoute
    ? `${matchingRoute.name} | ${companyName} ERP`
    : `${companyName} ERP`;
};

const Layout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { isDarkMode } = useTheme();
  const location = useLocation();
  const isPDFRoute = location.pathname === "/pdf-viewer";
  const isLoginRoute = location.pathname === "/login";
  const isPublicFormRoute =
    location.pathname === "/greentarget-form" ||
    (import.meta.env.DEV && location.pathname === GT_SIGNUP_PREVIEW_PATH);

  React.useEffect((): void => {
    if (!isPublicFormRoute) {
      document.title = getDocumentTitle(location.pathname);
    }
  }, [isPublicFormRoute, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const showNavbar = isAuthenticated && !isPDFRoute && !isPublicFormRoute;

  return (
    <div className="h-screen flex flex-col overflow-hidden dark:bg-gray-950">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            padding: "12px",
            fontSize: "0.875rem",
            lineHeight: "1.25rem",
            fontWeight: 500,
            background: isDarkMode ? "#1f2937" : "#ffffff",
            color: isDarkMode ? "#f9fafb" : "#111827",
          },
        }}
      />
      {/* Show navbar if authenticated and not on PDF route */}
      {showNavbar && <Navbar />}

      <main className="flex-1 overflow-y-auto dark:bg-gray-950">
        <div
          className={
            !isPDFRoute && !isLoginRoute && !isPublicFormRoute
              ? "w-full max-w-8xl mx-auto px-4 my-3"
              : ""
          }
        >
          <Routes>
            {/* Public Green Target customer registration form (no auth) */}
            <Route path="/greentarget-form" element={<CustomerSignupPage />} />

            {import.meta.env.DEV && (
              <Route
                path={GT_SIGNUP_PREVIEW_PATH}
                element={<CustomerSignupPage previewMode />}
              />
            )}

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
                  <GreenTargetDashboardPage />
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
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  // On the public Green Target subdomain, render only the standalone signup form
  // (no Router/auth/company providers) so any path shows the form.
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "greentarget.tienhock.com"
  ) {
    return <CustomerSignupPage />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <CompanyProvider>
            <Layout />
          </CompanyProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
