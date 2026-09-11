/**
 * `@adv/agents` is being built out concurrently by another agent, adding `runDiscovery`,
 * `runContentBatch`, `runAnalyst` and `runProductAdvisor`. Until those land, this shim dynamically
 * imports the package and throws a clear "not available" JobError instead of a raw TypeError, so the
 * worker still compiles and the job handlers fail loudly (and get retried by pg-boss) rather than
 * silently. Once `@adv/agents` exports the real functions this file needs no changes.
 */
type DiscoveryReason = "initial" | "replan" | "manual";

async function loadAgents(): Promise<Record<string, unknown>> {
  return (await import("@adv/agents")) as unknown as Record<string, unknown>;
}

function missing(name: string): never {
  throw new Error(
    `@adv/agents does not export "${name}" yet. This is expected while the agents package is still ` +
      "being built out concurrently - retry once it lands.",
  );
}

export async function runDiscovery(businessId: string, reason: DiscoveryReason): Promise<unknown> {
  const mod = await loadAgents();
  const fn = mod.runDiscovery;
  if (typeof fn !== "function") return missing("runDiscovery");
  return (fn as (businessId: string, reason: DiscoveryReason) => Promise<unknown>)(businessId, reason);
}

export async function runContentBatch(
  businessId: string,
  opts: { days: number; platforms?: string[] },
): Promise<unknown> {
  const mod = await loadAgents();
  const fn = mod.runContentBatch;
  if (typeof fn !== "function") return missing("runContentBatch");
  return (fn as (businessId: string, opts: { days: number; platforms?: string[] }) => Promise<unknown>)(
    businessId,
    opts,
  );
}

export async function runAnalyst(businessId: string): Promise<unknown> {
  const mod = await loadAgents();
  const fn = mod.runAnalyst;
  if (typeof fn !== "function") return missing("runAnalyst");
  return (fn as (businessId: string) => Promise<unknown>)(businessId);
}

export async function runProductAdvisor(businessId: string): Promise<unknown> {
  const mod = await loadAgents();
  const fn = mod.runProductAdvisor;
  if (typeof fn !== "function") return missing("runProductAdvisor");
  return (fn as (businessId: string) => Promise<unknown>)(businessId);
}
