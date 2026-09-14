import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The SSRF guard resolves every hostname it is given. These suites drive msw with fictional
    // hosts that do not exist in DNS, so the guard's DNS step is switched off here - and only here.
    // The variable is an explicit opt-in precisely so no deployment can turn the guard off by
    // accident; see packages/connectors/src/net-guard.ts.
    env: { ADV_NET_GUARD_ALLOW_UNRESOLVABLE: "1" },
  },
});
