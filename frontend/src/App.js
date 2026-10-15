import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";

const Home = lazy(() => import("@/pages/Home"));
const MovieDetail = lazy(() => import("@/pages/MovieDetail"));
const SeriesDetail = lazy(() => import("@/pages/SeriesDetail"));
const EpisodeDetail = lazy(() => import("@/pages/EpisodeDetail"));
const NetworkDetail = lazy(() => import("@/pages/NetworkDetail"));
const KeywordDetail = lazy(() => import("@/pages/KeywordDetail"));
const Credits = lazy(() => import("@/pages/Credits"));
const ActorDetail = lazy(() => import("@/pages/ActorDetail"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const ThreadsList = lazy(() => import("@/pages/ThreadsList"));
const ThreadDetail = lazy(() => import("@/pages/ThreadDetail"));
const Browse = lazy(() => import("@/pages/Browse"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Watchlist = lazy(() => import("@/pages/Watchlist"));
const UserLists = lazy(() => import("@/pages/UserLists"));
const Admin = lazy(() => import("@/pages/Admin"));
const MovieEdit = lazy(() => import("@/pages/MovieEdit"));
const SeriesEdit = lazy(() => import("@/pages/SeriesEdit"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const CollectionDetail = lazy(() => import("@/pages/CollectionDetail"));
const ContributorGuidelines = lazy(() => import("@/pages/ContributorGuidelines"));
const Settings = lazy(() => import("@/pages/Settings"));
const CreateCatalogEntry = lazy(() => import("@/pages/CreateCatalogEntry"));

// Suspended users are restricted to /inbox, direct thread views, notifications, and auth.
const SUSPENDED_ALLOW = [
  /^\/inbox$/,
  /^\/threads\/[^/]+$/,
  /^\/login$/,
  /^\/register$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
];

const AUTH_REQUIRED = [
  /^\/admin$/,
  /^\/create\/(movie|series)$/,
  /^\/inbox$/,
  /^\/list\/[^/]+$/,
  /^\/lists$/,
  /^\/movie\/[^/]+\/edit$/,
  /^\/series\/[^/]+\/edit$/,
  /^\/settings$/,
  /^\/user\/[^/]+$/,
  /^\/watchlist$/,
];

function SuspendedGuard({ children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing && AUTH_REQUIRED.some((pattern) => pattern.test(location.pathname))) {
    return <main className="min-h-[60vh] grid place-items-center text-slate-500">Loading your account…</main>;
  }
  if (user && user.is_suspended) {
    const path = location.pathname;
    const allowed = SUSPENDED_ALLOW.some((r) => r.test(path));
    if (!allowed) return <Navigate to="/inbox" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <SuspendedGuard>
      <ErrorBoundary>
        <Suspense fallback={<main className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</main>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/create/movie" element={<CreateCatalogEntry kind="movie" />} />
            <Route path="/create/series" element={<CreateCatalogEntry kind="series" />} />
            <Route path="/movie/:id" element={<MovieDetail />} />
            <Route path="/movie/:id/credits" element={<Credits kind="movie" />} />
            <Route path="/movie/:id/edit" element={<MovieEdit />} />
            <Route path="/series/:id" element={<SeriesDetail />} />
            <Route path="/series/:id/season/:seasonNumber/episode/:episodeNumber" element={<EpisodeDetail />} />
            <Route path="/network/:network" element={<NetworkDetail />} />
            <Route path="/keyword/:keyword" element={<KeywordDetail />} />
            <Route path="/series/:id/credits" element={<Credits kind="series" />} />
            <Route path="/series/:id/edit" element={<SeriesEdit />} />
            <Route path="/actor/:id" element={<ActorDetail />} />
            <Route path="/collection/:id" element={<CollectionDetail />} />
            <Route path="/contributor-guidelines" element={<ContributorGuidelines />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/user/:id" element={<UserProfile />} />
            <Route path="/threads" element={<ThreadsList />} />
            <Route path="/threads/:id" element={<ThreadDetail />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/lists" element={<UserLists />} />
            <Route path="/list/:listId" element={<UserLists />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </SuspendedGuard>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="App app-shell">
        <BrowserRouter>
          <Navbar />
          <AppRoutes />
          <Toaster theme="dark" position="top-right" />
        </BrowserRouter>
      </div>
    </AuthProvider>
  );
}

export default App;
