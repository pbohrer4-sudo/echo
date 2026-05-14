// Mistral OCR-Client. Wir nutzen die `document_annotation_format`-
// Erweiterung damit Mistral in einem Call OCR macht UND das Resultat
// schon nach JSON-Schema strukturiert zurückgibt — kein zweiter
// LLM-Hop zum Strukturieren nötig.
//
// Docs: https://docs.mistral.ai/capabilities/OCR/document_ai_overview/

const MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";
export const MISTRAL_OCR_MODEL = "mistral-ocr-latest";

export type MistralMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

export interface MistralOcrResult<T> {
  // Strukturiertes Ergebnis (gemäß übergebenem JSON-Schema). Null wenn
  // Mistral kein document_annotation zurückgegeben hat — Aufrufer muss
  // dann auf `markdown` zurückfallen.
  annotation: T | null;
  // Voll-Markdown des Dokuments (alle Seiten konkateniert). Brauchen
  // wir als Fallback und für Debugging.
  markdown: string;
  pagesProcessed: number;
  model: string;
}

interface MistralOcrPage {
  index?: number;
  markdown?: string;
}

interface MistralOcrResponse {
  pages?: MistralOcrPage[];
  document_annotation?: string | Record<string, unknown>;
  model?: string;
  usage_info?: {
    pages_processed?: number;
  };
}

export interface OcrSchema {
  // Frei-formuliertes JSON-Schema (object, properties, …). Mistral
  // wickelt das in das outer `json_schema`-Envelope.
  schema: Record<string, unknown>;
  name: string;
  description?: string;
}

export async function mistralOcr<T>({
  base64,
  mediaType,
  schema,
  apiKey,
}: {
  base64: string;
  mediaType: MistralMediaType;
  schema: OcrSchema;
  apiKey?: string | null;
}): Promise<MistralOcrResult<T>> {
  const key = apiKey ?? process.env.MISTRAL_API_KEY;
  if (!key) {
    throw new Error(
      "MISTRAL_API_KEY ist nicht gesetzt — bitte Server-Env-Variable konfigurieren oder einen BYO-Key im Profil hinterlegen.",
    );
  }

  const isPdf = mediaType === "application/pdf";
  const dataUrl = `data:${mediaType};base64,${base64}`;

  const body = {
    model: MISTRAL_OCR_MODEL,
    document: isPdf
      ? { type: "document_url", document_url: dataUrl }
      : { type: "image_url", image_url: dataUrl },
    document_annotation_format: {
      type: "json_schema",
      json_schema: {
        name: schema.name,
        description: schema.description ?? schema.name,
        strict: false,
        schema: schema.schema,
      },
    },
  };

  const res = await fetch(MISTRAL_OCR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mistral OCR ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as MistralOcrResponse;

  let annotation: T | null = null;
  const raw = data.document_annotation;
  if (typeof raw === "string" && raw.trim()) {
    try {
      annotation = JSON.parse(raw) as T;
    } catch {
      annotation = null;
    }
  } else if (raw && typeof raw === "object") {
    annotation = raw as T;
  }

  const markdown = (data.pages ?? [])
    .map((p) => p?.markdown ?? "")
    .filter(Boolean)
    .join("\n\n");

  return {
    annotation,
    markdown,
    pagesProcessed: data.usage_info?.pages_processed ?? data.pages?.length ?? 0,
    model: data.model ?? MISTRAL_OCR_MODEL,
  };
}
