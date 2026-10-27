"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Toasts from "@/components/Toasts";
import { AccessContext, useMounted } from "@/components/ui";
import { DASHBOARD_REDIRECTS, ROLE_LABELS, accessFor } from "@/lib/routeConfig";
import { useAuthStore } from "@/store/authStore";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const access = accessFor(role, pathname);

  // Client-side route guard: unauthenticated → /login, unauthorized → own dashboard.
  useEffect(() => {
    if (!mounted) return;
    if (!role) router.replace("/login");
    else if (access === "none") router.replace(DASHBOARD_REDIRECTS[role]);
  }, [mounted, role, access, router]);

  if (!mounted || !role || !user || access === "none") {
    return <div className="empty" style={{ paddingTop: 120 }}>Loading…</div>;
  }

  return (
    <div className="shell">
      <Sidebar role={role} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn sm menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Open menu">☰</button>
          <div className="grow" />
          <div className="user-chip">
            <div className="avatar" aria-hidden>
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <small>{ROLE_LABELS[role]}</small>
            </div>
          </div>
          <button
            className="btn sm"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </header>
        <main className="content">
          {access === "read" && <div className="readonly-banner">Read-only view — you can see this module but not change it.</div>}
          <AccessContext.Provider value={{ canEdit: access === "full" }}>{children}</AccessContext.Provider>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
