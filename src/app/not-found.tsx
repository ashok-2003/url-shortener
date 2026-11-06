import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12 md:px-6 lg:px-8">
      <h1 className="font-display text-[24px] leading-[30px] font-medium tracking-[-0.01em] md:text-[30px] md:leading-[36px]">
        This link doesn&apos;t exist
      </h1>
      <p>Check the address, or make a new short link.</p>
      <Link href="/" className={buttonVariants()}>
        Go to {brand.name}
      </Link>
    </main>
  );
}
