"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", id: "home", label: "Sayana" },
  { href: "/today", id: "today", label: "Today" },
  { href: "/recap", id: "recap", label: "This week" },
  { href: "/privacy", id: "privacy", label: "Privacy" },
];

export function Nav({ current }: { current?: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sayana">
      {items.map((item) => {
        const active = current ? current === item.id : path === item.href;
        return (
          <Link key={item.id} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
