"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// v1 has one hard-coded user (spec section 3); real auth replaces this.
const USER = { id: "user_demo", initials: "UD", role: "Demo account" };

function Avatar() {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-accent font-mono text-xs font-medium text-accent-foreground"
    >
      {USER.initials}
    </span>
  );
}

/**
 * The account menu. `sidebar` is the full row at the bottom of the desktop sidebar;
 * `compact` is just the avatar, for the phone's top bar.
 */
export function UserMenu({ variant }: { variant: "sidebar" | "compact" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${USER.id}`}
        className={`flex items-center gap-3 rounded-full outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring ${
          variant === "sidebar" ? "h-12 w-full px-2 text-left hover:bg-canvas" : "size-11 justify-center"
        }`}
      >
        <Avatar />
        {variant === "sidebar" ? (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-sm tabular-nums">{USER.id}</span>
              <span className="text-xs text-ink-muted">{USER.role}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-4 text-ink-muted" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "sidebar" ? "start" : "end"}
        side={variant === "sidebar" ? "top" : "bottom"}
        className="w-56"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-3 py-2">
          <span className="font-mono text-sm font-normal tabular-nums">{USER.id}</span>
          <span className="text-xs font-normal text-ink-muted">{USER.role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/sign-in">
            <LogOut aria-hidden />
            Log out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
