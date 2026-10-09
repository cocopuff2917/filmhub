import { useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function BlockUserButton({ userId, userName, onBlocked }) {
  const { user } = useAuth();
  const [blocking, setBlocking] = useState(false);

  if (!user || !userId || user.id === userId) return null;

  const block = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Block ${userName || "this user"}? Their public discussions, replies, and comments will be hidden from you.`)) return;
    setBlocking(true);
    try {
      await api.post("/users/blocked", { user_id: userId });
      toast.success(`${userName || "User"} blocked`);
      onBlocked?.(userId);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not block user");
    } finally {
      setBlocking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={block}
      disabled={blocking}
      title={`Block ${userName || "user"}`}
      aria-label={`Block ${userName || "user"}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
      data-testid={`block-user-${userId}`}
    >
      <Ban className="h-4 w-4" />
    </button>
  );
}
