import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";

/** One shared map for every status enum in the schema, so colors never drift page to page. */
const POST_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  draft: { label: "Draft", variant: "outline" },
  awaiting_approval: { label: "Awaiting approval", variant: "warning" },
  approved: { label: "Approved", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  publishing: { label: "Publishing", variant: "warning" },
  published: { label: "Published", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  rejected: { label: "Rejected", variant: "destructive" },
};

const ACCOUNT_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  pending: { label: "Pending", variant: "outline" },
  connected: { label: "Connected", variant: "success" },
  error: { label: "Error", variant: "destructive" },
  disconnected: { label: "Disconnected", variant: "secondary" },
};

const AGENT_RUN_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  running: { label: "Running", variant: "warning" },
  succeeded: { label: "Succeeded", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  budget_exceeded: { label: "Budget exceeded", variant: "destructive" },
};

const RECOMMENDATION_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  open: { label: "Open", variant: "outline" },
  accepted: { label: "Accepted", variant: "success" },
  dismissed: { label: "Dismissed", variant: "secondary" },
  implemented: { label: "Implemented", variant: "success" },
};

const MAILBOX_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  pending_dns: { label: "Pending DNS", variant: "warning" },
  provisioning: { label: "Provisioning", variant: "warning" },
  active: { label: "Active", variant: "success" },
  error: { label: "Error", variant: "destructive" },
};

function render(map: Record<string, { label: string; variant: BadgeProps["variant"] }>, status: string) {
  const entry = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function PostStatusBadge({ status }: { status: string }) {
  return render(POST_STATUS_MAP, status);
}
export function AccountStatusBadge({ status }: { status: string }) {
  return render(ACCOUNT_STATUS_MAP, status);
}
export function AgentRunStatusBadge({ status }: { status: string }) {
  return render(AGENT_RUN_STATUS_MAP, status);
}
export function RecommendationStatusBadge({ status }: { status: string }) {
  return render(RECOMMENDATION_STATUS_MAP, status);
}
export function MailboxStatusBadge({ status }: { status: string }) {
  return render(MAILBOX_STATUS_MAP, status);
}
