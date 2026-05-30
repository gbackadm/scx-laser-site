import { Box, FileText, Send, Zap } from "lucide-react";

const steps = [
  {
    number: "1.",
    title: "Envie seu pedido",
    description:
      "Envie sua arte, logo ou ideia e informe o material e a quantidade.",
    Icon: Send,
  },
  {
    number: "2.",
    title: "Análise e orçamento",
    description: "Avaliamos a viabilidade e retornamos com orçamento e prazo.",
    Icon: FileText,
  },
  {
    number: "3.",
    title: "Produção",
    description: "Iniciamos a gravação com máxima precisão e cuidado.",
    Icon: Zap,
  },
  {
    number: "4.",
    title: "Entrega",
    description: "Seu pedido pronto, embalado e entregue com qualidade.",
    Icon: Box,
  },
];

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="border-b border-white/10 bg-[linear-gradient(180deg,#030303_0%,#080a0b_45%,#030303_100%)] px-5 py-7 text-white sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-laser">
            Como funciona
          </p>
          <h2 className="mt-2 text-balance text-2xl font-extrabold leading-tight text-zinc-200 sm:text-3xl">
            Simples, rápido e seguro
          </h2>
        </div>

        <div className="relative mt-7 grid gap-7 md:grid-cols-2 md:gap-y-8 lg:grid-cols-4 lg:gap-6">
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-[28px] hidden h-px bg-[linear-gradient(90deg,transparent,rgba(225,18,27,0.22)_7%,rgba(225,18,27,0.55)_50%,rgba(225,18,27,0.22)_93%,transparent)] lg:block" />
          <div className="pointer-events-none absolute left-[25%] top-[25px] hidden h-2 w-2 -translate-x-1/2 rounded-full bg-laser shadow-[0_0_14px_rgba(225,18,27,0.5)] lg:block" />
          <div className="pointer-events-none absolute left-[50%] top-[25px] hidden h-2 w-2 -translate-x-1/2 rounded-full bg-laser shadow-[0_0_14px_rgba(225,18,27,0.5)] lg:block" />
          <div className="pointer-events-none absolute left-[75%] top-[25px] hidden h-2 w-2 -translate-x-1/2 rounded-full bg-laser shadow-[0_0_14px_rgba(225,18,27,0.5)] lg:block" />

          {steps.map(({ number, title, description, Icon }, index) => (
            <article
              key={title}
              className="group relative animate-fade-up text-center"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center bg-black text-laser transition duration-300 group-hover:-translate-y-0.5 group-hover:drop-shadow-[0_0_14px_rgba(225,18,27,0.34)]">
                <Icon size={38} strokeWidth={1.45} />
              </div>

              <div className="mx-auto mt-3 max-w-[235px]">
                <h3 className="text-sm font-extrabold text-zinc-100">
                  {number} {title}
                </h3>
                <p className="mt-2 text-[0.78rem] leading-5 text-zinc-300">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
