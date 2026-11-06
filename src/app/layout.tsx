import type { Metadata } from "next";
import { EB_Garamond, Figtree, IBM_Plex_Mono } from "next/font/google";
import { AppToaster } from "@/components/app-toaster";
import { brand } from "@/config/brand";
import "./globals.css";
import { TRPCReactProvider } from "@/trpc/client";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});
const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  weight: "500",
});

export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
};

export const viewport = { themeColor: "#fffdf9" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${plexMono.variable} ${garamond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <AppToaster />
      </body>
    </html>
  );
}
