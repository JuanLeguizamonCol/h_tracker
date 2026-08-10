import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { AdminGuard } from "@/components/AdminGuard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazy, Suspense } from "react";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Timesheet = lazy(() => import("./pages/Timesheet"));
const History = lazy(() => import("./pages/History"));
const Projects = lazy(() => import("./pages/Projects"));
const Clients = lazy(() => import("./pages/Clients"));
const Employees = lazy(() => import("./pages/Employees"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceEditPage = lazy(() => import("./pages/invoices/InvoiceEditPage"));
const InvoiceNewPage = lazy(() => import("./pages/invoices/InvoiceNewPage"));
const InvoiceManualPage = lazy(() => import("./pages/invoices/InvoiceManualPage"));
const InvoiceDetailPage = lazy(() => import("./pages/invoices/InvoiceDetailPage"));
const ProjectNewPage = lazy(() => import("./pages/projects/ProjectNewPage"));
const ClientFormPage = lazy(() => import("./pages/clients/ClientFormPage"));
const EmployeeFormPage = lazy(() => import("./pages/employees/EmployeeFormPage"));
const EmployeeProfilePage = lazy(() => import("./pages/employees/EmployeeProfilePage"));
const ProjectDetailPage = lazy(() => import("./pages/projects/ProjectDetailPage"));
const ProjectEditPage = lazy(() => import("./pages/projects/ProjectEditPage"));
const Reports = lazy(() => import("./pages/Reports"));
const ProfilePage = lazy(() => import("./pages/profile/ProfilePage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,      // 2 min — no refetch si los datos son recientes
      gcTime: 1000 * 60 * 10,        // 10 min en cache
      retry: 1,
      refetchOnWindowFocus: false,   // no refetch al volver al tab
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><MainLayout><Dashboard /></MainLayout></ProtectedRoute>} />
              <Route path="/timesheet" element={<ProtectedRoute><MainLayout><Timesheet /></MainLayout></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><MainLayout><History /></MainLayout></ProtectedRoute>} />
              <Route path="/projects" element={<ProtectedRoute><MainLayout><Projects /></MainLayout></ProtectedRoute>} />
              <Route path="/projects/new" element={<ProtectedRoute><MainLayout><ProjectNewPage /></MainLayout></ProtectedRoute>} />
              <Route path="/projects/:projectId/edit" element={<ProtectedRoute><MainLayout><ProjectEditPage /></MainLayout></ProtectedRoute>} />
              <Route path="/projects/:projectId" element={<ProtectedRoute><MainLayout><ProjectDetailPage /></MainLayout></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute><MainLayout><Clients /></MainLayout></ProtectedRoute>} />
              <Route path="/clients/new" element={<ProtectedRoute><MainLayout><ClientFormPage /></MainLayout></ProtectedRoute>} />
              <Route path="/clients/:clientId/edit" element={<ProtectedRoute><MainLayout><ClientFormPage /></MainLayout></ProtectedRoute>} />
              <Route path="/employees" element={<ProtectedRoute><MainLayout><AdminGuard><Employees /></AdminGuard></MainLayout></ProtectedRoute>} />
              <Route path="/employees/new" element={<ProtectedRoute><MainLayout><AdminGuard><EmployeeFormPage /></AdminGuard></MainLayout></ProtectedRoute>} />
              <Route path="/employees/:employeeId" element={<ProtectedRoute><MainLayout><AdminGuard><EmployeeProfilePage /></AdminGuard></MainLayout></ProtectedRoute>} />
              <Route path="/employees/:employeeId/edit" element={<ProtectedRoute><MainLayout><AdminGuard><EmployeeFormPage /></AdminGuard></MainLayout></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><MainLayout><Invoices /></MainLayout></ProtectedRoute>} />
              <Route path="/invoices/new" element={<ProtectedRoute><MainLayout><InvoiceNewPage /></MainLayout></ProtectedRoute>} />
              <Route path="/invoices/new/manual" element={<ProtectedRoute><MainLayout><InvoiceManualPage /></MainLayout></ProtectedRoute>} />
              <Route path="/invoices/:invoiceId/edit" element={<ProtectedRoute><MainLayout><InvoiceEditPage /></MainLayout></ProtectedRoute>} />
              <Route path="/invoices/:invoiceId" element={<ProtectedRoute><MainLayout><InvoiceDetailPage /></MainLayout></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><MainLayout><Reports /></MainLayout></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><MainLayout><ProfilePage /></MainLayout></ProtectedRoute>} />
              {/* Legacy routes */}
              <Route path="/historial" element={<Navigate to="/history" replace />} />
              <Route path="/proyectos" element={<Navigate to="/projects" replace />} />
              <Route path="/clientes" element={<Navigate to="/clients" replace />} />
              <Route path="/empleados" element={<Navigate to="/employees" replace />} />
              <Route path="/facturacion" element={<Navigate to="/invoices" replace />} />
              <Route path="/billing" element={<Navigate to="/invoices" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
