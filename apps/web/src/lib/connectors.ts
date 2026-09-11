/**
 * Thin shim over @adv/connectors so this app compiles whether or not the
 * connectors package has finished exporting `registerAllConnectors` yet
 * (it is being built concurrently). Always import connector lookups from
 * here instead of `@adv/connectors` directly.
 */
import * as connectors from "@adv/connectors";

export const getConnector = connectors.getConnector;
export const hasConnector = connectors.hasConnector;
export const listConnectors = connectors.listConnectors;
export type { ConnectedAccount, Connector, OAuthTokens, WizardStep } from "@adv/connectors";

let registered = false;

/** Idempotent. No-op if the connectors package has no registerAllConnectors export yet. */
export function ensureConnectorsRegistered(): void {
  if (registered) return;
  registered = true;
  const maybe = connectors as unknown as { registerAllConnectors?: () => void };
  if (typeof maybe.registerAllConnectors === "function") {
    maybe.registerAllConnectors();
  }
}
