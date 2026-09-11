"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteBusinessAction } from "@/lib/actions/settings";

export function DeleteBusinessDialog({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete business</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {businessName}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the business and everything tied to it: brand kit, channel plan,
            accounts, posts, metrics and insights. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Type <span className="font-mono font-medium">{businessName}</span> to confirm.
        </p>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={confirmText !== businessName || pending}
            onClick={() => startTransition(() => deleteBusinessAction(businessId))}
          >
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
