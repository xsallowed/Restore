import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './store/auth';
import { ThemeProvider } from './lib/themeContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { OrchestratorDashboard } from './pages/silver/OrchestratorDashboard';
import { ExecutionInterface } from './pages/bronze/ExecutionInterface';
import { EventCommandView } from './pages/silver/EventCommandView';
import { GoldDashboard } from './pages/gold/GoldDashboard';
import { NewEventPage } from './pages/silver/NewEventPage';
import { RehearsalPage } from './pages/silver/RehearsalPage';
import { BlastRadiusView } from './pages/silver/BlastRadiusView';
import { AssetRegistryPage } from './pages/silver/AssetRegistryPage';
import { AssetDetailPage } from './pages/silver/AssetDetailPage';
import { AssetDashboardPage } from './pages/silver/AssetDashboardPage';
import { AssetConnectorsPage } from './pages/silver/AssetConnectorsPage';
import { ActiveScanPage } from './pages/silver/ActiveScanPage';
import { DiscoveryInboxPage } from './pages/silver/DiscoveryInboxPage';
import { BusinessServicesPage } from './pages/silver/BusinessServicesPage';
import { DependencyMappingPage } from './pages/silver/DependencyMappingPage';
import { EventListPage, AuditPage } from './pages/shared/EventListPage';
import { ConnectorsPage } from './pages/shared/ConnectorsPage';
import { AppShell } from './components/shared/AppShell';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: unknown) => {
        // Never retry 404s - resource just doesn't exist yet
        const status = (error as { response?: { status: number } })?.response?.status;
        if (status === 404 || status === 403 || status === 401) return false;
        return failureCount < 2;
      },
      retryDelay: 3000,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function EventPage() {
  const { isAtLeast } = useAuth();
  return isAtLeast('SILVER') ? <EventCommandView /> : <ExecutionInterface />;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/"                  element={<HomePage />} />
            <Route path="/gold"              element={<GoldDashboard />} />
            <Route path="/dashboard"         element={<OrchestratorDashboard />} />
            <Route path="/events"            element={<EventListPage />} />
            <Route path="/events/new"        element={<NewEventPage />} />
            <Route path="/events/:id"        element={<EventPage />} />
            <Route path="/assets"            element={<AssetRegistryPage />} />
            <Route path="/assets/:id"        element={<AssetDetailPage />} />
            <Route path="/assets/discovery"  element={<DiscoveryInboxPage />} />
            <Route path="/assets/dashboard"  element={<AssetDashboardPage />} />
            <Route path="/assets/connectors" element={<AssetConnectorsPage />} />
            <Route path="/assets/scan"       element={<ActiveScanPage />} />
            <Route path="/assets/graph"      element={<BlastRadiusView />} />
            <Route path="/services"          element={<BusinessServicesPage />} />
            <Route path="/rehearsals"        element={<RehearsalPage />} />
            <Route path="/audit"             element={<AuditPage />} />
            <Route path="/connectors"        element={<ConnectorsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
  );
}
