# Roadmap to production

What the prototype does today, and what to add before real use (spec §14–15).

| Area | Today | Next |
|---|---|---|
| Database | Zustand store persisted to the browser's LocalStorage (`erp-store`); each browser has its own copy. API routes use a server-side in-memory copy. | PostgreSQL + Prisma. `types/erp.ts` is already table-shaped (string ids, foreign keys). Move `store/domains/*` actions server-side as Prisma transactions; the UI calls them through `lib/apiClient.ts`. |
| Auth | Email → role lookup, no password check; client-side route guard. | NextAuth with bcrypt-hashed passwords, HttpOnly session cookie, `middleware.ts` guards using `accessFor()` from `lib/routeConfig.ts`. |
| Transactions | Each action is atomic in the browser (immer). | `prisma.$transaction` with row locks on stock for material issue and dispatch. |
| Real-time | Each user sees their own browser's data. | Shared database + WebSocket/Pusher updates to the Plant Head dashboard. |
| Accounting | Invoices, receipts, credit notes, vendor payments, GST position. | Chart of accounts and double-entry journals; GSTR-1/3B export; e-invoice (IRN) and e-way bill API; Tally/Zoho sync. |
| Customer portal | Not built (as in spec). | Customer role: order tracking, invoice download, raise RMA. |
| Biometric | Simulated sync. | Import from the attendance device's export/API. |
| Company data | Placeholder address, GSTIN, bank. | Fill in Admin → Company Settings. |
