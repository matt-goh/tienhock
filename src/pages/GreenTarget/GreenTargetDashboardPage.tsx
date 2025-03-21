// src/pages/GreenTarget/DashboardPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconTruck,
  IconFileInvoice,
  IconCash,
  IconAlertCircle,
  IconArrowUpRight,
  IconArrowDownRight,
  IconUsers,
  IconBox,
} from "@tabler/icons-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";

interface DashboardMetrics {
  activeRentals: number;
  totalRentals: number;
  totalDumpsters: number;
  availableDumpsters: number;
  outstandingInvoices: number;
  totalInvoices: number;
  totalRevenue: number;
  revenueThisMonth: number;
  totalCustomers: number;
  revenueLastMonth: number;
  percentageChange: number;
}

interface RecentActivity {
  id: number;
  type: "rental" | "invoice" | "payment";
  description: string;
  date: string;
  amount?: number;
  status?: string;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"week" | "month" | "year">(
    "month"
  );

  useEffect(() => {
    fetchDashboardData();
  }, [timeframe]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // In a real implementation, we would fetch this data from the backend
      // For now, we'll simulate the data

      // Mock data for dashboard metrics
      const mockMetrics: DashboardMetrics = {
        activeRentals: 12,
        totalRentals: 156,
        totalDumpsters: 25,
        availableDumpsters: 18,
        outstandingInvoices: 8,
        totalInvoices: 145,
        totalRevenue: 48750.0,
        revenueThisMonth: 5250.0,
        revenueLastMonth: 4800.0,
        percentageChange: 9.38,
        totalCustomers: 45,
      };

      // Mock data for recent activities
      const mockActivities: RecentActivity[] = [
        {
          id: 1,
          type: "rental",
          description: "New dumpster rental for ABC Construction",
          date: "2025-03-20T14:30:00",
          status: "active",
        },
        {
          id: 2,
          type: "invoice",
          description: "Invoice #2025/00045 created",
          date: "2025-03-19T10:15:00",
          amount: 750.0,
          status: "pending",
        },
        {
          id: 3,
          type: "payment",
          description: "Payment received for Invoice #2025/00042",
          date: "2025-03-18T16:20:00",
          amount: 850.0,
        },
        {
          id: 4,
          type: "rental",
          description: "Dumpster #T15 picked up from XYZ Developers",
          date: "2025-03-18T11:45:00",
          status: "completed",
        },
        {
          id: 5,
          type: "invoice",
          description: "Invoice #2025/00044 created",
          date: "2025-03-17T09:30:00",
          amount: 625.0,
          status: "pending",
        },
      ];

      // In production, these would be API calls:
      // const metrics = await api.get("/greentarget/api/dashboard/metrics");
      // const activities = await api.get("/greentarget/api/dashboard/activities");

      setMetrics(mockMetrics);
      setRecentActivities(mockActivities);
      setError(null);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-rose-50 text-rose-700 p-4 rounded-lg">
          <p>{error}</p>
          <Button onClick={() => fetchDashboardData()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-default-900">Dashboard</h1>
          <p className="text-default-500 mt-1">
            Overview of Green Target's operations
          </p>
        </div>

        <div className="flex space-x-3 mt-4 md:mt-0">
          <div className="inline-flex border border-default-200 rounded-lg overflow-hidden">
            <button
              className={`px-4 py-2 text-sm font-medium ${
                timeframe === "week"
                  ? "bg-default-100 text-default-900"
                  : "bg-white text-default-600 hover:bg-default-50"
              }`}
              onClick={() => setTimeframe("week")}
            >
              Week
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${
                timeframe === "month"
                  ? "bg-default-100 text-default-900"
                  : "bg-white text-default-600 hover:bg-default-50"
              }`}
              onClick={() => setTimeframe("month")}
            >
              Month
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${
                timeframe === "year"
                  ? "bg-default-100 text-default-900"
                  : "bg-white text-default-600 hover:bg-default-50"
              }`}
              onClick={() => setTimeframe("year")}
            >
              Year
            </button>
          </div>
        </div>
      </div>

      {/* Main Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Revenue Card */}
        <div className="bg-white rounded-lg border border-default-200 p-6 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 text-sm">
                Revenue (
                {timeframe === "week"
                  ? "This Week"
                  : timeframe === "month"
                  ? "This Month"
                  : "This Year"}
                )
              </p>
              <h3 className="text-2xl font-bold mt-1">
                {formatCurrency(metrics?.revenueThisMonth || 0)}
              </h3>
              <div
                className={`flex items-center mt-2 text-sm ${
                  metrics?.percentageChange && metrics.percentageChange >= 0
                    ? "text-green-600"
                    : "text-rose-600"
                }`}
              >
                {metrics?.percentageChange && metrics.percentageChange >= 0 ? (
                  <IconArrowUpRight size={16} className="mr-1" />
                ) : (
                  <IconArrowDownRight size={16} className="mr-1" />
                )}
                {Math.abs(metrics?.percentageChange || 0)}% from last{" "}
                {timeframe}
              </div>
            </div>
            <div className="bg-green-100 p-3 rounded-full">
              <IconCash size={24} className="text-green-600" />
            </div>
          </div>
        </div>

        {/* Rentals Card */}
        <div className="bg-white rounded-lg border border-default-200 p-6 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 text-sm">Active Rentals</p>
              <h3 className="text-2xl font-bold mt-1">
                {metrics?.activeRentals || 0}
              </h3>
              <p className="text-default-500 text-sm mt-2">
                Out of {metrics?.totalRentals || 0} total rentals
              </p>
            </div>
            <div className="bg-sky-100 p-3 rounded-full">
              <IconTruck size={24} className="text-sky-600" />
            </div>
          </div>
        </div>

        {/* Invoices Card */}
        <div className="bg-white rounded-lg border border-default-200 p-6 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 text-sm">Outstanding Invoices</p>
              <h3 className="text-2xl font-bold mt-1">
                {metrics?.outstandingInvoices || 0}
              </h3>
              <p className="text-default-500 text-sm mt-2">
                Out of {metrics?.totalInvoices || 0} total invoices
              </p>
            </div>
            <div className="bg-amber-100 p-3 rounded-full">
              <IconFileInvoice size={24} className="text-amber-600" />
            </div>
          </div>
        </div>

        {/* Dumpsters Card */}
        <div className="bg-white rounded-lg border border-default-200 p-6 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 text-sm">Available Dumpsters</p>
              <h3 className="text-2xl font-bold mt-1">
                {metrics?.availableDumpsters || 0}
              </h3>
              <p className="text-default-500 text-sm mt-2">
                Out of {metrics?.totalDumpsters || 0} total dumpsters
              </p>
            </div>
            <div className="bg-indigo-100 p-3 rounded-full">
              <IconBox size={24} className="text-indigo-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links & Secondary Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Quick Links Card */}
        <div className="bg-white rounded-lg border border-default-200 p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-3">
            <Button
              onClick={() => navigate("/greentarget/rentals/new")}
              icon={IconTruck}
              className="justify-start"
              variant="outline"
            >
              Create New Rental
            </Button>

            <Button
              onClick={() => navigate("/greentarget/invoices/new")}
              icon={IconFileInvoice}
              className="justify-start"
              variant="outline"
            >
              Create New Invoice
            </Button>

            <Button
              onClick={() => navigate("/greentarget/customers/new")}
              icon={IconUsers}
              className="justify-start"
              variant="outline"
            >
              Add New Customer
            </Button>

            <Button
              onClick={() => navigate("/greentarget/dumpsters/new")}
              icon={IconBox}
              className="justify-start"
              variant="outline"
            >
              Add New Dumpster
            </Button>

            <Button
              onClick={() => navigate("/greentarget/reports/debtors")}
              icon={IconAlertCircle}
              className="justify-start text-amber-600 border-amber-200 hover:bg-amber-50"
              variant="outline"
            >
              View Debtors Report
            </Button>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="bg-white rounded-lg border border-default-200 p-6 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-medium mb-4">Business Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-default-50 rounded-lg">
              <p className="text-default-500 text-sm">Total Customers</p>
              <p className="text-2xl font-bold">
                {metrics?.totalCustomers || 0}
              </p>
            </div>

            <div className="p-4 bg-default-50 rounded-lg">
              <p className="text-default-500 text-sm">Total Revenue</p>
              <p className="text-2xl font-bold">
                {formatCurrency(metrics?.totalRevenue || 0)}
              </p>
            </div>

            <div className="p-4 bg-default-50 rounded-lg">
              <p className="text-default-500 text-sm">This Month</p>
              <p className="text-2xl font-bold">
                {formatCurrency(metrics?.revenueThisMonth || 0)}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-default-700 font-medium mb-2">
              Rental Activity
            </h4>
            <div className="h-48 bg-default-50 rounded-lg flex items-center justify-center">
              <p className="text-default-500">
                Bar chart would be displayed here
              </p>
              {/* In a real implementation, we would display a chart here */}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-default-200 p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Recent Activity</h3>
          <Button
            onClick={() => navigate("/greentarget/rentals")}
            variant="outline"
            size="sm"
          >
            View All
          </Button>
        </div>

        <div className="overflow-hidden">
          {recentActivities.length === 0 ? (
            <p className="text-default-500 text-center py-8">
              No recent activity
            </p>
          ) : (
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center p-3 hover:bg-default-50 rounded-lg transition-colors"
                >
                  <div
                    className={`rounded-full p-2 mr-4 ${
                      activity.type === "rental"
                        ? "bg-sky-100"
                        : activity.type === "invoice"
                        ? "bg-amber-100"
                        : "bg-green-100"
                    }`}
                  >
                    {activity.type === "rental" && (
                      <IconTruck size={20} className="text-sky-600" />
                    )}
                    {activity.type === "invoice" && (
                      <IconFileInvoice size={20} className="text-amber-600" />
                    )}
                    {activity.type === "payment" && (
                      <IconCash size={20} className="text-green-600" />
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="font-medium text-default-900">
                      {activity.description}
                    </p>
                    <p className="text-sm text-default-500">
                      {formatDate(activity.date)}
                    </p>
                  </div>

                  <div className="text-right">
                    {activity.amount && (
                      <p className="font-medium">
                        {formatCurrency(activity.amount)}
                      </p>
                    )}
                    {activity.status && (
                      <p
                        className={`text-sm ${
                          activity.status === "active"
                            ? "text-green-600"
                            : activity.status === "completed"
                            ? "text-blue-600"
                            : "text-amber-600"
                        }`}
                      >
                        {activity.status}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
