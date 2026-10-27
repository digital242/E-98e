"use client";
import { useState } from "react";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { Btn, Field, Modal } from "./ui";

const SOURCES = ["Website enquiry", "IndiaMART", "TradeIndia", "Referral", "Exhibition", "Cold call", "Tender", "Existing customer"];

export default function CreateLead({ onClose }: { onClose: () => void }) {
  const createLead = useERPStore((s) => s.createLead);
  const [f, setF] = useState({ company: "", contact: "", phone: "", email: "", city: "", state: "Maharashtra", requirement: "", source: SOURCES[0] });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (run(() => createLead(f), (l) => `Lead ${l.leadNo} created`)) onClose();
  };
  return (
    <Modal title="New lead" onClose={onClose} footer={<><Btn onClick={onClose} readOnlySafe>Cancel</Btn><Btn variant="primary" onClick={save}>Create lead</Btn></>}>
      <div className="form-grid">
        <Field label="Company *"><input value={f.company} onChange={set("company")} /></Field>
        <Field label="Contact person *"><input value={f.contact} onChange={set("contact")} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="City"><input value={f.city} onChange={set("city")} /></Field>
        <Field label="State" hint="Decides CGST+SGST vs IGST"><input value={f.state} onChange={set("state")} /></Field>
        <Field label="Source">
          <select value={f.source} onChange={set("source")}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Requirement" full><textarea value={f.requirement} onChange={set("requirement")} placeholder="Product, load class, size, approx. qty, site" /></Field>
      </div>
    </Modal>
  );
}
