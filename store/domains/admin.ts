import type { CompanySettings, Customer, Product, RawMaterial, User, UserRole, Vendor } from "@/types/erp";
import { fmtINR2 as inr } from "@/lib/calc";
import { Get, Tx, assert, audit, must, uid } from "./shared";

export const adminActions = (tx: Tx, _get: Get) => ({
  addUser: (input: { name: string; email: string; role: UserRole }) =>
    tx((d) => {
      const email = input.email.trim().toLowerCase();
      assert(input.name.trim(), "Name is required");
      assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), "Enter a valid email");
      assert(!d.users.some((u) => u.email === email), "A user with this email already exists");
      const u: User = { id: uid("usr"), name: input.name.trim(), email, role: input.role, active: true };
      d.users.push(u);
      audit(d, "USER_ADDED", email, input.role);
      return u;
    }),

  updateUser: (id: string, patch: Partial<Pick<User, "name" | "role" | "active">>) =>
    tx((d) => {
      const u = must(d.users.find((x) => x.id === id), "User not found");
      if (patch.active === false && u.role === "super-admin") {
        assert(d.users.filter((x) => x.role === "super-admin" && x.active).length > 1, "Cannot deactivate the last Super Admin");
      }
      Object.assign(u, patch);
      audit(d, "USER_UPDATED", u.email, JSON.stringify(patch));
    }),

  updateCompany: (patch: Partial<CompanySettings>) =>
    tx((d) => {
      Object.assign(d.company, patch);
      audit(d, "COMPANY_UPDATED", "settings", Object.keys(patch).join(", "));
    }),

  upsertProduct: (p: Omit<Product, "id"> & { id?: string }) =>
    tx((d) => {
      assert(p.sku.trim() && p.name.trim(), "SKU and name are required");
      assert(p.price >= 0, "Price cannot be negative");
      const existing = p.id ? d.products.find((x) => x.id === p.id) : undefined;
      if (existing) Object.assign(existing, p);
      else {
        assert(!d.products.some((x) => x.sku === p.sku), "SKU already exists");
        d.products.push({ ...p, id: uid("prd") });
      }
      audit(d, existing ? "PRODUCT_UPDATED" : "PRODUCT_ADDED", p.sku, p.name);
    }),

  upsertCustomer: (c: Omit<Customer, "id"> & { id?: string }) =>
    tx((d) => {
      assert(c.name.trim(), "Customer name is required");
      const existing = c.id ? d.customers.find((x) => x.id === c.id) : undefined;
      if (existing) Object.assign(existing, c);
      else d.customers.push({ ...c, id: uid("cus") });
      audit(d, existing ? "CUSTOMER_UPDATED" : "CUSTOMER_ADDED", c.name, `Credit limit ${inr(c.creditLimit)}`);
    }),

  upsertVendor: (v: Omit<Vendor, "id"> & { id?: string }) =>
    tx((d) => {
      assert(v.name.trim(), "Vendor name is required");
      const existing = v.id ? d.vendors.find((x) => x.id === v.id) : undefined;
      if (existing) Object.assign(existing, v);
      else d.vendors.push({ ...v, id: uid("ven") });
      audit(d, existing ? "VENDOR_UPDATED" : "VENDOR_ADDED", v.name, "");
    }),

  addRawMaterial: (m: Omit<RawMaterial, "id" | "reserved">) =>
    tx((d) => {
      assert(m.code.trim() && m.name.trim(), "Code and name are required");
      assert(!d.rawMaterials.some((x) => x.code === m.code), "Material code already exists");
      d.rawMaterials.push({ ...m, id: uid("rm"), reserved: 0 });
      audit(d, "MATERIAL_ADDED", m.code, m.name);
    }),
});
