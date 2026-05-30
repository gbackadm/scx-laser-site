"use client";

import { Menu, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { headerCta, navigationLinks } from "@/data/site";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black">
      <div className="mx-auto grid h-[78px] max-w-7xl grid-cols-[1fr_auto_auto] items-center gap-4 px-5 sm:px-8 lg:grid-cols-[250px_1fr_230px] lg:px-12">
        <Link
          href="#inicio"
          className="inline-flex items-center"
          aria-label="SCX Laser"
          onClick={() => setIsOpen(false)}
        >
          <img
            src="/images/logo-scx-oficial.png"
            alt="SCX Laser"
            width={240}
            height={160}
            className="h-[70px] w-[106px] object-contain object-left sm:h-[74px] sm:w-[112px] lg:h-[76px] lg:w-[114px]"
          />
        </Link>

        <nav className="hidden items-center justify-center gap-9 lg:flex" aria-label="Principal">
          {navigationLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative py-8 text-[0.68rem] font-black uppercase tracking-normal transition hover:text-laser ${
                index === 0 ? "text-laser" : "text-zinc-200"
              }`}
            >
              {link.label}
              {index === 0 ? (
                <span className="absolute bottom-5 left-0 h-0.5 w-full bg-laser" />
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="hidden justify-self-end lg:block">
          <Link
            href={headerCta.href}
            className="inline-flex h-10 items-center gap-2 rounded px-4 text-[0.66rem] font-black uppercase tracking-normal text-white shadow-laser transition hover:bg-red-600"
            style={{ background: "linear-gradient(180deg, #ee1b23 0%, #bc1017 100%)" }}
          >
            <MessageCircle size={18} />
            {headerCta.label}
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center justify-self-end rounded-md border border-white/15 text-white transition hover:border-laser hover:text-laser lg:hidden"
          aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {isOpen ? (
        <div className="border-t border-white/10 bg-black/[0.96] px-5 py-5 shadow-2xl lg:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1" aria-label="Principal mobile">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-3 text-sm font-bold uppercase tracking-normal text-zinc-100 transition hover:bg-white/5 hover:text-laser"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={headerCta.href}
              className="mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-laser px-4 text-sm font-bold uppercase tracking-normal text-white shadow-laser"
              onClick={() => setIsOpen(false)}
            >
              <MessageCircle size={18} />
              {headerCta.label}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
