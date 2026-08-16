"use client";

import { ArrowUpDown, ExternalLink, Link2, LoaderCircle, Pause, Pencil, Play, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminNotice } from "@/components/admin/AdminNotice";
import { MercadoLivreListingEditModal } from "@/components/admin/MercadoLivreListingEditModal";

import type { ManagedMercadoLivreListing } from "@/domain/mercadoLivre/listingsRepository";
import { canActivateListing } from "@/domain/mercadoLivre/listingLifecycle.js";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const statusLabels: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  closed: "Encerrado",
  under_review: "Em revisao",
  not_yet_active: "Processando",
  unknown: "Sem leitura atual",
};

const statusStyles: Record<string, string> = {
  active: "bg-emerald-400/10 text-emerald-200",
  paused: "bg-amber-400/10 text-amber-200",
  closed: "bg-zinc-800 text-zinc-300",
  under_review: "bg-red-400/10 text-red-200",
  not_yet_active: "bg-sky-400/10 text-sky-200",
};

type ListingAction = "pause" | "activate" | "delete";

function actionTitle(action: ListingAction) {
  if (action === "pause") return "Pausar anuncio";
  if (action === "activate") return "Reativar anuncio";
  return "Excluir anuncio definitivamente";
}

export function MercadoLivreListingsPanel({ listings }: { listings: ManagedMercadoLivreListing[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("all");
  const [kit, setKit] = useState("all");
  const [status, setStatus] = useState("all");
  const [stock, setStock] = useState("all");
  const [stockDirection, setStockDirection] = useState<"none" | "asc" | "desc">("none");
  const [selectedId, setSelectedId] = useState(listings[0]?.itemId ?? "");
  const [pendingAction, setPendingAction] = useState<ListingAction | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const productOptions = useMemo(() => {
    const unique = new Map<string, string>();
    listings.forEach((listing) => unique.set(listing.groupKey, listing.groupLabel));
    return [...unique].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [listings]);
  const kitOptions = useMemo(() => [...new Set(listings
    .filter((listing) => product === "all" || listing.groupKey === product)
    .map((listing) => listing.unitsPerPack)
    .filter((value): value is number => value !== null))].sort((a, b) => a - b), [listings, product]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    const result = listings.filter((listing) => {
      const matchesStatus = status === "all" || listing.status === status;
      const matchesStock = stock === "all" || listing.stockStatus === stock;
      const matchesProduct = product === "all" || listing.groupKey === product;
      const matchesKit = kit === "all" || listing.unitsPerPack === Number(kit);
      const searchable = `${listing.title} ${listing.productTitle} ${listing.productSku} ${listing.externalSku} ${listing.itemId} ${listing.variation}`.toLocaleLowerCase("pt-BR");
      return matchesStatus && matchesStock && matchesProduct && matchesKit && (!needle || searchable.includes(needle));
    });
    return stockDirection === "none" ? result : [...result].sort((a, b) =>
      (a.availableQuantity - b.availableQuantity) * (stockDirection === "asc" ? 1 : -1));
  }, [listings, query, product, kit, status, stock, stockDirection]);

  const selected = filtered.find((listing) => listing.itemId === selectedId) ?? filtered[0] ?? null;
  const counts = listings.reduce<Record<string, number>>((result, listing) => {
    result[listing.status] = (result[listing.status] ?? 0) + 1;
    return result;
  }, {});

  function runAction() {
    if (!selected || !pendingAction) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/admin/api/mercado-livre/anuncios", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: selected.itemId, action: pendingAction, confirmed: true }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.message ?? "Nao foi possivel alterar o anuncio.");
        setMessage(result.message);
        setPendingAction(null);
        setDeleteConfirmation("");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nao foi possivel alterar o anuncio.");
      }
    });
  }

  function syncStock() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/admin/api/mercado-livre/estoque", { method: "POST" });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.message ?? "Nao foi possivel sincronizar o estoque.");
        const summary = result.summary;
        setMessage(`Estoque conferido em ${summary.total} anuncio(s): ${summary.updated} atualizado(s), ${summary.paused} pausado(s), ${summary.reactivated} reativado(s), ${summary.unchanged} sem alteracao e ${summary.failed} falha(s).`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nao foi possivel sincronizar o estoque.");
      }
    });
  }

  if (!listings.length) {
    return <p className="border-y border-white/10 py-8 text-sm text-zinc-400">Nenhum anuncio encontrado na conta Mercado Livre conectada.</p>;
  }

  return (
    <section>
      <div className="grid gap-3 border-b border-white/10 pb-5 md:grid-cols-2 xl:grid-cols-[minmax(13rem,1fr)_minmax(12rem,0.8fr)_9rem_10rem_10rem_auto]">
        <label className="relative block">
          <span className="sr-only">Buscar anuncios</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 text-zinc-500" size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por produto, SKU ou ID" className="h-11 w-full rounded border border-white/15 bg-black pl-10 pr-3 text-sm text-white outline-none focus:border-laser" />
        </label>
        <label>
          <span className="sr-only">Filtrar por produto</span>
          <select value={product} onChange={(event) => { setProduct(event.target.value); setKit("all"); }} className="h-11 w-full rounded border border-white/15 bg-black px-3 text-sm font-bold text-white outline-none focus:border-laser">
            <option value="all">Todos os produtos ({productOptions.length})</option>
            {productOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por kit</span>
          <select value={kit} onChange={(event) => setKit(event.target.value)} className="h-11 w-full rounded border border-white/15 bg-black px-3 text-sm font-bold text-white outline-none focus:border-laser">
            <option value="all">Todos os kits</option>
            {kitOptions.map((value) => <option key={value} value={value}>Kit {value}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 w-full rounded border border-white/15 bg-black px-3 text-sm font-bold text-white outline-none focus:border-laser">
            <option value="all">Todos ({listings.length})</option>
            <option value="active">Ativos ({counts.active ?? 0})</option>
            <option value="paused">Pausados ({counts.paused ?? 0})</option>
            <option value="under_review">Em revisao ({counts.under_review ?? 0})</option>
            <option value="closed">Encerrados ({counts.closed ?? 0})</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por estoque</span>
          <select value={stock} onChange={(event) => setStock(event.target.value)} className="h-11 w-full rounded border border-white/15 bg-black px-3 text-sm font-bold text-white outline-none focus:border-laser">
            <option value="all">Todo estoque</option>
            <option value="low">Estoque baixo</option>
            <option value="out">Sem estoque</option>
            <option value="ok">Estoque normal</option>
          </select>
        </label>
        <button type="button" title="Enviar ao Mercado Livre o estoque atualmente salvo no catalogo" disabled={isPending} onClick={syncStock} className="inline-flex h-11 items-center justify-center gap-2 rounded border border-white/15 px-3 text-sm font-black text-zinc-300 hover:border-white/30 hover:text-white disabled:text-zinc-600">
          <RefreshCw size={17} className={isPending ? "animate-spin" : ""} /> Atualizar ML
        </button>
      </div>
      <p className="border-b border-white/10 py-3 text-xs font-bold text-zinc-500">{filtered.length} de {listings.length} anuncios | {productOptions.length} produtos ou familias | O estoque enviado vem do catalogo; a Asia e atualizada por uma rotina separada.</p>

      <div className="grid min-h-[34rem] lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <div className="overflow-x-auto border-b border-white/10 lg:border-b-0 lg:border-r">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase text-zinc-500">
              <tr><th className="px-3 py-3">Anuncio</th><th className="px-3 py-3">Variacao</th><th className="px-3 py-3">Preco</th><th className="px-3 py-3"><button type="button" onClick={() => setStockDirection((value) => value === "none" ? "asc" : value === "asc" ? "desc" : "none")} className="inline-flex items-center gap-1.5" title="Ordenar por estoque no Mercado Livre">Estoque no ML <ArrowUpDown size={13} /></button></th><th className="px-3 py-3">Qualidade</th><th className="px-3 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((listing) => (
                <tr key={listing.itemId} onClick={() => setSelectedId(listing.itemId)} className={`cursor-pointer transition hover:bg-white/[0.04] ${selected?.itemId === listing.itemId ? "bg-white/[0.06]" : ""}`}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded border border-white/10 bg-white object-contain" /> : <div className="h-12 w-12 shrink-0 rounded border border-white/10 bg-zinc-900" />}
                      <div className="min-w-0"><p className="max-w-xs truncate font-black text-zinc-100">{listing.productTitle}</p><p className="mt-1 text-xs text-zinc-500">{listing.itemId}</p><span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${listing.linkedToCatalog ? "bg-emerald-400/10 text-emerald-200" : "bg-sky-400/10 text-sky-200"}`}>{listing.linkedToCatalog ? "Catalogo SCX" : "Somente no ML"}</span></div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><p className="font-bold text-zinc-300">{listing.variation}</p><p className="mt-1 text-xs text-zinc-500">{listing.unitsPerPack ? `Kit ${listing.unitsPerPack}` : "Kit nao identificado"}</p></td>
                  <td className="px-3 py-3 font-black">{money.format(listing.price)}</td>
                  <td className="px-3 py-3"><span className={`font-black ${listing.stockStatus === "out" || listing.stockStatus === "low" ? "text-red-300" : "text-zinc-100"}`}>{listing.availableQuantity} kits</span>{listing.localAvailableQuantity !== null ? <p className="mt-1 text-[11px] text-zinc-500">Banco: {listing.localAvailableQuantity}</p> : null}</td>
                  <td className="px-3 py-3"><span className="font-black">{listing.qualityScore ?? "--"}</span><span className="ml-1 text-xs text-zinc-500">{listing.qualityScore === null ? "" : "/100"}</span></td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded px-2 py-1 text-xs font-black ${statusStyles[listing.status] ?? "bg-zinc-800 text-zinc-300"}`}>{statusLabels[listing.status] ?? listing.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? <p className="px-3 py-10 text-center text-sm text-zinc-500">Nenhum anuncio corresponde aos filtros.</p> : null}
        </div>

        {selected ? (
          <aside className="p-5 lg:sticky lg:top-0 lg:self-start">
            {selected.imageUrl ? <img src={selected.imageUrl} alt={selected.title} className="aspect-square w-full max-w-sm bg-white object-contain" /> : null}
            <p className="mt-5 text-xs font-black uppercase text-laser">{selected.itemId}</p>
            <h2 className="mt-2 text-lg font-black leading-6">{selected.title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{selected.variation} | {selected.unitsPerPack ? `Kit ${selected.unitsPerPack}` : "Kit nao identificado"}</p>
            <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-black ${selected.linkedToCatalog ? "text-emerald-300" : "text-sky-300"}`}><Link2 size={13} /> {selected.linkedToCatalog ? "Vinculado ao catalogo SCX" : "Anuncio da conta ainda sem vinculo SCX"}</p>
            <dl className="mt-5 divide-y divide-white/10 border-y border-white/10 text-sm">
              <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Preco</dt><dd className="font-black">{money.format(selected.price)}</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Estoque no Mercado Livre</dt><dd className="font-black">{selected.availableQuantity} kits</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Kits possiveis no banco</dt><dd className="font-black">{selected.localAvailableQuantity ?? "Sem vinculo"}</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">SKU</dt><dd className="break-all text-right font-bold">{selected.externalSku}</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Familia</dt><dd className="text-right font-bold">{selected.familyName ?? "Nao informada"}</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Qualidade oficial</dt><dd className="text-right font-black">{selected.qualityScore === null ? "Indisponivel" : `${selected.qualityScore}/100 - ${selected.qualityLevel ?? "Sem nivel"}`}</dd></div>
            </dl>
            {selected.qualityPendingActions.length ? <div className="mt-4 border-l-2 border-amber-300/40 pl-3 text-xs leading-5 text-amber-100"><p className="font-black">Proximas melhorias do Mercado Livre</p>{selected.qualityPendingActions.slice(0, 5).map((action) => <p key={action}>{action}</p>)}</div> : null}
            {selected.subStatus.length ? <p className="mt-4 text-xs leading-5 text-amber-200">Motivo: {selected.subStatus.join(", ")}</p> : null}
            {!selected.live ? <p className="mt-4 text-xs leading-5 text-amber-200">O Mercado Livre nao respondeu agora; os dados exibidos sao a ultima copia salva.</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.permalink ? <a href={selected.permalink} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded border border-white/15 px-3 text-sm font-black text-zinc-200 hover:border-white/30"><ExternalLink size={16} /> Ver anuncio</a> : null}
              {selected.linkedToCatalog && !selected.subStatus.includes("deleted") ? <button type="button" onClick={() => setEditingId(selected.itemId)} className="inline-flex min-h-10 items-center gap-2 rounded border border-sky-300/30 px-3 text-sm font-black text-sky-200 hover:border-sky-200"><Pencil size={16} /> Editar</button> : null}
              {selected.status === "active" ? <button type="button" onClick={() => setPendingAction("pause")} className="inline-flex min-h-10 items-center gap-2 rounded border border-amber-300/30 px-3 text-sm font-black text-amber-200 hover:border-amber-200"><Pause size={16} /> Pausar</button> : null}
              {canActivateListing(selected.status, selected.subStatus) ? <button type="button" onClick={() => setPendingAction("activate")} className="inline-flex min-h-10 items-center gap-2 rounded border border-emerald-300/30 px-3 text-sm font-black text-emerald-200 hover:border-emerald-200"><Play size={16} /> Reativar</button> : null}
              {!selected.subStatus.includes("deleted") ? <button type="button" onClick={() => setPendingAction("delete")} className="inline-flex min-h-10 items-center gap-2 rounded border border-red-400/30 px-3 text-sm font-black text-red-200 hover:border-red-300"><Trash2 size={16} /> Excluir</button> : null}
            </div>
          </aside>
        ) : null}
      </div>

      <AdminNotice message={message} />

      {editingId ? <MercadoLivreListingEditModal itemId={editingId} onClose={() => setEditingId(null)} onSaved={(nextMessage) => { setEditingId(null); setMessage(nextMessage); router.refresh(); }} /> : null}

      {pendingAction && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="listing-action-title">
          <div className="w-full max-w-lg rounded-md border border-white/15 bg-[#0d0f10] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-laser">{selected.itemId}</p><h3 id="listing-action-title" className="mt-2 text-xl font-black">{actionTitle(pendingAction)}</h3></div><button type="button" title="Fechar" onClick={() => { setPendingAction(null); setDeleteConfirmation(""); }} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white"><X size={18} /></button></div>
            <p className="mt-4 text-sm leading-6 text-zinc-300">{pendingAction === "delete" ? "Esta acao encerra e remove o anuncio permanentemente. Ele nao podera ser reativado; para voltar a vender sera necessario publicar novamente." : pendingAction === "pause" ? "O anuncio deixara de aparecer para compradores, mas podera ser reativado depois." : "O anuncio voltara a ficar visivel e podera receber vendas imediatamente."}</p>
            {pendingAction === "delete" ? <label className="mt-5 grid gap-2 text-sm font-bold text-zinc-300">Digite EXCLUIR para confirmar<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="h-11 rounded border border-red-400/30 bg-black px-3 text-white outline-none focus:border-red-300" /></label> : null}
            <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => { setPendingAction(null); setDeleteConfirmation(""); }} className="min-h-10 rounded border border-white/15 px-4 text-sm font-black text-zinc-300">Cancelar</button><button type="button" disabled={isPending || (pendingAction === "delete" && deleteConfirmation !== "EXCLUIR")} onClick={runAction} className={`inline-flex min-h-10 items-center gap-2 rounded px-4 text-sm font-black text-white disabled:bg-zinc-800 disabled:text-zinc-500 ${pendingAction === "delete" ? "bg-red-700 hover:bg-red-600" : "bg-laser hover:bg-red-600"}`}>{isPending ? <LoaderCircle size={16} className="animate-spin" /> : null}{actionTitle(pendingAction)}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
