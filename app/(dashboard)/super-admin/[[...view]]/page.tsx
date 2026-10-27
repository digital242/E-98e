import SuperAdminPortal from "@/modules/super-admin/SuperAdminPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <SuperAdminPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
