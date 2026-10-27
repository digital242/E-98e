"use client";
import { useState } from "react";
import type { CompanySettings, Customer, Product, UserRole, Vendor } from "@/types/erp";
import { fmtDateTime, fmtINR } from "@/lib/calc";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/routeConfig";
import { run, toast } from "@/store/notificationStore";
import { resetToCleanInstall, resetToDemoData, useERPStore } from "@/store/erpStore";
import { pickData, DATA_KEYS } from "@/store/createERP";
import type { ERPData } from "@/store/domains/shared";
import { Btn, Card, DataTable, Field, Modal, PageHeader, Search, StatusBadge, Tabs } from "@/components/ui";

export default function AdminPortal({ view }: { view: string }) {
  switch (view) {
    case "company": return <Company />;
    case "masters": return <Masters />;
    case "audit-logs": return <AuditLogs />;
    case "system": return <SystemTools />;
    default: return <Users />;
  }
}

function Users() {
  const s = useERPStore();
  const [f, setF] = useState<{ name: string; email: string; role: UserRole }>({ name: "", email: "", role: "sales" });
  return (
    <>
      <PageHeader title="Users & roles" subtitle="Each user has one role. The role decides which modules they can open (see the access matrix in the docs)." />
      <Card title="Add user">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@frpmanholecover.com" /></Field>
          <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as UserRole })}>{ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
          <Btn variant="primary" onClick={() => run(() => s.addUser(f), "User added") && setF({ name: "", email: "", role: "sales" })}>Add</Btn>
        </div>
      </Card>
      <div style={{ height: 14 }} />
      <Card flush>
        <DataTable
          rowKey={(u) => u.id}
          rows={s.users}
          columns={[
            { header: "Name", render: (u) => <b>{u.name}</b> },
            { header: "Email", render: (u) => <span className="mono">{u.email}</span> },
            { header: "Role", render: (u) => <select value={u.role} onChange={(e) => run(() => s.updateUser(u.id, { role: e.target.value as UserRole }), "Role changed")} style={{ width: 180 }} aria-label="Role">{ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select> },
            { header: "Status", render: (u) => <StatusBadge status={u.active ? "ACTIVE" : "INACTIVE"} /> },
            { header: "", render: (u) => <Btn size="sm" variant={u.active ? "danger" : undefined} onClick={() => run(() => s.updateUser(u.id, { active: !u.active }), u.active ? "User deactivated" : "User activated")}>{u.active ? "Deactivate" : "Activate"}</Btn> },
          ]}
        />
      </Card>
    </>
  );
}

function Company() {
  const s = useERPStore();
  const [f, setF] = useState<CompanySettings>(s.company);
  const set = (k: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > 400_000) return toast.error("Logo must be under 400 KB");
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  return (
    <>
      <PageHeader title="Company settings" subtitle="Printed on quotations, tax invoices, challans, POs and payslips" actions={<Btn variant="primary" onClick={() => run(() => s.updateCompany(f), "Settings saved")}>Save</Btn>} />
      <div className="grid grid-2">
        <Card title="Details">
          <div className="form-grid">
            <Field label="Legal name" full><input value={f.legalName} onChange={set("legalName")} /></Field>
            <Field label="Brand"><input value={f.brandName} onChange={set("brandName")} /></Field>
            <Field label="GSTIN"><input value={f.gstin} onChange={set("gstin")} /></Field>
            <Field label="Address" full><input value={f.address} onChange={set("address")} /></Field>
            <Field label="State" hint="Used to decide CGST+SGST vs IGST"><input value={f.state} onChange={set("state")} /></Field>
            <Field label="Phone"><input value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Email"><input value={f.email} onChange={set("email")} /></Field>
            <Field label="Website"><input value={f.website} onChange={set("website")} /></Field>
            <Field label="Bank"><input value={f.bankName} onChange={set("bankName")} /></Field>
            <Field label="Account no."><input value={f.bankAccount} onChange={set("bankAccount")} /></Field>
            <Field label="IFSC"><input value={f.ifsc} onChange={set("ifsc")} /></Field>
          </div>
        </Card>
        <Card title="Logo">
          <div className="stack">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.logoUrl || "/brand/thermodrain-logo.png"} alt="Logo preview" style={{ maxWidth: 320, height: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "#fff" }} />
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => onLogo(e.target.files?.[0])} aria-label="Upload logo" />
            <div className="row"><Btn size="sm" onClick={() => setF({ ...f, logoUrl: "/brand/thermodrain-logo.png" })}>Use default THERMODRAIN logo</Btn></div>
          </div>
        </Card>
      </div>
    </>
  );
}

