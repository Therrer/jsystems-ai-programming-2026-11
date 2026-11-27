import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/shared/strings/common";

// PRD AC-43 to AC-45, ADR-003 §3.5. Polish diacritics need latin-ext.
const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Wstępna ocena reklamacji i zwrotów sprzętu elektronicznego",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${roboto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div aria-hidden="true" className="fixed inset-y-0 left-0 hidden w-[35px] bg-brand-green lg:block" />
        {children}
      </body>
    </html>
  );
}
