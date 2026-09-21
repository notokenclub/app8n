/**
 * In-memory stand-ins for the googleapis clients, enabled by APP8N_MOCK_GOOGLE=1.
 *
 * The mock is stateful: a row appended to a sheet is returned by the next read,
 * and a sent message appears in the mailbox. That means connector code paths
 * (argument shaping, response mapping, error handling) run for real without
 * network access or credentials.
 */

interface MockMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}

interface MockEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string }[];
  location?: string;
}

interface MockStore {
  messages: MockMessage[];
  drafts: Record<string, unknown>[];
  events: MockEvent[];
  sheets: Record<string, string[][]>;
  documents: Record<string, { title: string; body: string }>;
  taskLists: { id: string; title: string }[];
  tasks: Record<
    string,
    { id: string; title: string; notes?: string; due?: string; status: string }[]
  >;
}

function seedStore(): MockStore {
  return {
    messages: [
      {
        id: "msg-1001",
        threadId: "thr-1001",
        labelIds: ["INBOX", "UNREAD"],
        from: "Prof. Rao <rao@university.edu>",
        to: "you@example.com",
        subject: "CS301 — Class schedule and attendance policy",
        date: new Date("2026-09-01T09:15:00Z").toUTCString(),
        body: "Classes run Mon/Wed/Fri 10:00-11:00 in Hall B. Attendance below 75% results in debarment from the final exam.",
      },
      {
        id: "msg-1002",
        threadId: "thr-1002",
        labelIds: ["INBOX", "UNREAD"],
        from: "Priya Nair <priya@acmecorp.com>",
        to: "you@example.com",
        subject: "Enquiry: website redesign for Acme Corp",
        date: new Date("2026-09-02T14:02:00Z").toUTCString(),
        body: "Hi, we are looking for a website redesign. Budget is around $12,000 and we would like to launch by November. You can reach me at +1-555-0142.",
      },
      {
        id: "msg-1003",
        threadId: "thr-1003",
        labelIds: ["INBOX"],
        from: "billing@cloudhost.io",
        to: "you@example.com",
        subject: "Invoice #4471 — $89.00 due",
        date: new Date("2026-09-03T07:40:00Z").toUTCString(),
        body: "Your invoice #4471 for $89.00 is due on 2026-09-15.",
      },
    ],
    drafts: [],
    events: [
      {
        id: "evt-2001",
        summary: "Standup",
        start: { dateTime: "2026-09-05T09:30:00Z" },
        end: { dateTime: "2026-09-05T09:45:00Z" },
        attendees: [{ email: "team@example.com" }],
      },
      {
        id: "evt-2002",
        summary: "Client call — Acme Corp",
        description: "Discuss redesign scope",
        start: { dateTime: "2026-09-05T15:00:00Z" },
        end: { dateTime: "2026-09-05T16:00:00Z" },
        attendees: [{ email: "priya@acmecorp.com" }],
        location: "Google Meet",
      },
    ],
    sheets: {
      "sheet-leads": [["Name", "Email", "Budget", "Phone", "Received"]],
    },
    documents: {
      "doc-3001": { title: "Meeting Notes", body: "Existing notes.\n" },
    },
    taskLists: [{ id: "list-1", title: "My Tasks" }],
    tasks: { "list-1": [] },
  };
}

let store: MockStore = seedStore();

/** Restores fixtures so each test run starts from a known state. */
export function resetMockStore(): void {
  store = seedStore();
}

export function getMockStore(): MockStore {
  return store;
}

const b64url = (value: string) => Buffer.from(value, "utf8").toString("base64url");

