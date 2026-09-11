/** Typed errors raised by the runtime agent layer. */

/** Thrown before a run starts when the business has spent its monthly AI budget. */
export class BudgetExceededError extends Error {
  readonly name = "BudgetExceededError";
  constructor(
    message: string,
    readonly businessId: string,
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super(message);
  }
}

/** Thrown when an agent run fails for a reason that is not a budget problem. */
export class AgentRunError extends Error {
  readonly name = "AgentRunError";
  constructor(
    message: string,
    readonly runId: string | null,
    readonly jobName: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** Thrown by engine tools when an input is valid JSON but violates a domain rule. */
export class ToolRuleError extends Error {
  readonly name = "ToolRuleError";
  constructor(
    message: string,
    readonly rule: string,
  ) {
    super(message);
  }
}
