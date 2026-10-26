import { lazy, Suspense, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

// Route-level code splitting keeps the first paint light. Auth stays eager
// because it is the landing route for unauthenticated visitors.
import Auth from "./pages/Auth";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const AICommandCenter = lazy(() => import("./pages/AICommandCenter"));
const FinancialHub = lazy(() => import("./pages/FinancialHub"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Settings = lazy(() => import("./pages/Settings"));
const Directory = lazy(() => import("./pages/Directory"));
const SmartInbox = lazy(() => import("./pages/SmartInbox"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ── Route guard: redirect unauthenticated users to / ──────────────────────────
function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(220_18%_95%)]">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Auth />} />

              {/* Protected */}
              <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/ai"           element={<ProtectedRoute><AICommandCenter /></ProtectedRoute>} />
              <Route path="/finance"      element={<ProtectedRoute><FinancialHub /></ProtectedRoute>} />
              <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
              <Route path="/directory"    element={<ProtectedRoute><Directory /></ProtectedRoute>} />
              <Route path="/inbox"        element={<ProtectedRoute><SmartInbox /></ProtectedRoute>} />
              <Route path="/settings"     element={<ProtectedRoute><Settings /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