function toGmailMessage(message: MockMessage) {
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds,
    snippet: message.body.slice(0, 80),
    internalDate: String(new Date(message.date).getTime()),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: message.from },
        { name: "To", value: message.to },
        { name: "Subject", value: message.subject },
        { name: "Date", value: message.date },
      ],
      body: { size: message.body.length, data: b64url(message.body) },
    },
  };
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++counter}`;

export function createMockClients() {
  return {
    gmail: {
      users: {
        messages: {
          list: async ({ q, maxResults }: { q?: string; maxResults?: number }) => {
            let matches = store.messages;
            if (q?.includes("is:unread")) {
              matches = matches.filter((m) => m.labelIds.includes("UNREAD"));
            }
            const term = q?.replace(/\b(is|in|from|to):\S+/g, "").trim();
            if (term) {
              const needle = term.toLowerCase();
              matches = matches.filter(
                (m) =>
                  m.subject.toLowerCase().includes(needle) ||
                  m.body.toLowerCase().includes(needle) ||
                  m.from.toLowerCase().includes(needle),
              );
            }
            return {
              data: {
                messages: matches
                  .slice(0, maxResults ?? 10)
                  .map((m) => ({ id: m.id, threadId: m.threadId })),
                resultSizeEstimate: matches.length,
              },
            };
          },
          get: async ({ id }: { id: string }) => {
            const message = store.messages.find((m) => m.id === id);
            if (!message) throw new Error(`Mock Gmail: no message ${id}`);
            return { data: toGmailMessage(message) };
          },
          send: async ({ requestBody }: { requestBody: { raw?: string } }) => {
            const id = nextId("msg");
            const raw = Buffer.from(requestBody.raw ?? "", "base64url").toString(
              "utf8",
            );
            store.messages.push({
              id,
              threadId: nextId("thr"),
              labelIds: ["SENT"],
              from: "you@example.com",
              to: /^To: (.*)$/m.exec(raw)?.[1] ?? "unknown",
              subject: /^Subject: (.*)$/m.exec(raw)?.[1] ?? "",
              date: new Date().toUTCString(),
              body: raw.split("\r\n\r\n").slice(1).join("\r\n\r\n"),
            });
            return { data: { id, labelIds: ["SENT"] } };
          },
          modify: async ({
            id,
            requestBody,
          }: {
            id: string;
            requestBody: { addLabelIds?: string[]; removeLabelIds?: string[] };
          }) => {
            const message = store.messages.find((m) => m.id === id);
            if (!message) throw new Error(`Mock Gmail: no message ${id}`);
            message.labelIds = [
              ...message.labelIds.filter(
                (l) => !(requestBody.removeLabelIds ?? []).includes(l),
              ),
              ...(requestBody.addLabelIds ?? []),
            ];
            return { data: { id, labelIds: message.labelIds } };
          },
        },
        drafts: {
          create: async ({ requestBody }: { requestBody: unknown }) => {
            const id = nextId("draft");
            store.drafts.push({ id, ...(requestBody as object) });
            return { data: { id, message: { id: nextId("msg") } } };
          },
        },
      },
    },

    calendar: {
      events: {
        list: async ({ timeMin, timeMax, maxResults }: Record<string, string | number | undefined>) => {
          let items = store.events;
          if (typeof timeMin === "string") {
            const min = new Date(timeMin).getTime();
            items = items.filter(
              (e) => new Date(e.start.dateTime ?? e.start.date ?? 0).getTime() >= min,
            );
          }
          if (typeof timeMax === "string") {
            const max = new Date(timeMax).getTime();
            items = items.filter(
              (e) => new Date(e.start.dateTime ?? e.start.date ?? 0).getTime() <= max,
            );
          }
          return {
            data: { items: items.slice(0, Number(maxResults ?? 50)) },
          };
        },
        insert: async ({ requestBody }: { requestBody: Omit<MockEvent, "id"> }) => {
          const event = { id: nextId("evt"), ...requestBody };
          store.events.push(event);
          return { data: { ...event, htmlLink: `https://calendar.google.com/event?eid=${event.id}` } };
        },
        delete: async ({ eventId }: { eventId: string }) => {
          store.events = store.events.filter((e) => e.id !== eventId);
          return { data: {} };
        },
      },
    },

    sheets: {
      spreadsheets: {
        create: async ({ requestBody }: { requestBody: { properties?: { title?: string } } }) => {
          const id = nextId("sheet");
          store.sheets[id] = [];
          return {
            data: {
              spreadsheetId: id,
              properties: { title: requestBody.properties?.title ?? "Untitled" },
              spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
            },
          };
        },
        values: {
          get: async ({ spreadsheetId }: { spreadsheetId: string }) => ({
            data: { values: store.sheets[spreadsheetId] ?? [] },
          }),
          append: async ({
            spreadsheetId,
            requestBody,
          }: {
            spreadsheetId: string;
            requestBody: { values?: string[][] };
          }) => {
            const rows = store.sheets[spreadsheetId] ?? (store.sheets[spreadsheetId] = []);
            const added = requestBody.values ?? [];
            rows.push(...added);
            return {
              data: {
                updates: {
                  updatedRows: added.length,
                  updatedRange: `A${rows.length - added.length + 1}:Z${rows.length}`,
                },
              },
            };
          },
        },
      },
    },

    docs: {
      documents: {
        create: async ({ requestBody }: { requestBody: { title?: string } }) => {
          const id = nextId("doc");
          store.documents[id] = { title: requestBody.title ?? "Untitled", body: "" };
          return { data: { documentId: id, title: store.documents[id].title } };
        },
        get: async ({ documentId }: { documentId: string }) => {
          const doc = store.documents[documentId];
          if (!doc) throw new Error(`Mock Docs: no document ${documentId}`);
          return {
            data: {
              documentId,
              title: doc.title,
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: doc.body } }],
                    },
                  },
                ],
              },
            },
          };
        },
        batchUpdate: async ({
          documentId,
          requestBody,
        }: {
          documentId: string;
          requestBody: { requests?: { insertText?: { text?: string } }[] };
        }) => {
          const doc = store.documents[documentId];
          if (!doc) throw new Error(`Mock Docs: no document ${documentId}`);
          for (const request of requestBody.requests ?? []) {
            if (request.insertText?.text) doc.body += request.insertText.text;
          }
          return { data: { documentId, replies: [] } };
        },
      },
    },

    tasks: {
      tasklists: {
        list: async () => ({ data: { items: store.taskLists } }),
      },
      tasks: {
        list: async ({ tasklist }: { tasklist: string }) => ({
          data: { items: store.tasks[tasklist] ?? [] },
        }),
        insert: async ({
          tasklist,
          requestBody,
        }: {
          tasklist: string;
          requestBody: { title?: string; notes?: string; due?: string };
        }) => {
          const task = {
            id: nextId("task"),
            title: requestBody.title ?? "Untitled",
            notes: requestBody.notes,
            due: requestBody.due,
            status: "needsAction",
          };
          (store.tasks[tasklist] ??= []).push(task);
          return { data: task };
        },
        patch: async ({
          tasklist,
          task,
          requestBody,
        }: {
          tasklist: string;
          task: string;
          requestBody: { status?: string };
        }) => {
          const found = (store.tasks[tasklist] ?? []).find((t) => t.id === task);
          if (!found) throw new Error(`Mock Tasks: no task ${task}`);
          if (requestBody.status) found.status = requestBody.status;
          return { data: found };
        },
      },
    },

    drive: {
      files: {
        list: async ({ q }: { q?: string }) => {
          // Drive queries look like `fullText contains 'term' and trashed = false`;
          // pull the quoted terms out rather than matching the whole expression.
          const terms = [...(q ?? "").matchAll(/contains\s+'((?:\\'|[^'])*)'/g)].map(
            (m) => m[1].replace(/\\'/g, "'").toLowerCase(),
          );

          return {
            data: {
              files: Object.entries(store.documents)
                .filter(([, doc]) =>
                  terms.every((term) =>
                    `${doc.title}\n${doc.body}`.toLowerCase().includes(term),
                  ),
                )
                .map(([id, doc]) => ({
                  id,
                  name: doc.title,
                  mimeType: "application/vnd.google-apps.document",
                  modifiedTime: new Date().toISOString(),
                })),
            },
          };
        },
      },
    },
  };
}
