import { google } from "googleapis";
import type {
  calendar_v3,
  docs_v1,
  drive_v3,
  gmail_v1,
  sheets_v4,
  tasks_v1,
} from "googleapis";
import { isMockGoogle } from "@/lib/config";
import { getAuthorizedClient, type GoogleContext } from "./credentials";
import { createMockClients } from "./mock";

export interface GoogleClients {
  gmail: gmail_v1.Gmail;
  calendar: calendar_v3.Calendar;
  sheets: sheets_v4.Sheets;
  docs: docs_v1.Docs;
  tasks: tasks_v1.Tasks;
  drive: drive_v3.Drive;
}

export interface GoogleSession {
  clients: GoogleClients;
  accountId: string;
  email: string;
}

export type { GoogleContext };

/**
 * Single entry point for authorized Google API access. In mock mode the
 * fixture clients are substituted here, so no service module needs to know
 * whether it is talking to Google or to the in-memory store.
 */
export async function getGoogleSession(
  ctx: GoogleContext,
): Promise<GoogleSession> {
  if (isMockGoogle()) {
    return {
      // Structural stand-in for the googleapis surface the connectors use.
      clients: createMockClients() as unknown as GoogleClients,
      accountId: ctx.accountId ?? "mock-account",
      email: "mock@app8n.local",
    };
  }

  const { client, account } = await getAuthorizedClient(ctx);
  return {
    clients: {
      gmail: google.gmail({ version: "v1", auth: client }),
      calendar: google.calendar({ version: "v3", auth: client }),
      sheets: google.sheets({ version: "v4", auth: client }),
      docs: google.docs({ version: "v1", auth: client }),
      tasks: google.tasks({ version: "v1", auth: client }),
      drive: google.drive({ version: "v3", auth: client }),
    },
    accountId: account.id,
    email: account.email,
  };
}
