import AdminPortal from "@/modules/admin/AdminPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <AdminPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
