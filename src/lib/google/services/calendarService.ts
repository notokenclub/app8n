import type { calendar_v3 } from "googleapis";
import { getGoogleSession, type GoogleContext } from "../clients";

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  attendees: string[];
  htmlLink?: string;
}

function toEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  const start = event.start?.dateTime ?? event.start?.date ?? "";
  const end = event.end?.dateTime ?? event.end?.date ?? "";
  return {
    id: event.id ?? "",
    summary: event.summary ?? "(no title)",
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start,
    end,
    isAllDay: Boolean(event.start?.date && !event.start?.dateTime),
    attendees: (event.attendees ?? [])
      .map((a) => a.email)
      .filter((email): email is string => Boolean(email)),
    htmlLink: event.htmlLink ?? undefined,
  };
}

export interface ListEventsParams extends GoogleContext {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  query?: string;
}

export async function listEvents(
  params: ListEventsParams,
): Promise<CalendarEvent[]> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.calendar.events.list({
    calendarId: params.calendarId ?? "primary",
    timeMin: params.timeMin ?? new Date().toISOString(),
    timeMax: params.timeMax,
    maxResults: params.maxResults ?? 50,
    singleEvents: true,
    orderBy: "startTime",
    q: params.query,
  });
  return (data.items ?? []).map(toEvent);
}

export async function listUpcomingEvents(
  params: GoogleContext & { withinHours?: number },
): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(
    now.getTime() + (params.withinHours ?? 24) * 60 * 60 * 1000,
  );
  return listEvents({
    ...params,
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
  });
}

export interface CreateEventParams extends GoogleContext {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  calendarId?: string;
}

/** High impact: writes to a shared calendar and may email attendees. */
export async function createEvent(
  params: CreateEventParams,
): Promise<CalendarEvent> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.calendar.events.insert({
    calendarId: params.calendarId ?? "primary",
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: { dateTime: params.start },
      end: { dateTime: params.end },
      attendees: params.attendees?.map((email) => ({ email })),
    },
  });
  return toEvent(data);
}

export async function deleteEvent(
  params: GoogleContext & { eventId: string; calendarId?: string },
): Promise<{ deleted: true }> {
  const { clients } = await getGoogleSession(params);
  await clients.calendar.events.delete({
    calendarId: params.calendarId ?? "primary",
    eventId: params.eventId,
  });
  return { deleted: true };
}

/** Events overlapping the proposed window, for conflict checks before booking. */
export async function findConflicts(
  params: GoogleContext & { start: string; end: string; calendarId?: string },
): Promise<CalendarEvent[]> {
  const proposedStart = new Date(params.start).getTime();
  const proposedEnd = new Date(params.end).getTime();

  const events = await listEvents({
    ...params,
    timeMin: new Date(proposedStart - 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(proposedEnd + 24 * 60 * 60 * 1000).toISOString(),
  });

  return events.filter((event) => {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end).getTime();
    return start < proposedEnd && end > proposedStart;
  });
}

export interface AttendanceMetrics {
  heldClasses: number;
  attendedClasses: number;
  percentage: number;
  threshold: number;
  meetsThreshold: boolean;
  /** Additional classes missable while staying at or above the threshold. */
  classesCanMiss: number;
  /** Consecutive classes needed to climb back to the threshold. */
  classesMustAttend: number;
  remainingClasses: number;
  projectedPercentage: number;
  status: "safe" | "at_risk" | "debarred";
}

/**
 * Attendance/debar maths for the student blueprint. Pure so it can be unit
 * tested and reused by the agent without touching the Calendar API.
 */
export function calculateAttendanceMetrics(input: {
  heldClasses: number;
  attendedClasses: number;
  remainingClasses?: number;
  threshold?: number;
}): AttendanceMetrics {
  const held = Math.max(0, input.heldClasses);
  const attended = Math.min(Math.max(0, input.attendedClasses), held);
  const remaining = Math.max(0, input.remainingClasses ?? 0);
  const threshold = input.threshold ?? 0.75;

  const percentage = held === 0 ? 1 : attended / held;

  // Largest number of future classes that can be skipped while the final
  // ratio (attended) / (held + remaining) still clears the threshold.
  let canMiss = 0;
  for (let miss = 0; miss <= remaining; miss += 1) {
    const finalAttended = attended + (remaining - miss);
    const finalHeld = held + remaining;
    if (finalHeld === 0 || finalAttended / finalHeld >= threshold) canMiss = miss;
    else break;
  }

  // Consecutive future classes required to reach the threshold again.
  let mustAttend = 0;
  if (percentage < threshold) {
    mustAttend = Number.POSITIVE_INFINITY;
    for (let attend = 1; attend <= remaining; attend += 1) {
      if ((attended + attend) / (held + attend) >= threshold) {
        mustAttend = attend;
        break;
      }
    }
  }

  const projectedPercentage =
    held + remaining === 0 ? 1 : (attended + remaining) / (held + remaining);

  const status: AttendanceMetrics["status"] =
    percentage >= threshold
      ? "safe"
      : Number.isFinite(mustAttend)
        ? "at_risk"
        : "debarred";

  return {
    heldClasses: held,
    attendedClasses: attended,
    percentage,
    threshold,
    meetsThreshold: percentage >= threshold,
    classesCanMiss: canMiss,
    classesMustAttend: Number.isFinite(mustAttend) ? mustAttend : -1,
    remainingClasses: remaining,
    projectedPercentage,
    status,
  };
}

/** Counts calendar entries matching a course, to feed the metrics above. */
export async function countScheduledClasses(
  params: GoogleContext & {
    courseQuery: string;
    timeMin: string;
    timeMax: string;
    calendarId?: string;
  },
): Promise<{ count: number; events: CalendarEvent[] }> {
  const events = await listEvents({
    ...params,
    query: params.courseQuery,
    maxResults: 250,
  });
  return { count: events.length, events };
}
