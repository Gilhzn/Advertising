/**
 * `@adv/connectors` is being built out concurrently. Concrete connectors register themselves via a
 * `registerAllConnectors()` export that does not exist yet at the time this worker was written. This
 * shim dynamically imports it so the worker still compiles and boots (with zero connectors registered,
 * logged loudly) until that export lands - at which point this file needs no changes.
 */
import { logger } from "@adv/shared";

export async function registerAllConnectors(): Promise<void> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import("@adv/connectors")) as unknown as Record<string, unknown>;
  } catch (err) {
    logger.error({ err }, "connectors-shim: failed to import @adv/connectors");
    return;
  }
  const register = mod.registerAllConnectors;
  if (typeof register === "function") {
    await (register as () => Promise<void> | void)();
    return;
  }
  logger.warn(
    "connectors-shim: @adv/connectors does not export registerAllConnectors() yet - " +
      "no platform connectors are registered. publish_post/fetch_insights will fail with " +
      '"No connector registered" until it does.',
  );
}
