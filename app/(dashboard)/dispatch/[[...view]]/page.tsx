import DispatchPortal from "@/modules/dispatch/DispatchPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <DispatchPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
