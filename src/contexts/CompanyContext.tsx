import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
} from "react";
import { useLocation } from "react-router-dom";

export interface Company {
  id: string;
  name: string;
  routePrefix: string;
}

export const COMPANIES: Company[] = [
  { id: "tienhock", name: "Tien Hock", routePrefix: "" },
  { id: "greentarget", name: "Green Target", routePrefix: "greentarget" },
  { id: "jellypolly", name: "Jelly Polly", routePrefix: "jellypolly" },
];

interface CompanyContextType {
  activeCompany: Company;
  setActiveCompany: (company: Company) => void;
  companies: Company[];
  getCompanyFromPath: (path: string) => Company;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

interface CompanyProviderProps {
  children: ReactNode;
}

export const CompanyProvider: React.FC<CompanyProviderProps> = ({
  children,
}) => {
  const [activeCompany, setActiveCompanyState] = useState<Company>(() => {
    const savedCompanyId = localStorage.getItem("activeCompany");
    return COMPANIES.find((c) => c.id === savedCompanyId) || COMPANIES[0];
  });

  const initialCompanySet = useRef(false);
  const location = useLocation();

  // Helper function to get company from path
  const getCompanyFromPath = (path: string): Company => {
    const pathSegments = path.split("/").filter(Boolean);
    if (pathSegments.length > 0) {
      const possiblePrefix = pathSegments[0];
      const matchedCompany = COMPANIES.find(
        (c) => c.routePrefix === possiblePrefix
      );
      if (matchedCompany) return matchedCompany;
    }
    return COMPANIES[0]; // Default to Tien Hock
  };

  // Update company based on URL when navigating directly
  useEffect(() => {
    // Skip the first time this effect runs to prevent override during initial load
    if (!initialCompanySet.current) {
      initialCompanySet.current = true;
      return;
    }

    const companyFromPath = getCompanyFromPath(location.pathname);
    if (companyFromPath.id !== activeCompany.id) {
      setActiveCompanyState(companyFromPath);
    }
  }, [location.pathname]);

  const setActiveCompany = (company: Company) => {
    setActiveCompanyState(company);
    localStorage.setItem("activeCompany", company.id);
  };

  return (
    <CompanyContext.Provider
      value={{
        activeCompany,
        setActiveCompany,
        companies: COMPANIES,
        getCompanyFromPath,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = (): CompanyContextType => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
};
