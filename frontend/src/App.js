import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import Home from "@/pages/Home";
import MovieDetail from "@/pages/MovieDetail";
import SeriesDetail from "@/pages/SeriesDetail";
import ActorDetail from "@/pages/ActorDetail";
import UserProfile from "@/pages/UserProfile";
import ThreadsList from "@/pages/ThreadsList";
import ThreadDetail from "@/pages/ThreadDetail";
import Browse from "@/pages/Browse";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Watchlist from "@/pages/Watchlist";
import Admin from "@/pages/Admin";
import MovieEdit from "@/pages/MovieEdit";
import SeriesEdit from "@/pages/SeriesEdit";
import Inbox from "@/pages/Inbox";
import { Toaster } from "@/components/ui/sonner";

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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
        <Route path="/movie/:id/edit" element={<MovieEdit />} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/series/:id/edit" element={<SeriesEdit />} />
        <Route path="/actor/:id" element={<ActorDetail />} />
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
