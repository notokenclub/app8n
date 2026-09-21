/**
 * Installs the starter blueprints for the local user.
 *
 * Idempotent by `blueprint_key`: re-running refreshes the definition (title,
 * description, steps, trigger) but deliberately leaves `status` alone, so a
 * blueprint someone paused stays paused instead of quietly resuming itself the
 * next time this runs. Pass --reset to also restore the shipped status.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { workflows } from "../src/lib/db/schema";
import { getCurrentUserId } from "../src/lib/auth/session";
import { STARTER_BLUEPRINTS } from "../src/lib/blueprints";

async function main() {
  const reset = process.argv.includes("--reset");
  const userId = await getCurrentUserId();

  let inserted = 0;
  let updated = 0;

  for (const blueprint of STARTER_BLUEPRINTS) {
    const definition = {
      title: blueprint.title,
      description: blueprint.description,
      triggerType: blueprint.triggerType,
      cronExpression: blueprint.cronExpression ?? null,
      isAgentic: blueprint.isAgentic,
      nodesJson: blueprint.nodes,
      edgesJson: blueprint.edges,
    };

    const [existing] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.userId, userId),
          eq(workflows.blueprintKey, blueprint.key),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(workflows)
        .set({
          ...definition,
          ...(reset ? { status: blueprint.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, existing.id));
      updated += 1;
    } else {
      await db.insert(workflows).values({
        userId,
        blueprintKey: blueprint.key,
        status: blueprint.status,
        ...definition,
      });
      inserted += 1;
    }
  }

  console.log(
    `Blueprints: ${inserted} installed, ${updated} refreshed.` +
      (updated > 0 && !reset ? " Existing statuses left untouched." : ""),
  );
  for (const blueprint of STARTER_BLUEPRINTS) {
    const when =
      blueprint.triggerType === "cron"
        ? `cron ${blueprint.cronExpression}`
        : blueprint.triggerType;
    console.log(`  · ${blueprint.title} (${when}, ${blueprint.nodes.length} steps)`);
  }
}

void main();
