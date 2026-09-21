import { getGoogleSession, type GoogleContext } from "../clients";

export type CellValue = string | number | boolean | null;

export interface AppendResult {
  updatedRows: number;
  updatedRange: string;
}

export async function readRange(
  params: GoogleContext & { spreadsheetId: string; range?: string },
): Promise<CellValue[][]> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.sheets.spreadsheets.values.get({
    spreadsheetId: params.spreadsheetId,
    range: params.range ?? "A1:Z1000",
  });
  return (data.values ?? []) as CellValue[][];
}

export async function appendRow(
  params: GoogleContext & {
    spreadsheetId: string;
    values: CellValue[];
    range?: string;
  },
): Promise<AppendResult> {
  return appendRows({ ...params, rows: [params.values] });
}

export async function appendRows(
  params: GoogleContext & {
    spreadsheetId: string;
    rows: CellValue[][];
    range?: string;
  },
): Promise<AppendResult> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.sheets.spreadsheets.values.append({
    spreadsheetId: params.spreadsheetId,
    range: params.range ?? "A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: params.rows },
  });
  return {
    updatedRows: data.updates?.updatedRows ?? 0,
    updatedRange: data.updates?.updatedRange ?? "",
  };
}

/**
 * Header-aware row lookup. Returns objects keyed by the first row so the agent
 * can filter on column names rather than positional indexes.
 */
export async function findRows(
  params: GoogleContext & {
    spreadsheetId: string;
    range?: string;
    match?: Record<string, string | number | boolean>;
    limit?: number;
  },
): Promise<Record<string, CellValue>[]> {
  const rows = await readRange(params);
  if (rows.length === 0) return [];

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((cell) => String(cell ?? ""));

  const records = dataRows.map((row) =>
    Object.fromEntries(
      headers.map((headerName, index) => [headerName, row[index] ?? null]),
    ),
  );

  const match = params.match;
  const filtered = match
    ? records.filter((record) =>
        Object.entries(match).every(
          ([key, value]) =>
            String(record[key] ?? "").toLowerCase() ===
            String(value).toLowerCase(),
        ),
      )
    : records;

  return filtered.slice(0, params.limit ?? filtered.length);
}

export async function createSpreadsheet(
  params: GoogleContext & { title: string; headers?: string[] },
): Promise<{ spreadsheetId: string; url: string }> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.sheets.spreadsheets.create({
    requestBody: { properties: { title: params.title } },
  });

  const spreadsheetId = data.spreadsheetId ?? "";
  if (params.headers?.length) {
    await appendRows({
      ...params,
      spreadsheetId,
      rows: [params.headers],
    });
  }

  return {
    spreadsheetId,
    url:
      data.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  };
}
