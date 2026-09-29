import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { Bell, Inbox as InboxIcon, MessageSquare, Ban } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const typeIcon = {
  direct_thread: <MessageSquare className="w-4 h-4 text-amber-400" />,
  direct_thread_reply: <MessageSquare className="w-4 h-4 text-amber-400" />,
  thread_reply: <MessageSquare className="w-4 h-4 text-sky-400" />,
  suspension: <Ban className="w-4 h-4 text-rose-400" />,
};

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  const fetchCount = async () => {
    try {
      const r = await api.get("/notifications/unread-count");
      setCount(r.data.count || 0);
    } catch { /* ignore */ }
  };

  const fetchList = async () => {
    try {
      const r = await api.get("/notifications", { params: { limit: 20 } });
      setItems(r.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchCount();
    timerRef.current = setInterval(fetchCount, 30000);
    return () => timerRef.current && clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (open) fetchList();
  }, [open]);

  const onOpen = async (n) => {
    if (!n.read) {
      try { await api.patch(`/notifications/${n.id}/read`); } catch { /* ignore */ }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    try { await api.post("/notifications/mark-all-read"); } catch { /* ignore */ }
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setCount(0);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-2 rounded-full hover:bg-white/5 transition"
          data-testid="nav-notification-bell"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-slate-200" />
          {count > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
              data-testid="notification-unread-count"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-[#14181f] border-white/10 text-white w-[360px] max-h-[70vh] overflow-y-auto p-0" data-testid="notification-dropdown">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <DropdownMenuLabel className="px-0 py-0 text-slate-200">Notifications</DropdownMenuLabel>
          {items.some((x) => !x.read) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-white/5"
              onClick={markAll}
              data-testid="notification-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500" data-testid="notification-empty">
            No notifications yet
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onOpen(n)}
              className={`w-full text-left flex items-start gap-3 px-3 py-3 border-b border-white/5 hover:bg-white/5 transition ${!n.read ? "bg-amber-500/5" : ""}`}
              data-testid={`notification-item-${n.id}`}
            >
              <div className="mt-1 flex-shrink-0">
                {n.from_user_avatar ? (
                  <img src={fileUrl(n.from_user_avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-white/10" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-300">
                    {typeIcon[n.type] || <Bell className="w-4 h-4 text-slate-400" />}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-white line-clamp-1">{n.title}</div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />}
                </div>
                {n.body && <div className="mt-0.5 text-xs text-slate-400 line-clamp-2">{n.body}</div>}
                <div className="mt-1 text-[11px] text-slate-500">{timeAgo(n.created_at)}</div>
              </div>
            </button>
          ))
        )}
        <DropdownMenuSeparator className="bg-white/10 m-0" />
        <DropdownMenuItem
          className="justify-center py-2 text-amber-400 focus:text-amber-300 focus:bg-white/5"
          onClick={() => { setOpen(false); navigate("/inbox"); }}
          data-testid="notification-open-inbox"
        >
          <InboxIcon className="w-4 h-4 mr-2" /> Open inbox
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
