"use client";

import { AlertTriangle, CircleHelp, DollarSign, ExternalLink, Eye, Percent, Search, ShoppingBag, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import type { MercadoLivreMetrics } from "@/domain/mercadoLivre/listingsRepository";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR");

const statusLabels: Record<string, string> = { active: "Ativo", paused: "Pausado", closed: "Encerrado", under_review: "Em revisao" };

type SortKey = "visits" | "sales" | "revenue" | "conversion" | "stock";

function percentage(value: number | null) {
  return value === null ? "--" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function MercadoLivreMetricsPanel({ metrics }: { metrics: MercadoLivreMetrics }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("visits");
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    const value = (item: MercadoLivreMetrics["listings"][number]) => {
      if (sort === "sales") return item.soldUnits;
      if (sort === "revenue") return item.grossRevenue;
      if (sort === "conversion") return item.conversionRate ?? -1;
      if (sort === "stock") return item.availableQuantity;
      return item.visits ?? -1;
    };
    return metrics.listings
      .filter((item) => (status === "all" || item.status === status) && (!needle || `${item.title} ${item.itemId}`.toLocaleLowerCase("pt-BR").includes(needle)))
      .sort((left, right) => value(right) - value(left));
  }, [metrics.listings, query, sort, status]);
  const maxVisits = Math.max(1, ...metrics.daily.map((day) => day.visits));
  const afterFees = metrics.totals.grossRevenue - metrics.totals.saleFees;

  const summary = [
    { label: "Visitas", value: integer.format(metrics.totals.visits), detail: `Ultimos ${metrics.periodDays} dias`, icon: Eye },
    { label: "Pedidos pagos", value: integer.format(metrics.totals.orders), detail: `${integer.format(metrics.totals.soldUnits)} unidade(s)`, icon: ShoppingBag },
    { label: "Conversao", value: percentage(metrics.totals.conversionRate), detail: "Unidades vendidas / visitas", icon: Percent },
    { label: "Vendas brutas", value: money.format(metrics.totals.grossRevenue), detail: `Apos comissao: ${money.format(afterFees)}`, icon: DollarSign },
    { label: "Anuncios ativos", value: `${metrics.totals.active}/${metrics.totals.listings}`, detail: `${metrics.totals.paused} pausado(s)`, icon: TrendingUp },
    { label: "Atencao", value: integer.format(metrics.totals.lowStock), detail: `Estoque baixo ou zerado`, icon: AlertTriangle },
  ];

  return (
    <section>
      <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-xl font-black">Desempenho dos anuncios</h2><p className="mt-1 text-sm text-zinc-500">De {new Date(`${metrics.dateFrom}T12:00:00`).toLocaleDateString("pt-BR")} a {new Date(`${metrics.dateTo}T12:00:00`).toLocaleDateString("pt-BR")}</p></div>
        <p className={`inline-flex items-center gap-2 text-sm font-black ${metrics.totals.unansweredQuestions ? "text-amber-300" : "text-emerald-300"}`}><CircleHelp size={17} /> {metrics.totals.unansweredQuestions === null ? "Perguntas indisponiveis" : `${metrics.totals.unansweredQuestions} pergunta(s) aguardando resposta`}</p>
      </div>

      <div className="grid border-b border-white/10 sm:grid-cols-2 xl:grid-cols-6">
        {summary.map(({ label, value, detail, icon: Icon }, index) => <div key={label} className={`px-1 py-5 sm:px-4 ${index < summary.length - 1 ? "xl:border-r xl:border-white/10" : ""}`}><Icon size={17} className="text-zinc-500" /><p className="mt-3 text-xs font-bold uppercase text-zinc-500">{label}</p><p className="mt-1 text-xl font-black text-zinc-100">{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>)}
      </div>

      <div className="border-b border-white/10 py-6">
        <div className="flex items-end justify-between gap-4"><div><h3 className="text-sm font-black">Visitas por dia</h3><p className="mt-1 text-xs text-zinc-500">O volume diario ajuda a separar falta de trafego de falta de conversao.</p></div><span className="text-xs font-black text-zinc-500">Pico: {integer.format(maxVisits)}</span></div>
        <div className="mt-5 flex h-36 items-end gap-1 border-b border-white/10" aria-label="Grafico de visitas dos ultimos 30 dias">
          {metrics.daily.map((day) => <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR")}: ${day.visits} visitas, ${day.soldUnits} unidades`}><div className={`w-full bg-sky-500 transition group-hover:bg-sky-300 ${day.visits === 0 ? "min-h-px opacity-25" : ""}`} style={{ height: `${Math.max(day.visits === 0 ? 0.5 : 4, (day.visits / maxVisits) * 100)}%` }} /></div>)}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-bold text-zinc-500"><span>{new Date(`${metrics.dateFrom}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span><span>{new Date(`${metrics.dateTo}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span></div>
      </div>

      {metrics.totals.visitsUnavailable ? <p className="border-b border-amber-300/20 py-3 text-xs font-bold text-amber-200">O Mercado Livre nao retornou visitas para {metrics.totals.visitsUnavailable} anuncio(s). Eles aparecem com -- e nao entram nos totais.</p> : null}

      <div className="grid gap-3 border-b border-white/10 py-5 md:grid-cols-[minmax(14rem,1fr)_12rem_13rem]">
        <label className="relative"><span className="sr-only">Buscar nas metricas</span><Search className="pointer-events-none absolute left-3 top-3.5 text-zinc-500" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar anuncio ou ID" className="h-11 w-full rounded border border-white/15 bg-black pl-10 pr-3 text-sm text-white outline-none focus:border-laser" /></label>
        <label><span className="sr-only">Filtrar metricas por status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 w-full rounded border border-white/15 bg-black px-3 text-sm font-bold text-white"><option value="all">Todos os status</option><option value="active">Ativos</option><option value="paused">Pausados</option></select></label>
        <label><span className="sr-only">Ordenar metricas</span><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="h-11 w-full rounded border border-white/15 bg-black px-3 text-sm font-bold text-white"><option value="visits">Mais visitas</option><option value="sales">Mais vendas</option><option value="revenue">Maior faturamento</option><option value="conversion">Maior conversao</option><option value="stock">Maior estoque</option></select></label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase text-zinc-500"><tr><th className="px-3 py-3">Anuncio</th><th className="px-3 py-3">Visitas</th><th className="px-3 py-3">Vendas</th><th className="px-3 py-3">Conversao</th><th className="px-3 py-3">Faturamento</th><th className="px-3 py-3">Comissao</th><th className="px-3 py-3">Estoque</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-white/5">{rows.map((item) => <tr key={item.itemId} className="hover:bg-white/[0.03]"><td className="px-3 py-3"><div className="flex items-center gap-3">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded border border-white/10 bg-white object-contain" /> : null}<div className="min-w-0"><p className="max-w-sm truncate font-black">{item.title}</p><p className="mt-1 text-xs text-zinc-500">{item.itemId}</p></div>{item.permalink ? <a href={item.permalink} target="_blank" rel="noreferrer" title="Abrir anuncio" className="ml-auto rounded p-2 text-zinc-500 hover:text-white"><ExternalLink size={15} /></a> : null}</div></td><td className="px-3 py-3 font-black">{item.visits === null ? "--" : integer.format(item.visits)}</td><td className="px-3 py-3"><span className="font-black">{integer.format(item.soldUnits)}</span><p className="mt-1 text-[11px] text-zinc-500">Historico: {integer.format(item.lifetimeSoldUnits)}</p></td><td className="px-3 py-3 font-black">{percentage(item.conversionRate)}</td><td className="px-3 py-3 font-black">{money.format(item.grossRevenue)}</td><td className="px-3 py-3 text-zinc-400">{money.format(item.saleFees)}</td><td className={`px-3 py-3 font-black ${item.stockStatus === "ok" ? "" : "text-red-300"}`}>{integer.format(item.availableQuantity)}</td><td className="px-3 py-3"><span className={`rounded px-2 py-1 text-xs font-black ${item.status === "active" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>{statusLabels[item.status] ?? item.status}</span></td></tr>)}</tbody>
        </table>
        {!rows.length ? <p className="py-10 text-center text-sm text-zinc-500">Nenhum anuncio corresponde aos filtros.</p> : null}
      </div>
    </section>
  );
}
