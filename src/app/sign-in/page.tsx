import Link from "next/link";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

export const metadata = { title: `Sign in · ${brand.name}` };

const facts = [
  "Paste an https link and get a 7-character short link.",
  "Choose when it expires, from one hour to never.",
  "See clicks over time, plus referrers, countries and devices.",
];

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[960px] flex-col justify-center gap-10 px-4 py-10 md:px-6 md:py-16 lg:px-8">
      <header>
        <h1 className="font-display text-[24px] leading-[30px] font-medium tracking-[-0.01em] text-ink md:text-[30px] md:leading-9">
          {brand.name}
        </h1>
        <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">
          {brand.description}
        </p>
      </header>

      <div className="grid gap-10 md:grid-cols-[1fr_360px] md:items-start md:gap-12">
        <section aria-labelledby="pitch-title">
          <h2
            id="pitch-title"
            className="max-w-[24ch] text-[24px] leading-[30px] font-semibold tracking-[-0.01em] text-balance text-ink md:text-[30px] md:leading-9"
          >
            Short links, and a clear view of who opened them.
          </h2>
          <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
            {facts.map((fact) => (
              <li
                key={fact}
                className="py-3 text-[15px] leading-[22px] text-pretty text-ink"
              >
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="sign-in-title"
          className="rounded-[10px] border border-hairline bg-surface p-5 md:p-6"
        >
          <h2
            id="sign-in-title"
            className="text-base leading-6 font-semibold text-ink"
          >
            Sign in
          </h2>
          <p className="mt-2 text-[15px] leading-[22px] text-pretty text-ink-muted">
            Accounts are coming soon. For now, everyone uses the demo account.
          </p>
          <Button asChild className="mt-5 w-full md:w-auto">
            <Link href="/">Continue as demo user</Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
