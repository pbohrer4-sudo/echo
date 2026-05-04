"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowStatus,
} from "@/lib/types";

export async function createWorkflow(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "Neuer Workflow";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name,
      nodes: [],
      edges: [],
    })
    .select("id")
    .single();
  if (error) {
    redirect(
      `/integrations/workflows?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/integrations/workflows");
  redirect(`/integrations/workflows/${data!.id}`);
}

interface SaveGraphPayload {
  id: string;
  name?: string;
  description?: string | null;
  status?: WorkflowStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export async function saveWorkflowGraph(payload: SaveGraphPayload) {
  const supabase = await createClient();
  const update: Record<string, unknown> = {
    nodes: payload.nodes ?? [],
    edges: payload.edges ?? [],
    updated_at: new Date().toISOString(),
  };
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.status !== undefined) update.status = payload.status;

  const { error } = await supabase
    .from("workflows")
    .update(update)
    .eq("id", payload.id);
  if (error) throw error;

  revalidatePath("/integrations/workflows");
  revalidatePath(`/integrations/workflows/${payload.id}`);
}

// Seeds a representative HubSpot-sync workflow showing both green
// (live, ECHO-native) and red (V2, external) nodes with branching
// after a filter. Used by the "Demo-Workflow" button on the list page.
export async function createDemoWorkflow() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tNew = "trigger_demo1";
  const fScope = "filter_demo1";
  const aLookup = "action_demo1";
  const aPush = "action_demo2";
  const aReminder = "action_demo3";
  const aTag = "action_demo4";

  const nodes: WorkflowNode[] = [
    {
      id: tNew,
      type: "custom",
      position: { x: 0, y: 100 },
      data: {
        kind: "trigger",
        subtype: "trigger.person_created",
        label: "Person erstellt",
        config: {},
      },
    },
    {
      id: fScope,
      type: "custom",
      position: { x: 300, y: 100 },
      data: {
        kind: "filter",
        subtype: "filter.scope",
        label: "Nur work",
        config: { scope: "work" },
      },
    },
    {
      id: aLookup,
      type: "custom",
      position: { x: 600, y: 0 },
      data: {
        kind: "action",
        subtype: "action.lookup_hubspot",
        label: "HubSpot suchen",
        config: { match_field: "email" },
      },
    },
    {
      id: aPush,
      type: "custom",
      position: { x: 900, y: 0 },
      data: {
        kind: "action",
        subtype: "action.push_hubspot",
        label: "Wenn neu: anlegen",
        config: {},
      },
    },
    {
      id: aReminder,
      type: "custom",
      position: { x: 600, y: 200 },
      data: {
        kind: "action",
        subtype: "action.create_reminder",
        label: "Welcome-Reminder in 7 Tagen",
        config: {
          person_id_field: "person.id",
          text: "Welcome-Mail an neue Person",
          remind_in_days: 7,
        },
      },
    },
    {
      id: aTag,
      type: "custom",
      position: { x: 600, y: 360 },
      data: {
        kind: "action",
        subtype: "action.add_tag",
        label: "Tag: New-Lead",
        config: { tag: "New-Lead" },
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    {
      id: "e_demo_1",
      source: tNew,
      target: fScope,
      sourceHandle: "right-source",
      targetHandle: "left-target",
    },
    {
      id: "e_demo_2",
      source: fScope,
      target: aLookup,
      sourceHandle: "right-source",
      targetHandle: "left-target",
    },
    {
      id: "e_demo_3",
      source: aLookup,
      target: aPush,
      sourceHandle: "right-source",
      targetHandle: "left-target",
    },
    {
      id: "e_demo_4",
      source: fScope,
      target: aReminder,
      sourceHandle: "right-source",
      targetHandle: "left-target",
    },
    {
      id: "e_demo_5",
      source: fScope,
      target: aTag,
      sourceHandle: "right-source",
      targetHandle: "left-target",
    },
  ];

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name: "Demo · Neuer Kontakt → HubSpot + Welcome",
      description:
        "Beispiel — zeigt Live (grün) + V2 (rot) gemischt mit Branch nach Scope-Filter.",
      nodes,
      edges,
    })
    .select("id")
    .single();
  if (error) {
    redirect(
      `/integrations/workflows?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/integrations/workflows");
  redirect(`/integrations/workflows/${data!.id}`);
}

export async function deleteWorkflow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflows")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/integrations/workflows");
  redirect("/integrations/workflows");
}
