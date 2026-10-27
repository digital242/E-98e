import type { UserRole } from "@/types/erp";

export const ROLE_LABELS: Record<UserRole, string> = {
  "super-admin": "Super Admin",
  admin: "Admin",
  sales: "Sales",
  "plant-head": "Plant Head",
  production: "Production",
  store: "Store",
  qc: "Quality Control",
  dispatch: "Dispatch",
  finance: "Finance",
  "finance-executive": "Finance Executive",
  hr: "HR",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

/** Landing page after login, per role. */
export const DASHBOARD_REDIRECTS: Record<UserRole, string> = {
  "super-admin": "/super-admin/dashboard",
  admin: "/admin/users",
  sales: "/sales/dashboard",
  "plant-head": "/plant-head/dashboard",
  production: "/production/dashboard",
  store: "/store/dashboard",
  qc: "/qc/pending",
  dispatch: "/dispatch/orders",
  finance: "/finance/dashboard",
  "finance-executive": "/finance-executive/payment-verification",
  hr: "/hr/dashboard",
};

/** Maps the email prefix typed at /login to a role (e.g. plant@… → Plant Head). */
export const EMAIL_PREFIX_ROLE: Record<string, UserRole> = {
  superadmin: "super-admin",
  admin: "admin",
  sales: "sales",
  plant: "plant-head",
  production: "production",
  store: "store",
  qc: "qc",
  dispatch: "dispatch",
  finance: "finance",
  accounts: "finance-executive",
  hr: "hr",
};

export type Access = "full" | "read" | "none";

/**
 * Master authorization matrix (spec §10).
 * full = can act, read = read-only view, none = redirected away.
 */
export function accessFor(role: UserRole | null, pathname: string): Access {
  if (!role) return "none";
  const mod = pathname.split("/")[1] || "";
  if (role === "super-admin") return "full";
  if (mod === role) return "full";
  if (mod === "super-admin") return "none";
  if (role === "admin") return "read";
  if (role === "plant-head" && (mod === "production" || mod === "store")) return "read";
  if (role === "finance-executive" && pathname.startsWith("/finance/payment-verification")) return "full";
  if (role === "finance" && mod === "finance-executive") return "full";
  return "none";
}
