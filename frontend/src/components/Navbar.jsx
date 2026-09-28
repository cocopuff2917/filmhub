import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Film, LogOut, User, Bookmark, Shield, Plus, Sparkles } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EntityEditDialog from "@/components/EntityEditDialog";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState("movie");

  const linkClass = ({ isActive }) => `text-sm font-medium tracking-wide transition-colors ${isActive ? "text-amber-400" : "text-slate-300 hover:text-white"}`;
  const initial = user && user.name ? user.name.charAt(0).toUpperCase() : "U";

  const startCreate = (kind) => { setCreateKind(kind); setCreateOpen(true); };

  const onCreated = (result) => {
    if (createKind === "movie") navigate(`/movie/${result.id}`);
    else if (createKind === "series") navigate(`/series/${result.id}`);
    else if (createKind === "actor") navigate(`/actor/${result.id}`);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 glass" data-testid="app-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.4)]">
              <Film className="w-5 h-5 text-black" strokeWidth={2.5} />
            </div>
            <div className="font-display text-2xl tracking-widest text-white">CINE<span className="text-amber-400">VERSE</span></div>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <NavLink to="/" end className={linkClass} data-testid="nav-home">Home</NavLink>
            <NavLink to="/browse" className={linkClass} data-testid="nav-browse">Browse</NavLink>
            <NavLink to="/browse?tab=series" className={linkClass} data-testid="nav-series">TV Series</NavLink>
            <NavLink to="/threads" className={linkClass} data-testid="nav-threads">Forum</NavLink>
            {user && <NavLink to="/watchlist" className={linkClass} data-testid="nav-watchlist">Watchlist</NavLink>}
            {user && ["moderator", "admin"].includes(user.role) && (
              <NavLink to="/admin" className={linkClass} data-testid="nav-admin">{user.role === "admin" ? "Admin" : "Mod"}</NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold hidden sm:inline-flex" data-testid="nav-create-btn">
                    <Plus className="w-4 h-4 mr-1" /> Create
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#14181f] border-white/10 text-white">
                  <DropdownMenuLabel>Add to CineVerse</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={() => startCreate("movie")} data-testid="create-movie-menu"><Film className="w-4 h-4 mr-2" /> New Movie</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => startCreate("series")} data-testid="create-series-menu"><Sparkles className="w-4 h-4 mr-2" /> New TV Series</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => startCreate("actor")} data-testid="create-actor-menu"><User className="w-4 h-4 mr-2" /> New Actor</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full hover:bg-white/5 p-1 pr-3 transition" data-testid="nav-user-menu">
                    <Avatar className="h-8 w-8">
                      {user.avatar_url ? <AvatarImage src={fileUrl(user.avatar_url)} alt={user.name} /> : null}
                      <AvatarFallback className="bg-amber-500 text-black font-bold">{initial}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-sm text-slate-200">{user.name}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#14181f] border-white/10 text-white">
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={() => navigate(`/user/${user.id}`)} data-testid="menu-profile"><User className="w-4 h-4 mr-2" /> My Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/watchlist")} data-testid="menu-watchlist"><Bookmark className="w-4 h-4 mr-2" /> Watchlist</DropdownMenuItem>
                  {["moderator", "admin"].includes(user.role) && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} data-testid="menu-admin"><Shield className="w-4 h-4 mr-2" /> {user.role === "admin" ? "Admin" : "Moderator"} Console</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout"><LogOut className="w-4 h-4 mr-2" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" className="text-slate-200 hover:bg-white/5 hover:text-white" onClick={() => navigate("/login")} data-testid="nav-login-btn">Sign In</Button>
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={() => navigate("/register")} data-testid="nav-register-btn">Get Started</Button>
              </>
            )}
          </div>
        </div>
      </div>
      <EntityEditDialog open={createOpen} onOpenChange={setCreateOpen} entityType={createKind} entity={null} onSaved={onCreated} />
    </header>
  );
}
