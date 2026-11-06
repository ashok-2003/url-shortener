"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.", {
        duration: Infinity,
        closeButton: true,
      });
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={copy}>
      <CopyIcon aria-hidden />
      {label}
    </Button>
  );
}
