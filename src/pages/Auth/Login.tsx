import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { IconArrowRight, IconLock, IconId } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../components/Button";
import { API_BASE_URL } from "../../configs/config";

const Login: React.FC = () => {
  const [step, setStep] = useState<"ic" | "password" | "set-password">("ic");
  const [ic_no, setIcNo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const validateIcNo = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check IC number length (including the two dashes)
    if (ic_no.length < 14) {
      toast.error("Please enter a valid IC number");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/check-ic/${ic_no}`
      );
      const data = await response.json();

      if (data.exists) {
        if (data.hasPassword) {
          setStep("password");
        } else {
          setStep("set-password");
        }
      } else {
        toast.error(
          "IC number not registered. Please contact admin if this is an error."
        );
      }
    } catch (error) {
      toast.error("Failed to verify IC number");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(ic_no, password);
      navigate("/");
    } catch (error) {
      // Display the specific error message from the server
      toast.error(error instanceof Error ? error.message : "Login failed");

      // Clear password field on incorrect password
      if (error instanceof Error && error.message === "Incorrect password") {
        setPassword("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ic_no, password }),
      });

      if (!response.ok) {
        throw new Error("Failed to set password");
      }

      // After setting password, attempt to log in
      await login(ic_no, password);
      navigate("/");
      toast.success("Password set successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to set password"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatIcNo = (value: string) => {
    // Remove all non-digits first
    const digits = value.replace(/\D/g, "");

    // Format as: 000000-00-0000
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
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-6 p-8 bg-white border-2 border-default-100 rounded-xl shadow-xl">
        <div className="flex flex-col items-center">
          <img
            src="/tienhock.png"
            alt="Tien Hock Logo"
            className="h-24 w-auto mb-6"
          />
          <h1 className="text-3xl font-bold text-center text-default-900">
            {step === "set-password" ? "Set Up Password" : "Welcome Back"}
          </h1>
          <p className="mt-2 text-center text-default-600">
            {step === "ic"
              ? "Please enter your IC number"
              : step === "password"
              ? "Please enter your password"
              : "Please set up your password"}
          </p>
        </div>

        <form
          onSubmit={
            step === "ic"
              ? validateIcNo
              : step === "set-password"
              ? handleSetPassword
              : handleLogin
          }
          className="mt-8 space-y-6"
        >
          <div className="space-y-4">
            <div>
              <div className="relative group">
                <div className="flex absolute inset-y-0 left-0 w-10 items-center justify-center">
                  <IconId
                    className="text-default-500 group-focus-within:text-default-600 transition-colors"
                    size={20}
                    stroke={1.5}
                  />
                </div>
                <input
                  id="ic_no"
                  name="ic_no"
                  type="text"
                  placeholder="IC number"
                  required
                  disabled={step === "password"}
                  className="pl-10 pr-4 pt-3 pb-[12.5px] h-11 w-full border border-default-300 rounded-lg focus:border-default-500 transition-colors disabled:bg-default-50 focus:outline-none font-medium text-default-500 group-focus-within:text-default-600 tracking-wide"
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

            {step === "password" && (
              <div>
                <div className="relative group">
                  <div className="flex absolute inset-y-0 left-0 w-10 items-center justify-center">
                    <IconLock
                      className="text-default-500 group-focus-within:text-default-600 transition-colors"
                      size={20}
                      stroke={1.5}
                    />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                    className="pl-10 pr-4 pt-3 pb-[12.5px] h-11 w-full border border-default-300 rounded-lg focus:border-default-500 transition-colors focus:outline-none font-medium text-default-500 group-focus-within:text-default-600 tracking-wide"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === "set-password" && (
              <>
                <div>
                  <div className="relative group">
                    <div className="flex absolute inset-y-0 left-0 w-10 items-center justify-center">
                      <IconLock
                        className="text-default-500 group-focus-within:text-default-600 transition-colors"
                        size={20}
                        stroke={1.5}
                      />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="New Password"
                      required
                      className="pl-10 pr-4 py-3 h-11 w-full border border-default-300 rounded-lg focus:border-default-500 transition-colors focus:outline-none font-medium text-default-500 group-focus-within:text-default-600 tracking-wide"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <div className="relative group">
                    <div className="flex absolute inset-y-0 left-0 w-10 items-center justify-center">
                      <IconLock
                        className="text-default-500 group-focus-within:text-default-600 transition-colors"
                        size={20}
                        stroke={1.5}
                      />
                    </div>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm Password"
                      required
                      className="pl-10 pr-4 py-3 h-11 w-full border border-default-300 rounded-lg focus:border-default-500 transition-colors focus:outline-none font-medium text-default-500 group-focus-within:text-default-600 tracking-wide"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <Button
              type="submit"
              disabled={isLoading}
              icon={IconArrowRight}
              iconPosition="right"
              className="w-full focus:outline-none"
              size="lg"
            >
              {isLoading
                ? "Please wait..."
                : step === "ic"
                ? "Continue"
                : step === "set-password"
                ? "Set Password"
                : "Sign In"}
            </Button>
          </div>

          {step === "password" && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep("ic");
                  setPassword("");
                }}
                className="-py-3 text-sm text-default-600 hover:text-default-900 hover:underline focus:outline-none"
              >
                Use a different IC number
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Login;
