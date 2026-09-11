import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface DnsRecordRow {
  type: string;
  name: string;
  content: string;
  status?: "pending" | "ok" | "missing";
}

export function DnsRecordsTable({ records }: { records: DnsRecordRow[] }) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">No DNS records to show yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((r) => (
          <TableRow key={`${r.type}-${r.name}-${r.content}`}>
            <TableCell className="font-mono text-xs">{r.type}</TableCell>
            <TableCell className="font-mono text-xs">{r.name}</TableCell>
            <TableCell className="max-w-64 truncate font-mono text-xs">{r.content}</TableCell>
            <TableCell>
              {r.status === "ok" ? (
                <Badge variant="success">Verified</Badge>
              ) : r.status === "missing" ? (
                <Badge variant="destructive">Missing</Badge>
              ) : (
                <Badge variant="warning">Pending</Badge>
              )}
            </TableCell>
            <TableCell>
              <CopyButton value={r.content} label="" className="px-2" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
