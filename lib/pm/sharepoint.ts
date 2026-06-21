import { createClient } from "@/lib/supabase/server";
import type { PmDepartment } from "./types";

// SharePoint integration for the department knowledge base.
//
// The cached folder tree in pm_sharepoint_folders is the source of truth
// the AI files against. It is populated either by syncFolders() (live
// Microsoft Graph) or by seedDemoFolders() (no tenant required). All Graph
// calls are best-effort: if no token/drive is configured the module still
// works against the cache, so the filing UX never hard-depends on a live
// SharePoint connection.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface SharePointFolder {
  id: string;
  path: string;
  name: string;
  item_id: string | null;
  drive_id: string | null;
}

// Resolve a Microsoft Graph access token for the current user. Prefers the
// token persisted from the Microsoft (Entra ID) SSO login
// (service_connections, provider 'microsoft', Files/Sites scope); falls back
// to the MS_GRAPH_TOKEN env var for local/dev or service scenarios. Returns
// null when neither is available, in which case Graph calls are skipped and
// the module operates against the cached folder tree only.
async function getGraphToken(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("service_connections")
        .select("access_token, token_expires_at")
        .eq("provider", "microsoft")
        .eq("status", "connected")
        .is("deleted_at", null)
        .maybeSingle();
      if (data?.access_token) {
        const exp = data.token_expires_at
          ? new Date(data.token_expires_at).getTime()
          : 0;
        // Use it unless we know it has expired (a fresh login refreshes it).
        if (!exp || exp > Date.now()) return data.access_token as string;
      }
    }
  } catch {
    // fall through to env
  }
  return process.env.MS_GRAPH_TOKEN || null;
}

export async function listFolders(
  departmentId: string,
): Promise<SharePointFolder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_sharepoint_folders")
    .select("id, path, name, item_id, drive_id")
    .eq("department_id", departmentId)
    .order("path", { ascending: true });
  return (data ?? []) as SharePointFolder[];
}

// Enumerate folders under a department's SharePoint drive root via Graph
// (breadth-first, capped depth) and upsert them into the cache. Returns the
// number of folders synced. No-op (returns 0) when not configured.
export async function syncFolders(
  department: PmDepartment,
  maxDepth = 3,
): Promise<number> {
  const token = await getGraphToken();
  const driveId = department.sharepoint_drive_id;
  if (!token || !driveId) return 0;

  const root = department.sharepoint_root_path?.replace(/^\/+|\/+$/g, "") ?? "";
  const collected: { name: string; path: string; itemId: string }[] = [];

  // Queue of { graphPath, displayPath } to expand.
  const queue: { graphPath: string; displayPath: string; depth: number }[] = [
    {
      graphPath: root ? `root:/${root}:` : "root",
      displayPath: root ? `/${root}` : "",
      depth: 0,
    },
  ];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.depth >= maxDepth) continue;
    const url = `${GRAPH_BASE}/drives/${driveId}/${node.graphPath}/children?$select=id,name,folder,parentReference`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      break; // network/Graph unavailable — keep whatever we have
    }
    if (!res.ok) break;
    const json = (await res.json()) as {
      value?: Array<{ id: string; name: string; folder?: unknown }>;
    };
    for (const item of json.value ?? []) {
      if (!item.folder) continue;
      const path = `${node.displayPath}/${item.name}`;
      collected.push({ name: item.name, path, itemId: item.id });
      queue.push({
        graphPath: `items/${item.id}`,
        displayPath: path,
        depth: node.depth + 1,
      });
    }
  }

  if (collected.length === 0) return 0;
  return upsertFolders(department.workspace_id, department.id, driveId, collected);
}

async function upsertFolders(
  workspaceId: string,
  departmentId: string,
  driveId: string | null,
  folders: { name: string; path: string; itemId: string | null }[],
): Promise<number> {
  const supabase = await createClient();
  const rows = folders.map((f) => ({
    workspace_id: workspaceId,
    department_id: departmentId,
    drive_id: driveId,
    item_id: f.itemId,
    name: f.name,
    path: f.path,
    synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("pm_sharepoint_folders")
    .upsert(rows, { onConflict: "department_id,path" });
  if (error) return 0;
  return rows.length;
}

// Seed a plausible folder tree so the suggestion flow is demonstrable
// without a live tenant. Idempotent via the unique (department_id, path).
export async function seedDemoFolders(
  workspaceId: string,
  departmentId: string,
  deptName: string,
): Promise<void> {
  const base = `/${deptName}`;
  const paths = [
    base,
    `${base}/Kampagnen`,
    `${base}/Kampagnen/2026`,
    `${base}/Briefings`,
    `${base}/Call-Transkripte`,
    `${base}/Assets/Video`,
    `${base}/Assets/Grafik`,
    `${base}/Entscheidungen`,
    `${base}/Vorlagen`,
  ];
  const folders = paths.map((p) => ({
    name: p.split("/").filter(Boolean).pop() ?? p,
    path: p,
    itemId: null as string | null,
  }));
  await upsertFolders(workspaceId, departmentId, null, folders);
}

// Move/upload a confirmed document into SharePoint. Best-effort: returns
// null when no live connection is configured (the DB record still tracks
// the confirmed destination path so a later sync can reconcile).
export async function fileToSharePoint(opts: {
  department: PmDepartment;
  folderPath: string;
  fileName: string;
  content: string;
}): Promise<{ itemId: string; webUrl: string } | null> {
  const token = await getGraphToken();
  const driveId = opts.department.sharepoint_drive_id;
  if (!token || !driveId) return null;

  const cleanFolder = opts.folderPath.replace(/^\/+|\/+$/g, "");
  const safeName = opts.fileName.replace(/[\\/:*?"<>|]/g, "-");
  const url = `${GRAPH_BASE}/drives/${driveId}/root:/${cleanFolder}/${safeName}:/content`;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: opts.content,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string; webUrl?: string };
    if (!json.id) return null;
    return { itemId: json.id, webUrl: json.webUrl ?? "" };
  } catch {
    return null;
  }
}
