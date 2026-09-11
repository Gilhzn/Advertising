import { randomUUID } from "node:crypto";
import { auditLog, type Db } from "@adv/db";
import { logger } from "@adv/shared";
import type { HookCallback, HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk";
import { engineToolName, schedulingDecision } from "./tools/engine.js";

export interface HookContext {
  businessId: string;
  runId: string;
  db: Db;
  /** recorded as the audit actor, e.g. "supervisor" */
  agentName: string;
}

/** Keys that would only ever be present in an attempt to bypass the approval rule. */
const BYPASS_KEYS = [
  "force",
  "bypass",
  "skipApproval",
  "skip_approval",
  "override",
  "approve",
  "status",
  "autoPublish",
  "publishNow",
];

/**
 * PreToolUse guard on `schedule_post`.
 *
 * The tool itself already forces community targets to `awaiting_approval`; this hook is the second,
 * independent enforcement point required by CLAUDE.md. It denies anything that looks like an attempt
 * to route around the rule and annotates legitimate calls with what will actually happen.
 */
export function makeScheduleGuard(ctx: HookContext): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return { continue: true };
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;

    const deny = (reason: string) => ({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: reason,
      },
    });

    const bypass = BYPASS_KEYS.filter((k) => k in toolInput);
    if (bypass.length > 0) {
      logger.warn({ runId: ctx.runId, bypass }, "schedule_post bypass attempt denied");
      return deny(
        `schedule_post accepts only { postId, scheduledAt }. Unsupported keys: ${bypass.join(", ")}. Community approval cannot be overridden.`,
      );
    }

    const postId = toolInput.postId;
    if (typeof postId !== "string") return deny("schedule_post requires a postId string.");

    let decision: Awaited<ReturnType<typeof schedulingDecision>>;
    try {
      decision = await schedulingDecision(ctx.db, ctx.businessId, postId);
    } catch (err) {
      return deny(`could not verify the post before scheduling: ${err instanceof Error ? err.message : err}`);
    }
    if (!decision.ok) return deny(decision.reason);

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        additionalContext: decision.isCommunity
          ? "This post targets a community we do not own: it will be set to awaiting_approval and held for a human. It will NOT be published automatically."
          : "Owned account: the post will be approved with the time you passed.",
      },
    };
  };
}

/** PostToolUse hook that writes every tool call to `audit_log`. Never fails the run. */
export function makeAuditLogger(ctx: HookContext): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PostToolUse") return { continue: true };
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
    const target =
      typeof toolInput.postId === "string"
        ? `post:${toolInput.postId}`
        : typeof toolInput.url === "string"
          ? `url:${String(toolInput.url).slice(0, 200)}`
          : null;
    try {
      await ctx.db.insert(auditLog).values({
        businessId: ctx.businessId,
        actor: `agent:${ctx.agentName}`,
        action: `tool:${input.tool_name}`,
        target,
        payload: {
          runId: ctx.runId,
          toolUseId: input.tool_use_id,
          input: JSON.stringify(toolInput).slice(0, 4000),
          isError: Boolean(
            (input.tool_response as { isError?: boolean } | undefined)?.isError ??
              (input.tool_response as { is_error?: boolean } | undefined)?.is_error,
          ),
        },
      });
    } catch (err) {
      logger.warn({ runId: ctx.runId, err: String(err) }, "audit_log write failed");
    }
    return { continue: true };
  };
}

/** The standard hook set every job uses. */
export function jobHooks(ctx: HookContext): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [{ matcher: engineToolName("schedule_post"), hooks: [makeScheduleGuard(ctx)] }],
    PostToolUse: [{ hooks: [makeAuditLogger(ctx)] }],
  };
}

/** New run id, pre-generated so engine tools and hooks can reference it before the run starts. */
export function newRunId(): string {
  return randomUUID();
}
