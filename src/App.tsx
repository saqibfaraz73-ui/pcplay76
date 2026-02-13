import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import SuperLogin from "./pages/SuperLogin";

import PosDashboard from "./pages/PosDashboard";
import PosOrders from "./pages/PosOrders";
import PosExpenses from "./pages/PosExpenses";
import PosCreditLodge from "./pages/PosCreditLodge";
import PosPartyLodge from "./pages/PosPartyLodge";
import AdminDashboard from "./pages/AdminDashboard";
import AdminPrinterPage from "./pages/AdminPrinterPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AdminDeliveryPage from "./pages/AdminDeliveryPage";
import AdminSyncPage from "./pages/AdminSyncPage";
import PosTablesPage from "./pages/PosTablesPage";
import PosAdvanceBooking from "./pages/PosAdvanceBooking";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppShell } from "@/layout/AppShell";
import { WorkPeriodProvider } from "@/features/pos/WorkPeriodProvider";
import { SyncProvider } from "@/features/sync/SyncProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <WorkPeriodProvider>
          <SyncProvider>
          <BrowserRouter>
            <AppShell>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/super-admin" element={<SuperLogin />} />


                <Route
                  path="/pos"
                  element={
                    <ProtectedRoute allow={["cashier", "admin"]}>
                      <PosDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pos/orders"
                  element={
                    <ProtectedRoute allow={["cashier", "admin"]}>
                      <PosOrders />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pos/expenses"
                  element={
                    <ProtectedRoute allow={["cashier", "admin"]}>
                      <PosExpenses />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pos/credit-lodge"
                  element={
                    <ProtectedRoute allow={["cashier", "admin"]}>
                      <PosCreditLodge />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pos/party-lodge"
                  element={
                    <ProtectedRoute allow={["cashier", "admin"]}>
                      <PosPartyLodge />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allow={["admin"]}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/printer"
                  element={
                    <ProtectedRoute allow={["admin"]}>
                      <AdminPrinterPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/reports"
                  element={
                    <ProtectedRoute allow={["admin"]}>
                      <AdminReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/settings"
                  element={
                    <ProtectedRoute allow={["admin"]}>
                      <AdminSettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/delivery"
                  element={
                    <ProtectedRoute allow={["admin"]}>
                      <AdminDeliveryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/sync"
                  element={
                    <ProtectedRoute allow={["admin"]}>
                      <AdminSyncPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pos/tables"
                  element={
                    <ProtectedRoute allow={["cashier", "admin", "waiter"]}>
                      <PosTablesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pos/advance-booking"
                  element={
                    <ProtectedRoute allow={["cashier", "admin"]}>
                      <PosAdvanceBooking />
                    </ProtectedRoute>
                  }
                />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
          </BrowserRouter>
          </SyncProvider>
        </WorkPeriodProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