function Masters() {
  const [tab, setTab] = useState<"products" | "customers" | "vendors">("products");
  return (
    <>
      <PageHeader title="Masters" subtitle="Products & price list, customers & credit limits, vendors & quoted rates" />
      <Tabs tabs={[{ id: "products", label: "Products" }, { id: "customers", label: "Customers" }, { id: "vendors", label: "Vendors" }]} value={tab} onChange={setTab} />
      {tab === "products" && <ProductMaster />}
      {tab === "customers" && <CustomerMaster />}
      {tab === "vendors" && <VendorMaster />}
    </>
  );
}

function ProductMaster() {
  const s = useERPStore();
  const [edit, setEdit] = useState<Product | null>(null);
  return (
    <>
      <Card flush>
        <DataTable
          rowKey={(p) => p.id}
          rows={s.products}
          columns={[
            { header: "SKU", render: (p) => <span className="mono">{p.sku}</span> },
            { header: "Product", render: (p) => <><b>{p.name}</b><div><small>{p.size}</small></div></> },
            { header: "Category", render: (p) => p.category },
            { header: "Load class", render: (p) => p.loadClass },
            { header: "Weight", num: true, render: (p) => `${p.weightKg} kg` },
            { header: "Price", num: true, render: (p) => fmtINR(p.price) },
            { header: "BOM lines", num: true, render: (p) => p.bom.length },
            { header: "", render: (p) => <Btn size="sm" onClick={() => setEdit(p)}>Edit price</Btn> },
          ]}
        />
      </Card>
      {edit && (
        <Modal title={`${edit.sku}`} onClose={() => setEdit(null)} footer={<><Btn readOnlySafe onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.upsertProduct(edit), "Product updated") && setEdit(null)}>Save</Btn></>}>
          <div className="form-grid">
            <Field label="Name" full><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="List price (₹)"><input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></Field>
            <Field label="Weight (kg)"><input type="number" value={edit.weightKg} onChange={(e) => setEdit({ ...edit, weightKg: Number(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function CustomerMaster() {
  const s = useERPStore();
  const blank: Omit<Customer, "id"> & { id?: string } = { name: "", gstin: "", city: "", state: "", contact: "", phone: "", creditLimit: 300000 };
  const [edit, setEdit] = useState<(Omit<Customer, "id"> & { id?: string }) | null>(null);
  const set = (k: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement>) => edit && setEdit({ ...edit, [k]: k === "creditLimit" ? Number(e.target.value) : e.target.value });
  return (
    <>
      <div className="toolbar"><Btn variant="primary" onClick={() => setEdit(blank)}>+ Customer</Btn></div>
      <Card flush>
        <DataTable
          rowKey={(c) => c.id}
          rows={s.customers}
          columns={[
            { header: "Customer", render: (c) => <b>{c.name}</b> },
            { header: "GSTIN", render: (c) => <span className="mono">{c.gstin}</span> },
            { header: "Location", render: (c) => `${c.city}, ${c.state}` },
            { header: "Contact", render: (c) => `${c.contact} ${c.phone}` },
            { header: "Credit limit", num: true, render: (c) => fmtINR(c.creditLimit) },
            { header: "", render: (c) => <Btn size="sm" onClick={() => setEdit(c)}>Edit</Btn> },
          ]}
        />
      </Card>
      {edit && (
        <Modal title={edit.id ? "Edit customer" : "New customer"} onClose={() => setEdit(null)} footer={<><Btn readOnlySafe onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.upsertCustomer(edit), "Customer saved") && setEdit(null)}>Save</Btn></>}>
          <div className="form-grid">
            <Field label="Name" full><input value={edit.name} onChange={set("name")} /></Field>
            <Field label="GSTIN"><input value={edit.gstin} onChange={set("gstin")} /></Field>
            <Field label="Credit limit (₹)"><input type="number" value={edit.creditLimit} onChange={set("creditLimit")} /></Field>
            <Field label="City"><input value={edit.city} onChange={set("city")} /></Field>
            <Field label="State"><input value={edit.state} onChange={set("state")} /></Field>
            <Field label="Contact"><input value={edit.contact} onChange={set("contact")} /></Field>
            <Field label="Phone"><input value={edit.phone} onChange={set("phone")} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function VendorMaster() {
  const s = useERPStore();
  const [edit, setEdit] = useState<(Omit<Vendor, "id"> & { id?: string }) | null>(null);
  return (
    <>
      <div className="toolbar"><Btn variant="primary" onClick={() => setEdit({ name: "", gstin: "", city: "", rates: {}, leadTimeDays: 7, rating: 4 })}>+ Vendor</Btn></div>
      <Card flush>
        <DataTable
          rowKey={(v) => v.id}
          rows={s.vendors}
          columns={[
            { header: "Vendor", render: (v) => <b>{v.name}</b> },
            { header: "City", render: (v) => v.city },
            { header: "Quoted materials", render: (v) => Object.entries(v.rates).map(([m, r]) => `${s.rawMaterials.find((x) => x.id === m)?.code ?? m} @ ₹${r}`).join(", ") },
            { header: "Lead time", num: true, render: (v) => `${v.leadTimeDays} d` },
            { header: "Rating", num: true, render: (v) => v.rating },
            { header: "", render: (v) => <Btn size="sm" onClick={() => setEdit(v)}>Edit</Btn> },
          ]}
        />
      </Card>
      {edit && (
        <Modal title={edit.id ? "Edit vendor" : "New vendor"} onClose={() => setEdit(null)} footer={<><Btn readOnlySafe onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.upsertVendor(edit), "Vendor saved") && setEdit(null)}>Save</Btn></>}>
          <div className="form-grid">
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="GSTIN"><input value={edit.gstin} onChange={(e) => setEdit({ ...edit, gstin: e.target.value })} /></Field>
            <Field label="City"><input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="Lead time (days)"><input type="number" value={edit.leadTimeDays} onChange={(e) => setEdit({ ...edit, leadTimeDays: Number(e.target.value) })} /></Field>
          </div>
          <h3 style={{ margin: "14px 0 8px" }}>Quoted rates (₹ per unit, blank = not supplied)</h3>
          <div className="form-grid">
            {s.rawMaterials.map((m) => (
              <Field key={m.id} label={`${m.code} (${m.unit})`}>
                <input type="number" value={edit.rates[m.id] ?? ""} onChange={(e) => { const rates = { ...edit.rates }; if (e.target.value === "") delete rates[m.id]; else rates[m.id] = Number(e.target.value); setEdit({ ...edit, rates }); }} />
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function AuditLogs() {
  const logs = useERPStore((s) => s.auditLogs);
  const [q, setQ] = useState("");
  const rows = logs.filter((l) => `${l.actor} ${l.role} ${l.action} ${l.entity} ${l.details}`.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change, who made it and when (latest 1,000 kept)" />
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Filter by user, action, document…" /></div>
      <Card flush>
        <DataTable
          rowKey={(l) => l.id}
          rows={rows}
          empty="No entries"
          columns={[
            { header: "When", render: (l) => <span className="nowrap">{fmtDateTime(l.at)}</span> },
            { header: "User", render: (l) => <>{l.actor}<div><small>{l.role}</small></div></> },
            { header: "Action", render: (l) => <span className="mono">{l.action}</span> },
            { header: "Document", render: (l) => <span className="mono">{l.entity}</span> },
            { header: "Details", render: (l) => l.details },
          ]}
        />
      </Card>
    </>
  );
}

function SystemTools() {
  const s = useERPStore();
  const [confirm, setConfirm] = useState<null | "demo" | "clean">(null);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(pickData(s), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `thermodrain-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = (file?: File) => {
    if (!file) return;
    file.text().then((t) => {
      try {
        const data = JSON.parse(t) as ERPData;
        const missing = DATA_KEYS.filter((k) => !(k in data));
        if (missing.length) throw new Error(`Backup is missing: ${missing.join(", ")}`);
        s.replaceData(data);
        toast.success("Backup restored");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Invalid backup file");
      }
    });
  };
  const counts = DATA_KEYS.filter((k) => Array.isArray(s[k])).map((k) => ({ k, n: (s[k] as unknown[]).length }));
  return (
    <>
      <PageHeader title="System" subtitle="Backup, restore and reset. Data currently lives in this browser (LocalStorage key erp-store)." />
      <div className="grid grid-2">
        <Card title="Backup & restore">
          <div className="stack">
            <div><Btn readOnlySafe onClick={exportJson}>Download JSON backup</Btn></div>
            <Field label="Restore from backup"><input type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} /></Field>
          </div>
        </Card>
        <Card title="Reset">
          <div className="stack">
            <div className="row"><Btn onClick={() => setConfirm("demo")}>Reload demo data</Btn><small>Sample orders at every stage</small></div>
            <div className="row"><Btn variant="danger" onClick={() => setConfirm("clean")}>Clean install</Btn><small>Keeps masters, deletes all transactions</small></div>
          </div>
        </Card>
      </div>
      <div style={{ height: 14 }} />
      <Card title="Table sizes">
        <div className="grid grid-4">{counts.map((c) => <div key={c.k}><small>{c.k}</small><div className="mono">{c.n}</div></div>)}</div>
      </Card>
      {confirm && (
        <Modal title="Are you sure?" onClose={() => setConfirm(null)} footer={<><Btn readOnlySafe onClick={() => setConfirm(null)}>Cancel</Btn><Btn variant="danger" onClick={() => { if (confirm === "demo") resetToDemoData(); else resetToCleanInstall(); toast.success("Done"); setConfirm(null); }}>Yes, replace data</Btn></>}>
          This replaces all data in this browser. Download a backup first if you need it.
        </Modal>
      )}
    </>
  );
}
