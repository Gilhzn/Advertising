import type { PlatformId } from "@adv/shared";
import type { Connector } from "./connector.js";

const registry = new Map<PlatformId, Connector>();

export function registerConnector(c: Connector): void {
  registry.set(c.id, c);
}
export function getConnector(id: PlatformId): Connector {
  const c = registry.get(id);
  if (!c) throw new Error(`No connector registered for platform "${id}"`);
  return c;
}
export function hasConnector(id: PlatformId): boolean {
  return registry.has(id);
}
export function listConnectors(): Connector[] {
  return [...registry.values()];
}
