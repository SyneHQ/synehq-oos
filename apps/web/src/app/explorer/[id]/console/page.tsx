import { Workspace } from "../../../components/workspace";

export default async function ConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Workspace connectionId={id} initialView="console" />;
}
