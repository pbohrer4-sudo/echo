import { notFound } from "next/navigation";
import { getWorkflowById } from "@/lib/workflows";
import { WorkflowEditor } from "@/components/workflow-editor";

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workflow = await getWorkflowById(id);
  if (!workflow) notFound();

  return <WorkflowEditor workflow={workflow} />;
}
