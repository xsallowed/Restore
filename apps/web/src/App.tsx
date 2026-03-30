import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './store/auth';
import { ThemeProvider } from './lib/themeContext';

// Auth pages
import { LoginPage, AcceptInvitePage } from './pages/LoginPage';
import { TenantSettingsPage } from './pages/TenantSettingsPage';

// Core pages
import { HomePage } from './pages/HomePage';
import { OrchestratorDashboard } from './pages/silver/OrchestratorDashboard';
import { ExecutionInterface } from './pages/bronze/ExecutionInterface';
import { EventCommandView } from './pages/silver/EventCommandView';
import { GoldDashboard } from './pages/gold/GoldDashboard';
import { NewEventPage } from './pages/silver/NewEventPage';
import { RehearsalPage } from './pages/silver/RehearsalPage';
import { BlastRadiusView } from './pages/silver/BlastRadiusView';
import { BusinessServicesPage } from './pages/silver/BusinessServicesPage';
import { DependencyMappingPage } from './pages/silver/DependencyMappingPage';
import { EventListPage, AuditPage } from './pages/shared/EventListPage';
import { ConnectorsPage } from './pages/shared/ConnectorsPage';
import { AppShell } from './components/shared/AppShell';

// Asset Registry pages
import { AssetRegistryPage } from './pages/silver/AssetRegistryPage';
import { AssetDetailPage } from './pages/silver/AssetDetailPage';
import { AssetDashboardPage } from './pages/silver/AssetDashboardPage';
import { AssetConnectorsPage } from './pages/silver/AssetConnectorsPage';
import { ActiveScanPage } from './pages/silver/ActiveScanPage';
import { ScanResultsPage } from './pages/silver/ScanResultsPage';
import { DiscoveryInboxPage } from './pages/silver/DiscoveryInboxPage';
import { RiskDashboardPage } from './pages/silver/RiskDashboardPage';
import { AlertEnginePage } from './pages/silver/AlertEnginePage';
import { ApiKeysPage } from './pages/silver/ApiKeysPage';
import { UserIdentitiesPage } from './pages/silver/UserIdentitiesPage';
import { ExternalConnectionsPage } from './pages/silver/ExternalConnectionsPage';
import { AgentsPage } from './pages/silver/AgentsPage';
import { ReportsPage } from './pages/silver/ReportsPage';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: unknown) => {
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

            {/* ── Public routes ─────────────────────────────────────────────── */}
            <Route path="/login"         element={<LoginPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            {/* ── Authenticated routes ──────────────────────────────────────── */}
            <Route element={<RequireAuth><AppShell /></RequireAuth>}>

              {/* Core */}
              <Route path="/"          element={<HomePage />} />
              <Route path="/gold"      element={<GoldDashboard />} />
              <Route path="/dashboard" element={<OrchestratorDashboard />} />

              {/* Events */}
              <Route path="/events"     element={<EventListPage />} />
              <Route path="/events/new" element={<NewEventPage />} />
              <Route path="/events/:id" element={<EventPage />} />

              {/* ── Asset Registry ─────────────────────────────────────────────
                  ALL specific /assets/WORD routes MUST appear before /assets/:id.
                  React Router v6 picks the first match — if :id comes first,
                  paths like /assets/scan match it and render AssetDetailPage blank.
              ─────────────────────────────────────────────────────────────── */}
              <Route path="/assets"              element={<AssetRegistryPage />} />
              <Route path="/assets/dashboard"    element={<AssetDashboardPage />} />
              <Route path="/assets/discovery"    element={<DiscoveryInboxPage />} />
              <Route path="/assets/connectors"   element={<AssetConnectorsPage />} />
              <Route path="/assets/scan"         element={<ActiveScanPage />} />
              <Route path="/assets/scan/results" element={<ScanResultsPage />} />
              <Route path="/assets/risk"         element={<RiskDashboardPage />} />
              <Route path="/assets/alerts"       element={<AlertEnginePage />} />
              <Route path="/assets/api-keys"     element={<ApiKeysPage />} />
              <Route path="/assets/users"        element={<UserIdentitiesPage />} />
              <Route path="/assets/connections"  element={<ExternalConnectionsPage />} />
              <Route path="/assets/agents"       element={<AgentsPage />} />
              <Route path="/assets/reports"      element={<ReportsPage />} />
              <Route path="/assets/graph"        element={<BlastRadiusView />} />
              {/* Dynamic detail — always last among /assets/* */}
              <Route path="/assets/:id"          element={<AssetDetailPage />} />

              {/* Services */}
              <Route path="/services" element={<BusinessServicesPage />} />
              <Route path="/graph"    element={<DependencyMappingPage />} />

              {/* Other */}
              <Route path="/rehearsals"            element={<RehearsalPage />} />
              <Route path="/audit"                 element={<AuditPage />} />
              <Route path="/connectors"            element={<ConnectorsPage />} />
              <Route path="/settings/organisation" element={<TenantSettingsPage />} />

            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
