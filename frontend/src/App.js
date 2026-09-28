import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import Home from "@/pages/Home";
import MovieDetail from "@/pages/MovieDetail";
import SeriesDetail from "@/pages/SeriesDetail";
import ActorDetail from "@/pages/ActorDetail";
import UserProfile from "@/pages/UserProfile";
import Browse from "@/pages/Browse";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Watchlist from "@/pages/Watchlist";
import Admin from "@/pages/Admin";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/movie/:id" element={<MovieDetail />} />
            <Route path="/series/:id" element={<SeriesDetail />} />
            <Route path="/actor/:id" element={<ActorDetail />} />
            <Route path="/user/:id" element={<UserProfile />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
          <Toaster theme="dark" position="top-right" />
        </BrowserRouter>
      </div>
    </AuthProvider>
  );
}

export default App;
