import type { gmail_v1 } from "googleapis";
import { getGoogleSession, type GoogleContext } from "../clients";

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export interface EmailMessage extends EmailSummary {
  body: string;
  labelIds: string[];
}

function header(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

/** Walks the MIME tree preferring text/plain, falling back to stripped HTML. */
function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  const decode = (data?: string | null) =>
    data ? Buffer.from(data, "base64url").toString("utf8") : "";

  if (payload.body?.data && !payload.parts?.length) {
    const text = decode(payload.body.data);
    return payload.mimeType === "text/html" ? stripHtml(text) : text;
  }

  const parts = payload.parts ?? [];
  const plain = parts.find((p) => p.mimeType === "text/plain");
  if (plain?.body?.data) return decode(plain.body.data);

  const html = parts.find((p) => p.mimeType === "text/html");
  if (html?.body?.data) return stripHtml(decode(html.body.data));

  for (const part of parts) {
    const nested = extractBody(part);
    if (nested) return nested;
  }
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strips CR/LF from header values. Without this a crafted subject or recipient
 * could inject extra SMTP headers (e.g. a hidden Bcc) into the raw message.
 */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function toSummary(message: gmail_v1.Schema$Message): EmailSummary {
  const headers = message.payload?.headers ?? undefined;
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject"),
    date: header(headers, "Date"),
    snippet: message.snippet ?? "",
    isUnread: (message.labelIds ?? []).includes("UNREAD"),
  };
}

export interface SearchMessagesParams extends GoogleContext {
  /** Gmail search syntax, e.g. `is:unread from:boss@corp.com newer_than:7d`. */
  query?: string;
  maxResults?: number;
}

export async function searchMessages(
  params: SearchMessagesParams,
): Promise<EmailSummary[]> {
  const { clients } = await getGoogleSession(params);
  const list = await clients.gmail.users.messages.list({
    userId: "me",
    q: params.query,
    maxResults: params.maxResults ?? 10,
  });

  const ids = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  const messages = await Promise.all(
    ids.map((id) =>
      clients.gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      }),
    ),
  );

  return messages.map((response) => toSummary(response.data));
}

export async function getMessage(
  params: GoogleContext & { messageId: string },
): Promise<EmailMessage> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.gmail.users.messages.get({
    userId: "me",
    id: params.messageId,
    format: "full",
  });

  return {
    ...toSummary(data),
    body: extractBody(data.payload ?? undefined),
    labelIds: data.labelIds ?? [],
  };
}

export interface ComposeParams extends GoogleContext {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  threadId?: string;
}

function buildRawMessage(params: ComposeParams): string {
  const lines = [
    `To: ${sanitizeHeader(params.to)}`,
    params.cc ? `Cc: ${sanitizeHeader(params.cc)}` : null,
    `Subject: ${sanitizeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    params.body,
  ].filter((line): line is string => line !== null);

  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

/** Creates a draft. Safe to run without approval — nothing leaves the account. */
export async function draftEmail(
  params: ComposeParams,
): Promise<{ draftId: string }> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: buildRawMessage(params), threadId: params.threadId },
    },
  });
  return { draftId: data.id ?? "" };
}

/** High impact: this leaves the user's account. Gate behind an approval. */
export async function sendEmail(
  params: ComposeParams,
): Promise<{ messageId: string }> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: buildRawMessage(params), threadId: params.threadId },
  });
  return { messageId: data.id ?? "" };
}

export async function modifyLabels(
  params: GoogleContext & {
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  },
): Promise<{ labelIds: string[] }> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.gmail.users.messages.modify({
    userId: "me",
    id: params.messageId,
    requestBody: {
      addLabelIds: params.addLabelIds,
      removeLabelIds: params.removeLabelIds,
    },
  });
  return { labelIds: data.labelIds ?? [] };
}

export async function markAsRead(
  params: GoogleContext & { messageId: string },
): Promise<{ labelIds: string[] }> {
  return modifyLabels({ ...params, removeLabelIds: ["UNREAD"] });
}

export async function archiveMessage(
  params: GoogleContext & { messageId: string },
): Promise<{ labelIds: string[] }> {
  return modifyLabels({ ...params, removeLabelIds: ["INBOX"] });
}
