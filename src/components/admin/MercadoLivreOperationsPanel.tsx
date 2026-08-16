"use client";

import { AlertTriangle, ArrowUpRight, BadgeDollarSign, Boxes, CircleHelp, Clock3, PackageCheck, RefreshCcw, ShoppingBag, TrendingDown } from "lucide-react";

import type { MercadoLivreMetrics } from "@/domain/mercadoLivre/listingsRepository";

const integer = new Intl.NumberFormat("pt-BR");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type SyncOverview = {
  pendingEvents: number;
  failedEvents: number;
  failedOffers: number;
  lastEventAt: string | null;
  lastStockSyncAt: string | null;
};

function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Nao registrado";
}

export function MercadoLivreOperationsPanel({ metrics, syncOverview }: { metrics: MercadoLivreMetrics; syncOverview: SyncOverview }) {
  const outOfStock = metrics.listings.filter((item) => item.stockStatus === "out");
  const lowStock = metrics.listings.filter((item) => item.stockStatus === "low");
  const syncErrors = metrics.listings.filter((item) => item.syncError);
  const trafficWithoutSales = metrics.listings
    .filter((item) => item.status === "active" && (item.visits ?? 0) >= 5 && item.soldUnits === 0)
    .sort((left, right) => (right.visits ?? 0) - (left.visits ?? 0));
  const noTraffic = metrics.listings.filter((item) => item.status === "active" && item.visits === 0);
  const urgentCount = outOfStock.length + syncErrors.length + (metrics.totals.unansweredQuestions ?? 0) + metrics.totals.listingsWithoutCost;

  const summaries = [
    { label: "Resolver agora", value: urgentCount, detail: "Perguntas, rupturas, custos e falhas", icon: AlertTriangle, tone: urgentCount ? "text-red-300" : "text-emerald-300" },
    { label: "Estoque baixo", value: lowStock.length, detail: `${outOfStock.length} sem estoque`, icon: Boxes, tone: lowStock.length ? "text-amber-300" : "text-emerald-300" },
    { label: "Sem conversao", value: trafficWithoutSales.length, detail: "Com 5 ou mais visitas", icon: TrendingDown, tone: trafficWithoutSales.length ? "text-amber-300" : "text-emerald-300" },
    { label: "Sincronizacao", value: syncOverview.failedEvents + syncOverview.failedOffers, detail: `Estoque: ${dateTime(syncOverview.lastStockSyncAt)}`, icon: RefreshCcw, tone: syncOverview.failedEvents + syncOverview.failedOffers ? "text-red-300" : "text-emerald-300" },
  ];

  return (
    <section className="min-w-0">
      <div className="border-b border-white/10 pb-5">
        <p className="text-xs font-black uppercase text-laser">Fila priorizada</p>
        <h2 className="mt-2 text-xl font-black">O que precisa da sua atencao</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">Apenas ocorrencias acionaveis. Os dados operacionais continuam sendo atualizados pelas rotinas automaticas.</p>
      </div>

      <div className="grid border-b border-white/10 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map(({ label, value, detail, icon: Icon, tone }, index) => (
          <div key={label} className={`px-1 py-5 sm:px-4 ${index < 3 ? "xl:border-r xl:border-white/10" : ""}`}>
            <Icon size={18} className="text-zinc-500" />
            <p className="mt-3 text-xs font-bold uppercase text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-black ${tone}`}>{integer.format(value)}</p>
            <p className="mt-1 text-xs text-zinc-500">{detail}</p>
          </div>
        ))}
      </div>

      {metrics.totals.listingsWithoutCost ? (
        <div className="flex items-start gap-3 border-b border-amber-400/30 py-4 text-amber-800 dark:text-amber-200">
          <BadgeDollarSign size={19} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-black">{metrics.totals.listingsWithoutCost} anuncio(s) com venda ainda nao possuem custo confiavel</p>
            <p className="mt-1 text-xs leading-5 opacity-80">A margem fica indisponivel ate o anuncio ser vinculado ao produto e a variacao corretos. O sistema nao estima esse valor para evitar uma decisao financeira errada.</p>
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-0 lg:grid-cols-2">
        <div className="min-w-0 border-b border-white/10 py-6 lg:border-r lg:pr-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black">Perguntas aguardando resposta</h3><span className="text-sm font-black text-amber-300">{metrics.totals.unansweredQuestions ?? "--"}</span></div>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {metrics.unansweredQuestions.map((question) => (
              <div key={question.id} className="py-4">
                <div className="flex items-start gap-3"><CircleHelp size={17} className="mt-0.5 shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><p className="font-bold text-zinc-100">{question.text}</p><p className="mt-1 truncate text-xs text-zinc-500">{question.itemTitle} · {dateTime(question.dateCreated)}</p></div>{question.permalink ? <a href={question.permalink} target="_blank" rel="noreferrer" title="Abrir anuncio" className="rounded p-2 text-zinc-500 hover:text-white"><ArrowUpRight size={16} /></a> : null}</div>
              </div>
            ))}
            {!metrics.unansweredQuestions.length ? <p className="py-7 text-sm font-bold text-emerald-300">Nenhuma pergunta pendente.</p> : null}
          </div>
        </div>

        <div className="min-w-0 border-b border-white/10 py-6 lg:pl-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black">Vendas recentes</h3><span className="text-xs font-bold text-zinc-500">Ultimos {metrics.periodDays} dias</span></div>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {metrics.recentOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-3 py-4"><ShoppingBag size={17} className="shrink-0 text-emerald-300" /><div className="min-w-0 flex-1"><p className="truncate font-bold text-zinc-100">{order.titles.join(", ")}</p><p className="mt-1 text-xs text-zinc-500">Pedido {order.id} · {dateTime(order.dateCreated)} · {order.units} unidade(s)</p></div><p className="shrink-0 font-black">{money.format(order.totalAmount)}</p></div>
            ))}
            {!metrics.recentOrders.length ? <p className="py-7 text-sm text-zinc-500">Nenhuma venda paga no periodo.</p> : null}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-0 lg:grid-cols-2">
        <div className="min-w-0 border-b border-white/10 py-6 lg:border-r lg:pr-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black">Estoque em risco</h3><span className="text-sm font-black text-amber-300">{lowStock.length + outOfStock.length}</span></div>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {[...outOfStock, ...lowStock].slice(0, 10).map((item) => <div key={item.itemId} className="flex items-center gap-3 py-3"><Boxes size={16} className={item.stockStatus === "out" ? "text-red-300" : "text-amber-300"} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-zinc-500">ML: {item.availableQuantity} kit(s){item.localAvailableQuantity !== null ? ` · Banco: ${item.localAvailableQuantity}` : ""}{item.pausedByStock ? " · Pausado automaticamente" : ""}</p></div>{item.permalink ? <a href={item.permalink} target="_blank" rel="noreferrer" title="Abrir anuncio" className="rounded p-2 text-zinc-500 hover:text-white"><ArrowUpRight size={16} /></a> : null}</div>)}
            {!lowStock.length && !outOfStock.length ? <p className="py-7 text-sm font-bold text-emerald-300">Todos os anuncios possuem estoque saudavel.</p> : null}
          </div>
        </div>

        <div className="min-w-0 border-b border-white/10 py-6 lg:pl-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black">Oportunidades de anuncio</h3><span className="text-xs font-bold text-zinc-500">Sem venda no periodo</span></div>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {trafficWithoutSales.slice(0, 10).map((item) => <div key={item.itemId} className="flex items-center gap-3 py-3"><TrendingDown size={16} className="text-amber-300" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-zinc-500">{integer.format(item.visits ?? 0)} visitas sem venda · revisar preco, fotos e oferta</p></div>{item.permalink ? <a href={item.permalink} target="_blank" rel="noreferrer" title="Abrir anuncio" className="rounded p-2 text-zinc-500 hover:text-white"><ArrowUpRight size={16} /></a> : null}</div>)}
            {!trafficWithoutSales.length ? <p className="py-7 text-sm font-bold text-emerald-300">Nenhum anuncio com trafego relevante esta zerado em vendas.</p> : null}
          </div>
          {noTraffic.length ? <p className="mt-3 text-xs text-zinc-500">Mais {noTraffic.length} anuncio(s) ativo(s) ainda nao receberam visitas no periodo.</p> : null}
        </div>
      </div>

      <div className={`mt-6 flex items-start gap-3 border-y py-4 ${syncErrors.length ? "border-red-400/30 text-red-200" : "border-emerald-400/20 text-emerald-200"}`}>
        {syncErrors.length ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : <PackageCheck size={18} className="mt-0.5 shrink-0" />}
        <div><p className="font-black">{syncErrors.length ? `${syncErrors.length} anuncio(s) com falha na ultima sincronizacao` : "Sincronizacao sem falhas registradas"}</p><p className="mt-1 text-xs opacity-70"><Clock3 size={13} className="mr-1 inline" />Ultima conferencia de estoque: {dateTime(syncOverview.lastStockSyncAt)}</p>{syncErrors.slice(0, 3).map((item) => <p key={item.itemId} className="mt-2 text-xs">{item.itemId}: {item.syncError}</p>)}</div>
      </div>
    </section>
  );
}
