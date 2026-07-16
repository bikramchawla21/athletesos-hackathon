import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AthleteOS",
  description: "The intelligence that grows with you.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
