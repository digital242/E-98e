"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ALL_ROLES, DASHBOARD_REDIRECTS, EMAIL_PREFIX_ROLE, ROLE_LABELS } from "@/lib/routeConfig";
import { useAuthStore } from "@/store/authStore";
import { useERPStore } from "@/store/erpStore";
import { Field, useMounted } from "@/components/ui";
import type { UserRole } from "@/types/erp";

const ROLE_HINTS: Record<UserRole, string> = {
  "super-admin": "Executive analytics",
  admin: "Users, settings, audit",
  sales: "Leads → orders",
  "plant-head": "Accept & plan orders",
  production: "Work orders, output",
  store: "Inventory & GRN",
  qc: "Inspection & EN 124",
  dispatch: "Vehicles & challans",
  finance: "Invoices, POs, payroll",
  "finance-executive": "Verify UTR, receipts",
  hr: "Attendance & salary",
};

export default function LoginPage() {
  const router = useRouter();
  const mounted = useMounted();
  const users = useERPStore((s) => s.users);
  const company = useERPStore((s) => s.company);
  const { role, login } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (mounted && role) router.replace(DASHBOARD_REDIRECTS[role]);
  }, [mounted, role, router]);

  const signIn = (r: UserRole, emailHint?: string) => {
    const user = users.find((u) => u.active && (emailHint ? u.email === emailHint : u.role === r));
    if (!user) {
      setError("No active user for this role. Ask the Admin to enable one.");
      return;
    }
    login(user.role, user);
    router.replace(DASHBOARD_REDIRECTS[user.role]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const addr = email.trim().toLowerCase();
    const exact = users.find((u) => u.email === addr);
    const prefixRole = EMAIL_PREFIX_ROLE[addr.split("@")[0]];
    if (!password) return setError("Enter your password");
    if (exact) {
      if (!exact.active) return setError("This account is deactivated");
      return signIn(exact.role, exact.email);
    }
    if (prefixRole) return signIn(prefixRole);
    setError("Unknown user. Use a company email such as plant@frpmanholecover.com");
  };

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={company.logoUrl || "/brand/thermodrain-logo.png"} alt="THERMODRAIN" />
        </div>
        <div>
          <h1>One system from enquiry to cash for FRP manhole covers & gratings.</h1>
          <p style={{ marginTop: 12 }}>
            Sales, plant planning, moulding, EN 124 quality checks, dispatch, GST invoicing, purchase and payroll — connected in one place for {company.legalName}
          </p>
        </div>
        <div className="login-flow" aria-label="Order flow">
          {["Lead", "Quotation", "Sales order", "Plant approval", "Work order", "Material issue", "Moulding", "QC", "Dispatch", "Invoice", "Payment"].map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card stack">
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>Use your company email.</p>
          </div>
          <form className="stack" onSubmit={submit}>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="store@frpmanholecover.com" autoComplete="username" />
            </Field>
            <Field label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {error && <div className="badge bad" style={{ whiteSpace: "normal" }}>{error}</div>}
            <button className="btn primary" type="submit">Sign in</button>
          </form>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Prototype quick access — sign in as a role:</div>
            <div className="role-grid">
              {ALL_ROLES.map((r) => {
                const u = mounted ? users.find((x) => x.role === r && x.active) : undefined;
                return (
                  <button key={r} className="role-btn" onClick={() => signIn(r)}>
                    <b>{ROLE_LABELS[r]}</b>
                    <span>{u && u.name !== ROLE_LABELS[r] ? u.name : ROLE_HINTS[r]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
