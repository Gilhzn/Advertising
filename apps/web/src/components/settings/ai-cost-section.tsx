import { CircleDollarSign } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { AiCostBarChart } from "@/components/settings/ai-cost-bar-chart";
import { BudgetProgressBar } from "@/components/settings/budget-progress-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobAgentSpend } from "@/lib/data/agent-runs";
import { formatUsd } from "@/lib/utils";

export function AiCostSection({
  rows,
  totalSpend,
  budget,
}: {
  rows: JobAgentSpend[];
  totalSpend: number;
  budget: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleDollarSign className="size-4" />
          AI spend this month
        </CardTitle>
        <p className="text-xs text-muted-foreground">Cost in USD, grouped by job and agent.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BudgetProgressBar spend={totalSpend} budget={budget} />

        {rows.length === 0 ? (
          <EmptyState title="No AI runs yet this month" />
        ) : (
          <>
            <AiCostBarChart rows={rows} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.jobName}:${r.agent}`}>
                    <TableCell className="font-mono text-xs">{r.jobName}</TableCell>
                    <TableCell className="font-mono text-xs">{r.agent}</TableCell>
                    <TableCell className="text-right">{r.runs}</TableCell>
                    <TableCell className="text-right">{formatUsd(r.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
