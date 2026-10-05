import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";

const Home = lazy(() => import("@/pages/Home"));
const MovieDetail = lazy(() => import("@/pages/MovieDetail"));
const SeriesDetail = lazy(() => import("@/pages/SeriesDetail"));
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
const Admin = lazy(() => import("@/pages/Admin"));
const MovieEdit = lazy(() => import("@/pages/MovieEdit"));
const SeriesEdit = lazy(() => import("@/pages/SeriesEdit"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const CollectionDetail = lazy(() => import("@/pages/CollectionDetail"));

// Suspended users are restricted to /inbox, direct thread views, notifications, and auth.
const SUSPENDED_ALLOW = [
  /^\/inbox$/,
  /^\/threads\/[^/]+$/,
  /^\/login$/,
  /^\/register$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
];

function SuspendedGuard({ children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return null;
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
      <Suspense fallback={<main className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</main>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/movie/:id/edit" element={<MovieEdit />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/series/:id/edit" element={<SeriesEdit />} />
          <Route path="/actor/:id" element={<ActorDetail />} />
          <Route path="/collection/:id" element={<CollectionDetail />} />
          <Route path="/user/:id" element={<UserProfile />} />
          <Route path="/threads" element={<ThreadsList />} />
          <Route path="/threads/:id" element={<ThreadDetail />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Suspense>
    </SuspendedGuard>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="App">
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
