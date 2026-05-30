import { BadgeCheck, MessagesSquare, ScanSearch } from "lucide-react";

const differentials = [
  {
    title: "Precisão no acabamento",
    description:
      "Gravação limpa, detalhada e com foco em acabamento profissional.",
    Icon: BadgeCheck,
  },
  {
    title: "Análise antes da produção",
    description:
      "Cada material é avaliado para garantir melhor resultado e segurança na gravação.",
    Icon: ScanSearch,
  },
  {
    title: "Atendimento direto",
    description:
      "Você envia sua ideia, logo ou peça e recebe orientação para o melhor resultado.",
    Icon: MessagesSquare,
  },
];

export function Differentials() {
  return (
    <section className="border-b border-white/10 bg-[linear-gradient(180deg,#060707_0%,#0b0d0e_50%,#030303_100%)] px-5 py-9 text-white sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.55fr] lg:items-center">
        <div className="animate-fade-up">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-laser">
            Diferenciais
          </p>
          <h2 className="mt-2 max-w-sm text-balance text-3xl font-extrabold leading-tight text-zinc-100 sm:text-4xl">
            Por que escolher a SCX Laser?
          </h2>
        </div>

        <div className="grid gap-4">
          {differentials.map(({ title, description, Icon }, index) => (
            <article
              key={title}
              className="group flex gap-4 rounded-md border border-white/16 bg-black/36 p-5 shadow-[0_18px_46px_rgba(0,0,0,0.3)] transition duration-300 hover:-translate-y-0.5 hover:border-laser/60 hover:bg-white/[0.035] hover:shadow-[0_18px_50px_rgba(225,18,27,0.12)]"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-red-300/35 bg-[linear-gradient(180deg,#a9141a_0%,#65090d_100%)] text-white shadow-[0_0_18px_rgba(225,18,27,0.25)] transition duration-300 group-hover:shadow-[0_0_24px_rgba(225,18,27,0.4)]">
                <Icon size={23} strokeWidth={1.9} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-zinc-100">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-zinc-300">
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
