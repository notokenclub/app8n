import { getGoogleSession, type GoogleContext } from "../clients";

export interface TaskList {
  id: string;
  title: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  completed: boolean;
}

export async function listTaskLists(
  params: GoogleContext,
): Promise<TaskList[]> {
  const { clients } = await getGoogleSession(params);
  const { data } = await clients.tasks.tasklists.list({ maxResults: 100 });
  return (data.items ?? []).map((list) => ({
    id: list.id ?? "",
    title: list.title ?? "",
  }));
}

/** Falls back to the account's first list, which Google always provides. */
async function resolveTaskListId(
  params: GoogleContext & { taskListId?: string },
): Promise<string> {
  if (params.taskListId) return params.taskListId;
  const lists = await listTaskLists(params);
  if (lists.length === 0) {
    throw new Error("No Google Tasks list is available on this account.");
  }
  return lists[0].id;
}

export async function listTasks(
  params: GoogleContext & { taskListId?: string; includeCompleted?: boolean },
): Promise<GoogleTask[]> {
  const { clients } = await getGoogleSession(params);
  const taskListId = await resolveTaskListId(params);
  const { data } = await clients.tasks.tasks.list({
    tasklist: taskListId,
    showCompleted: params.includeCompleted ?? false,
    maxResults: 100,
  });

  return (data.items ?? []).map((task) => ({
    id: task.id ?? "",
    title: task.title ?? "",
    notes: task.notes ?? undefined,
    due: task.due ?? undefined,
    completed: task.status === "completed",
  }));
}

export async function createTask(
  params: GoogleContext & {
    title: string;
    notes?: string;
    due?: string;
    taskListId?: string;
  },
): Promise<GoogleTask> {
  const { clients } = await getGoogleSession(params);
  const taskListId = await resolveTaskListId(params);
  const { data } = await clients.tasks.tasks.insert({
    tasklist: taskListId,
    requestBody: {
      title: params.title,
      notes: params.notes,
      // Google Tasks stores due dates as RFC 3339 and ignores the time part.
      due: params.due ? new Date(params.due).toISOString() : undefined,
    },
  });

  return {
    id: data.id ?? "",
    title: data.title ?? params.title,
    notes: data.notes ?? undefined,
    due: data.due ?? undefined,
    completed: data.status === "completed",
  };
}

export async function completeTask(
  params: GoogleContext & { taskId: string; taskListId?: string },
): Promise<GoogleTask> {
  const { clients } = await getGoogleSession(params);
  const taskListId = await resolveTaskListId(params);
  const { data } = await clients.tasks.tasks.patch({
    tasklist: taskListId,
    task: params.taskId,
    requestBody: { status: "completed" },
  });

  return {
    id: data.id ?? params.taskId,
    title: data.title ?? "",
    notes: data.notes ?? undefined,
    due: data.due ?? undefined,
    completed: true,
  };
}
