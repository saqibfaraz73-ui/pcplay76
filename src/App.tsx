import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";

import PosHome from "./pages/PosHome";
import PosDashboard from "./pages/PosDashboard";
import PosOrders from "./pages/PosOrders";
import PosExpenses from "./pages/PosExpenses";
import PosCreditLodge from "./pages/PosCreditLodge";
import PosPartyLodge from "./pages/PosPartyLodge";
import AdminDashboard from "./pages/AdminDashboard";
import InstallmentPage from "./pages/InstallmentPage";
import AdminKitchenPage from "./pages/AdminKitchenPage";
import AdminPrinterPage from "./pages/AdminPrinterPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AdminDeliveryPage from "./pages/AdminDeliveryPage";
import AdminSyncPage from "./pages/AdminSyncPage";
import PosTablesPage from "./pages/PosTablesPage";
import PosAdvanceBooking from "./pages/PosAdvanceBooking";
import RecoveryPage from "./pages/RecoveryPage";
import AboutApp from "./pages/AboutApp";
import HelpPage from "./pages/HelpPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DataDeletion from "./pages/DataDeletion";
import ProductLabelsPage from "./pages/ProductLabelsPage";
import CustomPrintPage from "./pages/CustomPrintPage";
import DaybookPage from "./pages/DaybookPage";
import KitchenPage from "./pages/KitchenPage";
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
            <Routes>
              <Route path="/kitchen" element={<KitchenPage />} />
              <Route path="*" element={
                <AppShell>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/login" element={<Login />} />
                    

                <Route
                  path="/home"
                  element={
                    <ProtectedRoute allow={["cashier", "admin", "waiter", "supervisor"]}>
                      <PosHome />
                    </ProtectedRoute>
                  }
                />
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
                  path="/installments"
                  element={
                    <ProtectedRoute allow={["admin", "cashier", "installment_agent"]}>
                      <InstallmentPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/printer"
                  element={
                     <ProtectedRoute allow={["admin", "cashier", "supervisor", "waiter", "recovery"]}>
                      <AdminPrinterPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/reports"
                  element={
                    <ProtectedRoute allow={["admin", "cashier"]}>
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
                  path="/admin/kitchen"
                  element={
                    <ProtectedRoute allow={["admin", "cashier"]}>
                      <AdminKitchenPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/sync"
                  element={
                <ProtectedRoute allow={["admin", "cashier", "waiter", "supervisor"]}>
                      <AdminSyncPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pos/tables"
                  element={
                    <ProtectedRoute allow={["cashier", "admin", "waiter", "supervisor"]}>
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
                <Route
                  path="/recovery"
                  element={
                    <ProtectedRoute allow={["admin", "cashier", "recovery"]}>
                      <RecoveryPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admin/labels"
                  element={
                    <ProtectedRoute allow={["admin", "cashier"]}>
                      <ProductLabelsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/custom-print"
                  element={
                    <ProtectedRoute allow={["admin", "cashier"]}>
                      <CustomPrintPage />
                    </ProtectedRoute>
                  }
                />

                <Route path="/about" element={<AboutApp />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/delete-data" element={<DataDeletion />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
              } />
            </Routes>
          </BrowserRouter>
          </SyncProvider>
        </WorkPeriodProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
