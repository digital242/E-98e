import type { UserRole } from "@/types/erp";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavSection {
  module: string;
  title: string;
  items: NavItem[];
}

/** Master navigation registry, one section per module. */
export const NAV_SECTIONS: NavSection[] = [
  {
    module: "super-admin",
    title: "Executive",
    items: [{ label: "Control Center", href: "/super-admin/dashboard", icon: "◎" }],
  },
  {
    module: "sales",
    title: "Sales",
    items: [
      { label: "Dashboard", href: "/sales/dashboard", icon: "▦" },
      { label: "Leads", href: "/sales/leads", icon: "☎" },
      { label: "Samples", href: "/sales/samples", icon: "◇" },
      { label: "Quotations", href: "/sales/quotations", icon: "✎" },
      { label: "Sales Orders", href: "/sales/orders", icon: "▤" },
      { label: "Production Status", href: "/sales/production-status", icon: "⚙" },
      { label: "Payment Follow-up", href: "/sales/payment-followup", icon: "₹" },
      { label: "Returns (RMA)", href: "/sales/returns", icon: "↺" },
    ],
  },
  {
    module: "plant-head",
    title: "Plant Head",
    items: [
      { label: "Operations", href: "/plant-head/dashboard", icon: "▦" },
      { label: "Incoming Orders", href: "/plant-head/incoming-orders", icon: "⇣" },
      { label: "Production Planning", href: "/plant-head/planning", icon: "▥" },
      { label: "Material Approvals", href: "/plant-head/material-approvals", icon: "✓" },
      { label: "Indent Approvals", href: "/plant-head/indent-approvals", icon: "⧉" },
      { label: "Production Analytics", href: "/plant-head/production-analytics", icon: "◔" },
    ],
  },
  {
    module: "production",
    title: "Production",
    items: [
      { label: "Floor Dashboard", href: "/production/dashboard", icon: "▦" },
      { label: "Work Orders", href: "/production/work-orders", icon: "▤" },
      { label: "Material Requests", href: "/production/material-requests", icon: "⇡" },
      { label: "Record Output", href: "/production/production-work", icon: "⚙" },
      { label: "QC Handover & Rework", href: "/production/testing", icon: "⟲" },
    ],
  },
  {
    module: "store",
    title: "Store",
    items: [
      { label: "Store Dashboard", href: "/store/dashboard", icon: "▦" },
      { label: "Raw Inventory", href: "/store/raw-inventory", icon: "▣" },
      { label: "Material Issues", href: "/store/material-requests", icon: "⇢" },
      { label: "Purchase Indents", href: "/store/purchase-indents", icon: "⧉" },
      { label: "Gate Entry & GRN", href: "/store/goods-receipt", icon: "⇣" },
      { label: "Finished Goods", href: "/store/finished-goods", icon: "◫" },
    ],
  },
  {
    module: "qc",
    title: "Quality Control",
    items: [
      { label: "Pending Inspection", href: "/qc/pending", icon: "⌕" },
      { label: "Inspection History", href: "/qc/history", icon: "☰" },
      { label: "Rework Log", href: "/qc/rework", icon: "⟲" },
      { label: "Returns Audit", href: "/qc/returns", icon: "↺" },
    ],
  },
  {
    module: "dispatch",
    title: "Dispatch",
    items: [
      { label: "Ready to Dispatch", href: "/dispatch/orders", icon: "⇉" },
      { label: "In Transit & Delivery", href: "/dispatch/delivery", icon: "⛟" },
      { label: "Returns Gate Entry", href: "/dispatch/returns", icon: "↺" },
    ],
  },
  {
    module: "finance",
    title: "Finance",
    items: [
      { label: "Finance Dashboard", href: "/finance/dashboard", icon: "▦" },
      { label: "Tax Invoices", href: "/finance/invoices", icon: "⎙" },
      { label: "Payment Verification", href: "/finance/payment-verification", icon: "✓" },
      { label: "Credit Control", href: "/finance/credit-control", icon: "⚖" },
      { label: "Purchase Orders", href: "/finance/purchase-orders", icon: "⧉" },
      { label: "Vendor Payments", href: "/finance/vendor-payments", icon: "₹" },
      { label: "Credit Notes", href: "/finance/credit-notes", icon: "↺" },
      { label: "Payroll Approval", href: "/finance/payroll", icon: "☷" },
    ],
  },
  {
    module: "finance-executive",
    title: "Finance Executive",
    items: [
      { label: "Verify Payments", href: "/finance-executive/payment-verification", icon: "✓" },
      { label: "Receipts", href: "/finance-executive/receipts", icon: "⎙" },
      { label: "Overdue Accounts", href: "/finance-executive/overdue", icon: "⏱" },
    ],
  },
  {
    module: "hr",
    title: "HR",
    items: [
      { label: "HR Dashboard", href: "/hr/dashboard", icon: "▦" },
      { label: "Employees", href: "/hr/employees", icon: "☺" },
      { label: "Attendance", href: "/hr/attendance", icon: "◷" },
      { label: "Leave Requests", href: "/hr/leaves", icon: "✈" },
      { label: "Salary Preparation", href: "/hr/salary/prepare", icon: "₹" },
    ],
  },
  {
    module: "admin",
    title: "Administration",
    items: [
      { label: "Users & Roles", href: "/admin/users", icon: "☺" },
      { label: "Company Settings", href: "/admin/company", icon: "⌂" },
      { label: "Masters", href: "/admin/masters", icon: "▤" },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: "☰" },
      { label: "System", href: "/admin/system", icon: "⚙" },
    ],
  },
];

/** Sections visible to a role, in sidebar order. */
export function navigationForRole(role: UserRole): NavSection[] {
  if (role === "super-admin") return NAV_SECTIONS;
  if (role === "admin") return [NAV_SECTIONS.find((s) => s.module === "admin")!, ...NAV_SECTIONS.filter((s) => s.module !== "admin" && s.module !== "super-admin")];
  const own = NAV_SECTIONS.filter((s) => s.module === role);
  if (role === "plant-head") return [...own, ...NAV_SECTIONS.filter((s) => s.module === "production" || s.module === "store")];
  return own;
}
