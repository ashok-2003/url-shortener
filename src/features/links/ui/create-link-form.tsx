"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  describeCreateError,
  rateLimitMessage,
  secondsLeft,
} from "@/features/links/create-error";
import { toExpiryInput, type ExpiryChoice } from "@/features/links/expiry-choice";
import { createLinkInput, type LinkSummary } from "@/features/links/schema";
import { CreatedLinkResult } from "@/features/links/ui/created-link-result";
import { ExpiryPicker } from "@/features/links/ui/expiry-picker";
import { useTRPC } from "@/trpc/client";

type FieldErrors = { url?: string; expiry?: string };

type RateLimit = {
  deadline: number;
  now: number;
  /** False when the server gave no wait time: show "a minute", no countdown. */
  known: boolean;
};

const NETWORK_MESSAGE = "Couldn't reach the server. Check your connection and try again.";
const SERVER_MESSAGE = "Something went wrong on our side. Try again.";

function validate(url: string, choice: ExpiryChoice, custom: string): FieldErrors {
  const parsed = createLinkInput.safeParse({
    url,
    expiry: toExpiryInput(choice, custom),
  });
  if (parsed.success) return {};
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] === "url" ? "url" : "expiry";
    errors[field] ??= issue.message;
  }
  return errors;
}

export function CreateLinkForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(trpc.links.create.mutationOptions());

  const [url, setUrl] = useState("");
  const [choice, setChoice] = useState<ExpiryChoice>("never");
  const [custom, setCustom] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null);
  const [created, setCreated] = useState<LinkSummary | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const id = useId();
  const urlId = `${id}-url`;
  const urlErrorId = `${id}-url-error`;

  const hasDeadline = rateLimit !== null;
  const deadline = rateLimit?.deadline ?? 0;
  useEffect(() => {
    if (!hasDeadline) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now >= deadline) setRateLimit(null);
      else setRateLimit((current) => (current === null ? null : { ...current, now }));
    }, 1000);
    return () => clearInterval(timer);
  }, [hasDeadline, deadline]);

  const remaining = rateLimit === null ? 0 : secondsLeft(rateLimit.deadline, rateLimit.now);
  const blocked = rateLimit !== null && remaining > 0;

  // Once a field has shown an error, keep it in step with what the user types.
  function revalidate(nextUrl: string, nextChoice: ExpiryChoice, nextCustom: string) {
    if (!errors.url && !errors.expiry) return;
    const fresh = validate(nextUrl, nextChoice, nextCustom);
    setErrors({
      url: errors.url ? fresh.url : undefined,
      expiry: errors.expiry ? fresh.expiry : undefined,
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending || blocked) return;

    setNotice(null);
    setCreated(null);
    const found = validate(url, choice, custom);
    setErrors(found);
    if (found.url || found.expiry) {
      if (found.url) urlRef.current?.focus();
      return;
    }

    create.mutate(
      { url: url.trim(), expiry: toExpiryInput(choice, custom) },
      {
        onSuccess: (link) => {
          setUrl("");
          setCreated(link);
          void queryClient.invalidateQueries({ queryKey: trpc.links.list.pathKey() });
        },
        onError: (error) => {
          const view = describeCreateError(error);
          if (view.kind === "rate-limited") {
            const now = Date.now();
            const seconds = view.retryAfterSeconds ?? 60;
            setRateLimit({
              deadline: now + seconds * 1000,
              now,
              known: view.retryAfterSeconds !== null,
            });
          } else if (view.kind === "invalid") {
            setErrors({
              url: view.fieldErrors.url?.[0],
              expiry: view.fieldErrors.expiry?.[0],
            });
          } else {
            setNotice(view.kind === "network" ? NETWORK_MESSAGE : SERVER_MESSAGE);
          }
        },
      },
    );
  }

  const pending = create.isPending;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor={urlId}>Link to shorten</Label>
          <Input
            ref={urlRef}
            id={urlId}
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            autoComplete="off"
            placeholder="https://…"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              revalidate(event.target.value, choice, custom);
            }}
            aria-invalid={errors.url ? true : undefined}
            aria-describedby={errors.url ? urlErrorId : undefined}
          />
          {errors.url && (
            <p id={urlErrorId} className="flex items-start gap-1.5 text-sm text-status-red-ink">
              <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              {errors.url}
            </p>
          )}
        </div>

        <ExpiryPicker
          choice={choice}
          onChoiceChange={(next) => {
            setChoice(next);
            revalidate(url, next, custom);
          }}
          customValue={custom}
          onCustomChange={(next) => {
            setCustom(next);
            revalidate(url, choice, next);
          }}
          error={errors.expiry}
        />

        {blocked && rateLimit && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-[10px] bg-status-amber-bg p-3 text-sm text-status-amber-ink"
          >
            <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-status-amber-dot" />
            <p className="tabular-nums">
              {rateLimitMessage(rateLimit.known ? remaining : null)}
            </p>
          </div>
        )}

        {notice && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[10px] bg-status-red-bg p-3 text-sm text-status-red-ink"
          >
            <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-status-red-dot" />
            <p>{notice}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={pending || blocked}
          aria-busy={pending || undefined}
          className="relative w-full md:w-auto md:self-start md:px-8"
        >
          <span className={pending ? "invisible" : undefined}>Shorten</span>
          {pending && (
            <>
              <Loader2Icon aria-hidden className="absolute motion-safe:animate-spin" />
              <span className="sr-only">Shortening</span>
            </>
          )}
        </Button>
      </form>

      {created && <CreatedLinkResult link={created} />}
    </div>
  );
}
