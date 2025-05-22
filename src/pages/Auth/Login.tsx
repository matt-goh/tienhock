import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  IconArrowRight,
  IconLock,
  IconId,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../components/Button";
import TienHockLogo from "../../utils/TienHockLogo";
import { useCompany, COMPANIES } from "../../contexts/CompanyContext";

const Login: React.FC = () => {
  const [ic_no, setIcNo] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { setActiveCompany } = useCompany();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (ic_no.length < 14) {
      toast.error("Please enter a valid IC number");
      return;
    }

    if (!password.trim()) {
      toast.error("Please enter your password");
      return;
    }

    setIsLoading(true);

    try {
      await login(ic_no, password);

      // Check for saved company preference
      const savedCompanyId = localStorage.getItem("activeCompany");
      let targetPath = "/";

      if (savedCompanyId) {
        const company = COMPANIES.find((c) => c.id === savedCompanyId);
        if (company) {
          setActiveCompany(company);
          targetPath = company.routePrefix ? `/${company.routePrefix}` : "/";

          setTimeout(() => {
            navigate(targetPath);
          }, 50);
          return;
        }
      }

      navigate(targetPath);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatIcNo = (value: string) => {
    const digits = value.replace(/\D/g, "");

    if (digits.length <= 6) {
      return digits;
    } else if (digits.length <= 8) {
      return `${digits.slice(0, 6)}-${digits.slice(6)}`;
    } else {
      return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(
        8,
        12
      )}`;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="relative max-w-md w-full">
        {/* Main login card */}
        <div className="bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-2xl p-8 transform transition-all duration-300 hover:shadow-3xl">
          {/* Header */}
          <div className="flex items-center mb-8">
            <div className="mr-6 w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg">
              <TienHockLogo width={60} height={60} />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-1">Welcome Back</h1>
              <p className="text-gray-600 text-sm">
                Sign in to your account to continue
              </p>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* IC Number Field */}
            <div className="space-y-1">
              <label
                htmlFor="ic_no"
                className="block text-sm font-medium text-default-700 mb-2"
              >
                IC Number
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 w-12 flex items-center justify-center">
                  <IconId
                    className="text-default-500 group-focus-within:text-default-600 transition-colors duration-200"
                    size={20}
                    stroke={1.5}
                  />
                </div>
                <input
                  id="ic_no"
                  name="ic_no"
                  type="text"
                  placeholder="000000-00-0000"
                  required
                  className="pl-10 pr-4 pt-3 pb-[12.5px] h-11 w-full border border-default-300 rounded-lg  focus:border-sky-400 transition-colors focus:outline-none font-medium text-default-500 group-focus-within:text-default-600 tracking-wide"
                  value={ic_no}
                  onChange={(e) => {
                    const formatted = formatIcNo(e.target.value);
                    if (formatted.length <= 14) {
                      setIcNo(formatted);
                    }
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-default-700 mb-2"
              >
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 w-12 flex items-center justify-center">
                  <IconLock
                    className="text-default-500 group-focus-within:text-default-600 transition-colors duration-200"
                    size={20}
                    stroke={1.5}
                  />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                  className="pl-10 pr-4 pt-3 pb-[12.5px] h-11 w-full border border-default-300 rounded-lg  focus:border-sky-400 transition-colors focus:outline-none font-medium text-default-500 group-focus-within:text-default-600 tracking-wide"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-default-400 hover:text-default-600 transition-colors duration-200"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <IconEyeOff size={20} stroke={1.5} />
                  ) : (
                    <IconEye size={20} stroke={1.5} />
                  )}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                icon={IconArrowRight}
                iconPosition="right"
                variant="filled"
                color="sky"
                size="lg"
                className="w-full relative overflow-hidden group"
                additionalClasses="bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-lg hover:shadow-xl transform hover:scale-[1.01] transition-all duration-300 disabled:transform-none disabled:shadow-xl rounded-lg"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Signing in...
                  </div>
                ) : (
                  "Sign In"
                )}
              </Button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-default-500">
              Need help? Contact system admin
            </p>
          </div>
        </div>

        {/* Bottom branding */}
        <div className="text-center mt-6">
          <p className="text-sm text-default-500">Tien Hock ERP System</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
