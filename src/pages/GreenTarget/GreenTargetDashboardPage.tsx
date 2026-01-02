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
import { greenTargetApi } from "../../routes/greentarget/api";

interface DashboardMetrics {
  activeRentals: number;
  totalRentals: number;
  totalDumpsters: number;
  availableDumpsters: number;
  outstandingInvoices: number;
  totalInvoices: number;
  totalRevenue: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  percentageChange: number;
  totalCustomers: number;
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

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [metricsData, activitiesData] = await Promise.all([
        greenTargetApi.getDashboardMetrics(),
        greenTargetApi.getDashboardActivities(10),
      ]);

      setMetrics(metricsData);
      setRecentActivities(activitiesData);
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

  // Format date (date only, no time since DB stores dates without time)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
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
        <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 p-4 rounded-lg">
          <p>{error}</p>
          <Button onClick={() => fetchDashboardData()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-default-900 dark:text-gray-100">Dashboard</h1>

      {/* Main Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Revenue Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 dark:text-gray-400 text-xs">Revenue (This Month)</p>
              <h3 className="text-xl font-bold mt-0.5">
                {formatCurrency(metrics?.revenueThisMonth || 0)}
              </h3>
              <div
                className={`flex items-center mt-1 text-xs ${
                  metrics?.percentageChange && metrics.percentageChange >= 0
                    ? "text-green-600"
                    : "text-rose-600"
                }`}
              >
                {metrics?.percentageChange && metrics.percentageChange >= 0 ? (
                  <IconArrowUpRight size={14} className="mr-0.5" />
                ) : (
                  <IconArrowDownRight size={14} className="mr-0.5" />
                )}
                {Math.abs(metrics?.percentageChange || 0)}% from last month
              </div>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
              <IconCash size={20} className="text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        {/* Rentals Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 dark:text-gray-400 text-xs">Active Rentals</p>
              <h3 className="text-xl font-bold mt-0.5">
                {metrics?.activeRentals || 0}
              </h3>
              <p className="text-default-500 dark:text-gray-400 text-xs mt-1">
                Out of {metrics?.totalRentals || 0} total
              </p>
            </div>
            <div className="bg-sky-100 dark:bg-sky-900/30 p-2 rounded-full">
              <IconTruck size={20} className="text-sky-600 dark:text-sky-400" />
            </div>
          </div>
        </div>

        {/* Invoices Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 dark:text-gray-400 text-xs">Outstanding Invoices</p>
              <h3 className="text-xl font-bold mt-0.5">
                {metrics?.outstandingInvoices || 0}
              </h3>
              <p className="text-default-500 dark:text-gray-400 text-xs mt-1">
                Out of {metrics?.totalInvoices || 0} total
              </p>
            </div>
            <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full">
              <IconFileInvoice size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </div>

        {/* Dumpsters Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 dark:text-gray-400 text-xs">Available Dumpsters</p>
              <h3 className="text-xl font-bold mt-0.5">
                {metrics?.availableDumpsters || 0}
              </h3>
              <p className="text-default-500 dark:text-gray-400 text-xs mt-1">
                Out of {metrics?.totalDumpsters || 0} total
              </p>
            </div>
            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-full">
              <IconBox size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links & Secondary Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Quick Links Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-default-900 dark:text-gray-100 mb-2">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={() => navigate("/greentarget/rentals/new")}
              icon={IconTruck}
              className="justify-start"
              variant="outline"
              size="sm"
            >
              Create New Rental
            </Button>

            <Button
              onClick={() => navigate("/greentarget/invoices/new")}
              icon={IconFileInvoice}
              className="justify-start"
              variant="outline"
              size="sm"
            >
              Create New Invoice
            </Button>

            <Button
              onClick={() => navigate("/greentarget/customers/new")}
              icon={IconUsers}
              className="justify-start"
              variant="outline"
              size="sm"
            >
              Add New Customer
            </Button>

            <Button
              onClick={() => navigate("/greentarget/dumpsters/new")}
              icon={IconBox}
              className="justify-start"
              variant="outline"
              size="sm"
            >
              Add New Dumpster
            </Button>

            <Button
              onClick={() => navigate("/greentarget/reports/debtors")}
              icon={IconAlertCircle}
              className="justify-start text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/30"
              variant="outline"
              size="sm"
            >
              View Debtors Report
            </Button>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-medium text-default-900 dark:text-gray-100 mb-2">Business Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg">
              <p className="text-default-500 dark:text-gray-400 text-xs">Total Customers</p>
              <p className="text-xl font-bold">
                {metrics?.totalCustomers || 0}
              </p>
            </div>

            <div className="p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg">
              <p className="text-default-500 dark:text-gray-400 text-xs">Total Revenue</p>
              <p className="text-xl font-bold">
                {formatCurrency(metrics?.totalRevenue || 0)}
              </p>
            </div>

            <div className="p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg">
              <p className="text-default-500 dark:text-gray-400 text-xs">This Month</p>
              <p className="text-xl font-bold">
                {formatCurrency(metrics?.revenueThisMonth || 0)}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <h4 className="text-default-700 dark:text-gray-200 text-sm font-medium mb-2">
              Rental Activity
            </h4>
            <div className="h-32 bg-default-50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center">
              <p className="text-default-500 dark:text-gray-400 text-sm">
                Chart placeholder
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium text-default-900 dark:text-gray-100">Recent Activity</h3>
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
            <p className="text-default-500 dark:text-gray-400 text-center py-4">
              No recent activity
            </p>
          ) : (
            <div className="divide-y divide-default-100 dark:divide-gray-700">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center py-2 hover:bg-default-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div
                    className={`rounded-full p-1.5 mr-3 ${
                      activity.type === "rental"
                        ? "bg-sky-100 dark:bg-sky-900/30"
                        : activity.type === "invoice"
                        ? "bg-amber-100 dark:bg-amber-900/30"
                        : "bg-green-100 dark:bg-green-900/30"
                    }`}
                  >
                    {activity.type === "rental" && (
                      <IconTruck size={16} className="text-sky-600 dark:text-sky-400" />
                    )}
                    {activity.type === "invoice" && (
                      <IconFileInvoice size={16} className="text-amber-600 dark:text-amber-400" />
                    )}
                    {activity.type === "payment" && (
                      <IconCash size={16} className="text-green-600 dark:text-green-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-default-900 dark:text-gray-100 truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-default-500 dark:text-gray-400">
                      {formatDate(activity.date)}
                    </p>
                  </div>

                  <div className="text-right ml-2">
                    {activity.amount && (
                      <p className="text-sm font-medium">
                        {formatCurrency(activity.amount)}
                      </p>
                    )}
                    {activity.status && (
                      <p
                        className={`text-xs ${
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
