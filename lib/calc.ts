// Pure business calculations. No store access here, so everything is unit-testable.
import type { Employee, AttendanceRecord, LineItem, PayrollLine } from "@/types/erp";

export const GST_RATE = 0.18; // FRP covers / gratings (HSN 3925 / 7020) at 18%

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineAmount(l: LineItem): number {
  return round2(l.qty * l.rate * (1 - (l.discountPct || 0) / 100));
}

export function orderTotals(items: LineItem[]) {
  const subtotal = round2(items.reduce((s, l) => s + lineAmount(l), 0));
  const taxTotal = round2(subtotal * GST_RATE);
  return { subtotal, taxTotal, grandTotal: round2(subtotal + taxTotal) };
}

/** Intra-state supply → CGST + SGST; inter-state → IGST. */
export function gstSplit(subtotal: number, companyState: string, customerState: string) {
  const tax = round2(subtotal * GST_RATE);
  const sameState = companyState.trim().toLowerCase() === customerState.trim().toLowerCase();
  if (sameState) {
    const half = round2(tax / 2);
    return { cgst: half, sgst: round2(tax - half), igst: 0, total: round2(subtotal + tax) };
  }
  return { cgst: 0, sgst: 0, igst: tax, total: round2(subtotal + tax) };
}

// ---------- Payroll ----------
export const PF_RATE = 0.12; // employee share on basic, capped at ₹15,000 wage ceiling
export const PF_WAGE_CEILING = 15000;
export const ESI_RATE = 0.0075; // employee share
export const ESI_GROSS_LIMIT = 21000;
export const OT_MULTIPLIER = 2; // Factories Act: twice the ordinary rate

/** Maharashtra professional tax slab (monthly). */
export function professionalTax(grossEarned: number, month: string): number {
  if (grossEarned <= 7500) return 0;
  if (grossEarned <= 10000) return 175;
  return month.endsWith("-02") ? 300 : 200;
}

/** Simple monthly TDS estimate on annualised taxable income (new regime, FY 2025-26 slabs). */
export function monthlyTds(grossEarned: number): number {
  const annual = grossEarned * 12 - 75000; // standard deduction
  if (annual <= 1200000) return 0; // full rebate u/s 87A
  const slabs: [number, number][] = [
    [400000, 0],
    [800000, 0.05],
    [1200000, 0.1],
    [1600000, 0.15],
    [2000000, 0.2],
    [2400000, 0.25],
    [Infinity, 0.3],
  ];
  let tax = 0;
  let prev = 0;
  for (const [limit, rate] of slabs) {
    if (annual > prev) tax += (Math.min(annual, limit) - prev) * rate;
    prev = limit;
  }
  return Math.round((tax * 1.04) / 12); // + 4% cess
}

export function computePayrollLine(emp: Employee, att: AttendanceRecord | undefined, month: string): PayrollLine {
  const grossFixed = emp.basic + emp.hra + emp.allowances;
  const workingDays = att?.workingDays ?? 26;
  const payableDays = att ? Math.max(0, att.presentDays + att.paidLeave) : workingDays;
  const ratio = workingDays > 0 ? Math.min(1, payableDays / workingDays) : 0;
  const earnedBasic = emp.basic * ratio;
  const grossEarnedBase = grossFixed * ratio;
  const hourly = grossFixed / workingDays / 8;
  const otPay = round2((att?.otHours ?? 0) * hourly * OT_MULTIPLIER);
  const grossEarned = round2(grossEarnedBase + otPay);
  const pf = Math.round(Math.min(earnedBasic, PF_WAGE_CEILING) * PF_RATE);
  const esi = grossFixed <= ESI_GROSS_LIMIT ? Math.ceil(grossEarned * ESI_RATE) : 0;
  const pt = professionalTax(grossEarned, month);
  const tds = monthlyTds(grossEarned);
  const loan = Math.min(emp.loanEmi, Math.max(0, grossEarned - pf - esi - pt - tds));
  const net = round2(grossEarned - pf - esi - pt - tds - loan);
  return { employeeId: emp.id, payableDays, grossFixed, grossEarned, otPay, pf, esi, pt, tds, loan, net };
}

// ---------- Formatting ----------
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

export const fmtINR = (n: number) => inr.format(n || 0);
export const fmtINR2 = (n: number) => inr2.format(n || 0);
export const fmtNum = (n: number) => num.format(n || 0);

export function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Amount in words, Indian numbering — used on tax invoices. */
export function amountInWords(n: number): string {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? " " + a[x % 10] : ""}`);
  const three = (x: number) => (x >= 100 ? `${a[Math.floor(x / 100)]} Hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x));
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1e3);
  const rest = rupees % 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  let s = `${parts.join(" ")} Rupees`;
  if (paise) s += ` and ${two(paise)} Paise`;
  return `${s} Only`;
}
