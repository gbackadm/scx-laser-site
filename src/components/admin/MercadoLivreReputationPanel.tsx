import { Ban, CircleGauge, Medal, MessageSquareWarning, ShieldCheck, Star, Truck } from "lucide-react";

import type { MercadoLivreReputation } from "@/domain/mercadoLivre/listingsRepository";

const integer = new Intl.NumberFormat("pt-BR");

const levelLabels: Record<string, string> = {
  newbie: "Nova conta",
  "1_red": "Vermelha",
  "2_orange": "Laranja",
  "3_yellow": "Amarela",
  "4_light_green": "Verde-clara",
  "5_green": "Verde",
};

const levelColors: Record<string, string> = {
  newbie: "bg-sky-400",
  "1_red": "bg-red-500",
  "2_orange": "bg-orange-500",
  "3_yellow": "bg-yellow-400",
  "4_light_green": "bg-lime-400",
  "5_green": "bg-emerald-500",
};

function percentage(value: number | null) {
  return value === null ? "--" : `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function periodLabel(period: string | null) {
  if (!period) return "Periodo do ML";
  return period.replace(/days?/i, "dias").replace(/historic/i, "Historico");
}

export function MercadoLivreReputationPanel({ reputation }: { reputation: MercadoLivreReputation | null }) {
  if (!reputation) {
    return <p className="border-b border-amber-400/20 py-5 text-sm font-bold text-amber-700 dark:text-amber-200">O Mercado Livre nao retornou a reputacao da conta neste momento.</p>;
  }

  const level = reputation.realLevel ?? reputation.levelId;
  const ratingParts = [reputation.transactions.positiveRating, reputation.transactions.neutralRating, reputation.transactions.negativeRating];
  const ratingTotal = ratingParts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const hasRatings = ratingParts.some((value) => value !== null) && ratingTotal > 0;
  const ratingSummary = hasRatings
    ? `${percentage(reputation.transactions.positiveRating)} positivas · ${percentage(reputation.transactions.neutralRating)} neutras · ${percentage(reputation.transactions.negativeRating)} negativas`
    : "Sem avaliacoes recebidas";
  const indicators = [
    { label: "Vendas concluidas", value: integer.format(reputation.sales.completed), detail: periodLabel(reputation.sales.period), icon: ShieldCheck, healthy: true },
    { label: "Reclamacoes", value: percentage(reputation.claims.rate), detail: `${integer.format(reputation.claims.value)} ocorrencia(s) · ${periodLabel(reputation.claims.period)}`, icon: MessageSquareWarning, healthy: reputation.claims.rate <= 0.02 },
    { label: "Atrasos no despacho", value: percentage(reputation.delayedHandling.rate), detail: `${integer.format(reputation.delayedHandling.value)} ocorrencia(s) · ${periodLabel(reputation.delayedHandling.period)}`, icon: Truck, healthy: reputation.delayedHandling.rate <= 0.1 },
    { label: "Cancelamentos", value: percentage(reputation.cancellations.rate), detail: `${integer.format(reputation.cancellations.value)} ocorrencia(s) · ${periodLabel(reputation.cancellations.period)}`, icon: Ban, healthy: reputation.cancellations.rate <= 0.015 },
  ];

  return (
    <section className="border-b border-white/10 py-6" aria-labelledby="reputacao-ml">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-laser">Saude da conta</p>
          <h3 id="reputacao-ml" className="mt-2 text-lg font-black">Reputacao no Mercado Livre</h3>
          <p className="mt-1 text-xs text-zinc-500">Indicadores oficiais calculados pelo proprio Mercado Livre.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${level ? levelColors[level] ?? "bg-zinc-400" : "bg-zinc-400"}`} /><div><p className="text-xs text-zinc-500">Termometro</p><p className="font-black">{level ? levelLabels[level] ?? level : "Sem nivel"}</p></div></div>
          <div className="flex items-center gap-2"><Medal size={18} className={reputation.powerSellerStatus ? "text-amber-400" : "text-zinc-500"} /><div><p className="text-xs text-zinc-500">MercadoLider</p><p className="font-black capitalize">{reputation.powerSellerStatus ?? "Ainda nao"}</p></div></div>
        </div>
      </div>

      <div className="mt-5 grid border-y border-white/10 sm:grid-cols-2 xl:grid-cols-4">
        {indicators.map(({ label, value, detail, icon: Icon, healthy }, index) => <div key={label} className={`px-1 py-5 sm:px-4 ${index < indicators.length - 1 ? "xl:border-r xl:border-white/10" : ""}`}><Icon size={17} className={healthy ? "text-emerald-500" : "text-red-400"} /><p className="mt-3 text-xs font-bold uppercase text-zinc-500">{label}</p><p className={`mt-1 text-xl font-black ${healthy ? "text-zinc-100" : "text-red-300"}`}>{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>)}
      </div>

      <div className="grid gap-3 pt-4 sm:grid-cols-3">
        <p className="flex items-center gap-2 text-xs text-zinc-500"><CircleGauge size={15} /> {integer.format(reputation.transactions.total)} transacoes historicas</p>
        <p className="flex items-center gap-2 text-xs text-zinc-500"><ShieldCheck size={15} /> {integer.format(reputation.transactions.completed)} concluidas · {integer.format(reputation.transactions.canceled)} cancelada(s)</p>
        <p className={`flex items-center gap-2 text-xs ${hasRatings && (reputation.transactions.negativeRating ?? 0) > 0 ? "font-bold text-red-500" : "text-zinc-500"}`}><Star size={15} /> {ratingSummary}</p>
      </div>
      {reputation.protectionEndDate ? <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-200">Conta em periodo de protecao ate {new Date(reputation.protectionEndDate).toLocaleDateString("pt-BR")}. O nivel real esta sendo exibido.</p> : null}
    </section>
  );
}
