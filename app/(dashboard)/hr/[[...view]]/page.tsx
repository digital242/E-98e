import HRPortal from "@/modules/hr/HRPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <HRPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
