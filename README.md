# THERMODRAIN ERP

Manufacturing ERP for **Thermoset Poly Products (I) Pvt Ltd.** (THERMODRAIN®): FRP/GRP manhole covers, Thermolite gratings, cover blocks, inspection chambers and pultruded structural sections.

It covers the full **order-to-cash** cycle (lead → quotation → sales order → plant approval → work order → material issue → moulding → EN 124 QC → dispatch → GST invoice → payment), plus **procure-to-pay**, **returns (RMA)** and **HR payroll**, across 11 role-based portals.

Built to the *Next.js ERP System — Master Technical & Architectural Specification v2.0*.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Sign in at `/login` with a company email (any password in this prototype), or use the quick-access role buttons:

| Role | Email | Lands on |
|---|---|---|
| Super Admin | superadmin@frpmanholecover.com | `/super-admin/dashboard` |
| Admin | admin@frpmanholecover.com | `/admin/users` |
| Sales | sales@frpmanholecover.com | `/sales/dashboard` |
| Plant Head | plant@frpmanholecover.com | `/plant-head/dashboard` |
| Production | production@frpmanholecover.com | `/production/dashboard` |
| Store (Shrimant Kanse) | store@frpmanholecover.com | `/store/dashboard` |
| QC | qc@frpmanholecover.com | `/qc/pending` |
| Dispatch | dispatch@frpmanholecover.com | `/dispatch/orders` |
| Finance | finance@frpmanholecover.com | `/finance/dashboard` |
| Finance Executive | accounts@frpmanholecover.com | `/finance-executive/payment-verification` |
| HR | hr@frpmanholecover.com | `/hr/dashboard` |

The app starts with demo data: six orders at different stages (plant review, credit hold, accepted, in QC, ready to dispatch, delivered), open indents and POs, and a payroll batch waiting for Finance. Reset it under **Admin → System**.

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.

## What each role does

- **Sales** — leads, samples, quotations / proforma invoices (price list, discounts, GST), convert to order with automatic credit-limit check, production status for customers, payment follow-up (log UTR), returns (RMA) and zero-value replacement orders.
- **Plant Head** — accept/reject incoming orders, plan work orders by machine & shift (with raw-material requirement vs stock), approve material requests against BOM and purchase indents, production analytics (yield, defects, output by shift). Read-only view of Production and Store.
- **Production** — start work orders, request material from BOM, acknowledge receipt, record moulded output per shift (hands over to QC), rework/scrap decisions.
- **Store** — raw-material stock with min-max reorder (auto indents), material issue slips (all-or-nothing; shortage raises an indent), manual indents, gate entry → incoming QC → GRN (debit note for rejects), finished goods.
- **QC** — inspect batches: dimension check, finish check, and **load test against the EN 124 class** (A15 15 kN … D400 400 kN — acceptance is blocked below the requirement); history, rework log, returns audit (restock/scrap).
- **Dispatch** — load vehicle (vehicle no. validation, e-way bill required above ₹50,000), printable delivery challan & gate pass, proof-of-delivery, returns gate entry.
- **Finance** — GST tax invoice per dispatch (CGST+SGST in-state, IGST inter-state, amount in words), payment verification, credit-hold release, vendor comparison statement → PO, **3-way match** (PO × GRN vs vendor bill) before vendor payment, credit notes, payroll approval & NEFT release, GST position.
- **Finance Executive** — verify UTRs against the bank statement, receipts, receivables ageing.
- **HR** — employees & salary structure, biometric attendance sync, regularisation, cutoff freeze, leave requests, payroll (pro-rated gross, PF 12% to ₹15k ceiling, ESI 0.75% to ₹21k gross, Maharashtra PT, TDS estimate, loan EMI), payslips.
- **Admin** — users & roles, company settings & logo (printed on all documents), product/customer/vendor masters, audit log, JSON backup/restore, reset.
- **Super Admin** — executive control center across all departments; full access everywhere.

## Architecture

```
app/                     Next.js 14 App Router
  (dashboard)/<module>/[[...view]]/page.tsx   one route per module; view = sub-page
  (dashboard)/layout.tsx role guard (client-side), sidebar, read-only mode
  api/                   REST endpoints (orders, production, qc, dispatch, finance/verify-payment)
  login/                 sign-in
modules/<module>/        portal components per role
components/              shared UI, printable documents, order timeline, create-* modals
store/
  createERP.ts           assembles the store; every action runs inside one immer transaction
  erpStore.ts            persisted Zustand store (LocalStorage key `erp-store`)
  domains/*.ts           business rules: sales, production (plant/QC), inventory, dispatch, finance, hr, admin
  authStore.ts           session (LocalStorage key `auth-storage`)
  notificationStore.ts   toasts
lib/
  calc.ts                GST, totals, payroll engine, formatting (unit-tested)
  mockData.ts            master data (products & BOMs, materials, customers, vendors, staff, users)
  seed.ts                builds demo data by running the real actions
  mockDB.ts              server-side in-memory DB for the API routes
  routeConfig.ts         role landing pages + authorization matrix
  navigationConfig.ts    sidebar registry
  apiClient.ts           typed client for the REST API
types/erp.ts             data model (SQL-shaped tables)
docs/project-flows/      business process documentation
tests/                   vitest: calculations + end-to-end business flows
```

**Every action is atomic.** Actions run inside an immer `produce` transaction: if any validation fails part-way (e.g. stock short on one line of a material issue), nothing is written. This covers the "transactional integrity" gap in spec §14 for the client-side prototype.

**Order status is derived, never typed in.** `recomputeOrder` works out production, QC, dispatch, payment and overall stage from work orders, inspections, dispatches and verified payments, so the stage can't drift from reality.

### API

All endpoints take JSON and the caller's role in the `x-erp-role` header (prototype auth — replace with NextAuth/JWT):

| Method | Route | Body | Roles |
|---|---|---|---|
| GET | `/api/orders?status=` | — | most roles |
| PATCH | `/api/orders` | `{ orderId, status: PLANT_HEAD_ACCEPTED \| PLANT_HEAD_REJECTED \| CREDIT_RELEASED, notes }` | plant-head, finance, admin, super-admin |
| POST | `/api/production` | `{ orderId, plannedQty?, machine, shift }` or `{ workOrderId, action: "activate" }` | plant-head, production |
| POST | `/api/qc` | `{ workOrderId \| orderId, acceptedQty, rejectedQty, loadTestKn, defects }` | qc, admin |
| POST | `/api/dispatch` | `{ orderId, vehicleNo, driverName, dispatchQty?, ewayBillNo? }` | dispatch |
| POST | `/api/finance/verify-payment` | `{ orderId, utrNumber, amount }` | finance, finance-executive |

The API runs on a server-side in-memory copy of the database using the same domain code as the UI. It is not synced with a browser's LocalStorage; it is the integration point that a real database will back.

## Before going live

See [docs/ROADMAP.md](docs/ROADMAP.md). In short: PostgreSQL + Prisma behind `store/domains`, NextAuth with hashed passwords and `middleware.ts` route guards, server-side transactions, e-invoice/e-way bill API, Tally/Zoho sync, customer portal.

Company details (address, GSTIN, bank) are placeholders — fill them in under **Admin → Company Settings** before printing documents. Customer and vendor names in the demo data are samples.
