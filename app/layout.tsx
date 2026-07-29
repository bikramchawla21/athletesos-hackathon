import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "AthleteOS",
  description: "The intelligence that grows with you.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {isClerkConfigured() ? <ClerkProvider>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
