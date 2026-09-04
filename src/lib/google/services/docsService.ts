import type { docs_v1 } from "googleapis";
import { getGoogleSession, type GoogleContext } from "../clients";

export interface GoogleDoc {
  documentId: string;
  title: string;
  url: string;
}

function docUrl(documentId: string): string {
  return `https://docs.google.com/document/d/${documentId}/edit`;
}

export async function createDoc(
  params: GoogleContext & { title: string; body?: string },
): Promise<GoogleDoc> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.docs.documents.create({
    requestBody: { title: params.title },
  });

  const documentId = data.documentId ?? "";
  if (params.body) {
    await appendText({ ...params, documentId, text: params.body });
  }

  return { documentId, title: data.title ?? params.title, url: docUrl(documentId) };
}

/**
 * Appends to the end of the document. Index 1 is the first valid insert
 * position in a Google Doc; the segment end is one past the trailing newline,
 * so we insert just before it.
 */
export async function appendText(
  params: GoogleContext & { documentId: string; text: string },
): Promise<{ documentId: string; url: string }> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.docs.documents.get({
    documentId: params.documentId,
  });

  const content = data.body?.content ?? [];
  const lastIndex = content.reduce(
    (max, element) => Math.max(max, element.endIndex ?? 1),
    1,
  );
  const insertAt = Math.max(1, lastIndex - 1);

  await clients.docs.documents.batchUpdate({
    documentId: params.documentId,
    requestBody: {
      requests: [
        { insertText: { location: { index: insertAt }, text: params.text } },
      ],
    },
  });

  return { documentId: params.documentId, url: docUrl(params.documentId) };
}

function flattenContent(content: docs_v1.Schema$StructuralElement[]): string {
  let text = "";
  for (const element of content) {
    for (const run of element.paragraph?.elements ?? []) {
      text += run.textRun?.content ?? "";
    }
    for (const row of element.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) {
        text += flattenContent(cell.content ?? []);
      }
    }
  }
  return text;
}

export async function readDoc(
  params: GoogleContext & { documentId: string },
): Promise<GoogleDoc & { text: string }> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.docs.documents.get({
    documentId: params.documentId,
  });

  return {
    documentId: params.documentId,
    title: data.title ?? "",
    url: docUrl(params.documentId),
    text: flattenContent(data.body?.content ?? []).trim(),
  };
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

/** Drive search, used by the briefing blueprint to pull meeting-relevant docs. */
export async function searchDrive(
  params: GoogleContext & { query: string; maxResults?: number },
): Promise<DriveFile[]> {
  const { clients } = await getGoogleSession(params);
  const escaped = params.query.replace(/'/g, "\\'");
  const { data } = await clients.drive.files.list({
    q: `fullText contains '${escaped}' and trashed = false`,
    pageSize: params.maxResults ?? 10,
    fields: "files(id, name, mimeType, modifiedTime)",
  });

  return (data.files ?? []).map((file) => ({
    id: file.id ?? "",
    name: file.name ?? "",
    mimeType: file.mimeType ?? "",
    modifiedTime: file.modifiedTime ?? undefined,
  }));
}
