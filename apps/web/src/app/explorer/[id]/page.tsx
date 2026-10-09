import { Workspace } from "../../components/workspace";
export default async function ExplorerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Workspace connectionId={id} />;
}
