import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { headerCta } from "@/data/site";

export function FinalCTA() {
  return (
    <section className="bg-[linear-gradient(90deg,#8f090e_0%,#bd1118_48%,#6f070b_100%)] px-5 py-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.45)] sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
        <div>
          <h2 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">
            Pronto para personalizar seu projeto?
          </h2>
          <p className="mt-1 text-sm text-white/86 sm:text-base">
            Fale conosco e receba seu orçamento sem compromisso.
          </p>
        </div>

        <Link
          href={headerCta.href}
          className="inline-flex min-h-[46px] min-w-[240px] items-center justify-center gap-3 rounded border border-white/35 bg-laser/45 px-7 py-3 text-xs font-black uppercase tracking-normal text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition duration-300 hover:border-white/70 hover:bg-laser hover:shadow-[0_0_28px_rgba(255,255,255,0.12)]"
        >
          <MessageCircle size={20} />
          Chamar no WhatsApp
        </Link>
      </div>
    </section>
  );
}
