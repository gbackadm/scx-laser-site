import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { headerCta } from "@/data/site";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-black px-5 py-11 text-white sm:px-8 lg:px-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(225,18,27,0.2),transparent_28%),radial-gradient(circle_at_86%_78%,rgba(225,18,27,0.16),transparent_30%),linear-gradient(90deg,#1a0305_0%,#0b0d0e_42%,#3d0609_100%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-laser/70 to-transparent" />

      <div className="relative mx-auto flex max-w-7xl animate-fade-up flex-col items-center justify-between gap-7 rounded-md border border-white/[0.07] bg-black/28 px-5 py-7 text-center shadow-[0_22px_60px_rgba(0,0,0,0.36)] sm:px-6 sm:py-8 md:flex-row md:px-9 md:text-left lg:px-12">
        <div className="max-w-3xl">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-laser">
            Pronto para começar?
          </p>
          <h2 className="mt-3 text-balance text-[1.55rem] font-black leading-tight text-white min-[390px]:text-[1.7rem] sm:text-[2.25rem] lg:text-[2.7rem]">
            Transforme sua ideia em um projeto personalizado
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
            Envie sua arte, logo ou projeto e receba uma análise sem compromisso.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[260px]">
          <Link
            href={headerCta.href}
            className="inline-flex min-h-[50px] items-center justify-center gap-3 rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-6 py-3.5 text-center text-xs font-black uppercase tracking-normal text-white shadow-[0_0_30px_rgba(225,18,27,0.26)] transition duration-300 hover:bg-red-600 hover:shadow-[0_0_38px_rgba(225,18,27,0.36)] sm:px-8"
          >
            <MessageCircle size={20} />
            Solicitar orçamento
          </Link>
          <Link
            href={headerCta.href}
            className="inline-flex min-h-[50px] items-center justify-center gap-3 rounded border border-laser/70 bg-black/30 px-6 py-3.5 text-center text-xs font-black uppercase tracking-normal text-white transition duration-300 hover:bg-laser/10 hover:shadow-[0_0_24px_rgba(225,18,27,0.18)] sm:px-8"
          >
            Falar no WhatsApp
          </Link>
        </div>
      </div>
    </section>
  );
}
