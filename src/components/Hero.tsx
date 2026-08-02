import { ArrowRight, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { heroBenefits, heroButtons } from "@/data/site";

type HeroProps = {
  whatsappUrl?: string;
};

export function Hero({ whatsappUrl }: HeroProps) {
  return (
    <section
      id="inicio"
      className="relative isolate overflow-hidden border-b border-white/12 bg-carbon text-white"
    >
      <div className="absolute inset-y-0 right-0 -z-10 h-full w-full lg:w-[66%]">
        <Image
          src="/images/hero-machine-reference.webp"
          alt="Máquina laser gravando uma placa metálica com iluminação vermelha"
          fill
          priority
          className="object-cover object-center opacity-95"
          sizes="(min-width: 1024px) 66vw, 100vw"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#030303_0%,#030303_34%,rgba(3,3,3,0.84)_47%,rgba(3,3,3,0.2)_70%,rgba(3,3,3,0.34)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/20 via-transparent to-black/20" />

      <div className="mx-auto grid min-h-[500px] max-w-7xl items-center px-4 py-10 sm:min-h-[540px] sm:px-8 sm:py-12 md:min-h-[430px] lg:min-h-[315px] lg:grid-cols-[430px_1fr] lg:px-12 lg:py-8">
        <div className="max-w-[430px] animate-fade-up">
          <h1 className="text-balance text-[2.65rem] font-black uppercase leading-[0.94] tracking-normal text-zinc-100 min-[390px]:text-[3.05rem] sm:text-[3.8rem] lg:text-[4.05rem]">
            Gravação a
            <span className="block text-laser drop-shadow-[0_0_14px_rgba(225,18,27,0.28)]">
              Laser UV
            </span>
          </h1>

          <p className="mt-3 max-w-[360px] text-[0.95rem] leading-7 text-zinc-100 sm:text-lg">
            Precisão, qualidade e acabamento profissional em diversos materiais.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 text-[0.82rem] text-zinc-200 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
            {heroBenefits.map(({ label, Icon }) => (
              <div key={label} className="inline-flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-laser">
                  <Icon size={17} strokeWidth={2.2} />
                </span>
                <span className="font-medium">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:gap-4">
            {heroButtons.map((button) => (
              <Link
                key={button.label}
                href={button.variant === "primary" && whatsappUrl ? whatsappUrl : button.href}
                className={
                  button.variant === "primary"
                    ? "inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded border border-red-400/50 px-6 py-3 text-xs font-black uppercase tracking-normal text-white shadow-laser transition hover:bg-red-600 sm:w-auto sm:min-w-[182px]"
                    : "inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded border border-steel/55 bg-black/25 px-6 py-3 text-xs font-black uppercase tracking-normal text-white transition hover:border-laser hover:bg-laser/10 hover:text-white sm:w-auto sm:min-w-[166px]"
                }
                style={
                  button.variant === "primary"
                    ? { background: "linear-gradient(180deg, #ed1b23 0%, #bd1017 100%)" }
                    : undefined
                }
              >
                {button.variant === "primary" ? (
                  <MessageCircle size={19} />
                ) : (
                  <ArrowRight size={19} />
                )}
                {button.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="pointer-events-none hidden min-h-[315px] animate-soft-reveal lg:block" />
      </div>
    </section>
  );
}
