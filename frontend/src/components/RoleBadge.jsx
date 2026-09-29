// Helper to render a role badge, preferring custom_role if present.
export function RoleBadge({ user, className = "" }) {
  const cr = user?.custom_role;
  if (cr) {
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest font-semibold ${className}`}
        style={{ color: cr.color, borderColor: cr.color + "66", background: cr.color + "22" }}
        data-testid="custom-role-badge"
      >
        {cr.name}
      </span>
    );
  }
  const role = user?.role || "user";
  if (role === "user") return null;
  const cls = role === "admin"
    ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
    : "bg-sky-500/15 text-sky-300 border-sky-500/40";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest font-semibold ${cls} ${className}`}>
      {role}
    </span>
  );
}
