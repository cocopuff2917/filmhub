import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Bell, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Left navy sidebar shared by the ThreadsList and ThreadDetail pages.
// Renders a "Back to CineVerse" link, Your Account, New Discussion button,
// plus a Categories list. Extra slots let ThreadDetail add its own sections.
export default function ForumSidebar({
  activeCategory,
  onNewDiscussion,
  extra, // ReactNode inserted between the New Discussion button and Categories
}) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const setCategory = (cat) => {
    const p = new URLSearchParams(params);
    if (!cat || cat === "all") p.delete("category");
    else p.set("category", cat);
    p.delete("status");
    setParams(p);
  };

  const categories = [
    { key: "all", label: "All" },
    { key: "support", label: "Support" },
    { key: "general", label: "General" },
    { key: "report", label: "Reports" },
  ];

  return (
    <aside
      className="w-full lg:w-64 lg:min-h-[calc(100vh-64px)] bg-[#0b1220] border-r border-white/5 flex-shrink-0"
      data-testid="forum-sidebar"
    >
      <div className="p-6 lg:sticky lg:top-16">
        <Link to="/" className="flex items-center gap-2 text-slate-300 hover:text-white text-sm mb-6" data-testid="forum-sidebar-back">
          <ArrowLeft className="w-4 h-4" /> Back to CineVerse
        </Link>

        {user && (
          <Link
            to={`/user/${user.id}`}
            className="flex flex-col items-center text-center mb-6 group"
            data-testid="forum-sidebar-account"
          >
            <div className="w-10 h-10 rounded-full bg-[#14181f] border border-white/10 flex items-center justify-center mb-2 group-hover:border-amber-500/40 transition">
              <Bell className="w-4 h-4 text-slate-300" />
            </div>
            <div className="text-xs text-slate-300 group-hover:text-white transition">Your Account</div>
          </Link>
        )}

        <Button
          onClick={onNewDiscussion}
          disabled={!user}
          className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 mb-6"
          data-testid="forum-sidebar-new-discussion"
        >
          New Discussion
        </Button>

        {extra}

        <div className="mt-2">
          <div className="text-right text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">
            Categories
          </div>
          <nav className="text-right space-y-1">
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`block w-full text-right text-sm py-1 pr-1 transition ${
                  activeCategory === c.key ? "text-amber-400" : "text-slate-400 hover:text-white"
                }`}
                data-testid={`forum-cat-${c.key}`}
              >
                {c.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </aside>
  );
}
