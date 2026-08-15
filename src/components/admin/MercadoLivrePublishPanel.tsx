"use client";

import {
  Check, CheckCircle2, ChevronLeft, ChevronRight, CircleGauge, FileSearch,
  ImagePlus, Images, LoaderCircle, Save, Send, SlidersHorizontal, Star, Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import type { MercadoLivreDraft, MercadoLivreDraftPayload } from "@/domain/mercadoLivre/publishingRepository";

type Candidate = {
  id: string; scxSku: string; title: string; category: string; imageUrl: string | null;
  variantCount: number; publishedVariants: number; draftStatus: string | null;
  profileStatus: string; mercadoLivreCategoryId: string | null;
};

type ApiResult = { ok?: boolean; message?: string; draft?: MercadoLivreDraft | null; url?: string; mediaLibrary?: MercadoLivreDraft["mediaLibrary"] };
type PreviewBody = {
  family_name?: string; price?: number; available_quantity?: number; listing_type_id?: string;
  pictures?: Array<{ source?: string }>; attributes?: Array<{ id?: string; value_id?: string; value_name?: string }>;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const statusLabels: Record<string, string> = { draft: "Edicao pendente", validated: "Validado", publishing: "Publicando", published: "Publicado", error: "Requer correcao" };
const fieldClass = "rounded border border-white/15 bg-black px-3 text-sm text-white outline-none transition focus:border-laser";

function bodyOf(payload?: Partial<MercadoLivreDraftPayload>) { return (payload?.body ?? {}) as PreviewBody; }
function hasKitStock(payload: MercadoLivreDraftPayload) { return Number(bodyOf(payload).available_quantity ?? 0) > 0; }
function kitSizesOf(draft: MercadoLivreDraft | null) { return [...new Set((draft?.payloads ?? []).filter(hasKitStock).map((item) => item.unitsPerPack))]; }
function preferredKit(draft: MercadoLivreDraft | null) {
  return draft?.payloads.find((item) => hasKitStock(item) && item.package.confidence === "confirmed" && item.publishable)?.unitsPerPack
    ?? draft?.payloads.find((item) => hasKitStock(item) && item.publishable)?.unitsPerPack
    ?? draft?.payloads.find(hasKitStock)?.unitsPerPack ?? null;
}

export function MercadoLivrePublishPanel({ candidates, initialDraft, commercialRules }: {
  candidates: Candidate[];
  initialDraft: MercadoLivreDraft | null;
  commercialRules: { minProfitInCents: number; minReturnPercentage: number; maxProductCostInCents: number; operationalCostInCents: number; taxReservePercentage: number };
}) {
  const defaultCandidate = candidates.find((item) => item.id === initialDraft?.productId)
    ?? candidates.find((item) => item.profileStatus === "reviewed") ?? candidates[0];
  const [productId, setProductId] = useState(defaultCandidate?.id ?? "");
  const [draft, setDraft] = useState(initialDraft);
  const [selectedKit, setSelectedKit] = useState<number | null>(() => preferredKit(initialDraft));
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const parentFile = useRef<HTMLInputElement>(null);

  const selected = candidates.find((item) => item.id === productId);
  const kits = kitSizesOf(draft);
  const kitFamily = (draft?.payloads ?? []).filter((item) => item.unitsPerPack === selectedKit);
  const family = kitFamily.filter(hasKitStock);
  const unavailableCount = kitFamily.length - family.length;
  const included = family.filter((item) => item.selectedForPublishing !== false);
  const title = bodyOf(family[0]).family_name ?? draft?.familyName ?? "";
  const description = family[0]?.description ?? draft?.description ?? "";
  const listingType = bodyOf(family[0]).listing_type_id ?? "gold_special";
  const blocked = !included.length || included.some((item) => !item.publishable || !item.fees);

  function acceptDraft(next: MercadoLivreDraft | null | undefined) {
    if (!next) return;
    setDraft(next);
    setSelectedKit((current) => next.payloads.some((item) => item.unitsPerPack === current) ? current : preferredKit(next));
    setDirty(false);
    setConfirmed(false);
  }

  function request(path: string, body: Record<string, unknown>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const result = await response.json().catch(() => null) as ApiResult | null;
        acceptDraft(result?.draft);
        setMessage(result?.message ?? `Operacao concluida com codigo ${response.status}.`);
      } catch { setMessage("Nao foi possivel concluir a operacao agora."); }
    });
  }

  function updateFamily(updater: (payload: MercadoLivreDraftPayload) => MercadoLivreDraftPayload) {
    if (!draft || selectedKit === null) return;
    setDraft({ ...draft, status: "draft", validationResults: [], payloads: draft.payloads.map((item) => item.unitsPerPack === selectedKit ? updater(item) : item) });
    setDirty(true);
    setConfirmed(false);
  }

  async function changeProduct(nextId: string) {
    setProductId(nextId); setDraft(null); setSelectedKit(null); setDirty(false); setMessage(null); setConfirmed(false);
    try {
      const response = await fetch(`/admin/api/mercado-livre/rascunho?productId=${encodeURIComponent(nextId)}`);
      const result = await response.json() as ApiResult;
      acceptDraft(result.draft);
    } catch { setMessage("Nao foi possivel carregar o rascunho salvo."); }
  }

  async function upload(file: File | undefined, variantId: string | null, offerId?: string) {
    if (!file || !draft) return;
    const key = variantId ?? "parent";
    setUploading(key); setMessage(null);
    const form = new FormData(); form.append("productId", productId); if (variantId) form.append("variantId", variantId); form.append("file", file);
    try {
      const response = await fetch("/admin/api/mercado-livre/imagens", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as ApiResult | null;
      if (result?.mediaLibrary) setDraft((current) => current ? { ...current, mediaLibrary: result.mediaLibrary! } : current);
      if (response.ok && result?.url && offerId) setPictures(offerId, [...picturesOf(family.find((item) => item.offerId === offerId)!), result.url]);
      setMessage(result?.message ?? "Upload concluido.");
    } catch { setMessage("Nao foi possivel enviar a imagem."); }
    finally { setUploading(null); }
  }

  function picturesOf(payload: MercadoLivreDraftPayload) { return (bodyOf(payload).pictures ?? []).map((item) => item.source).filter(Boolean) as string[]; }
  function pictureAsset(url: string, variantId: string) {
    return draft?.mediaLibrary.find((item) => item.url === url && item.variantId === variantId)
      ?? draft?.mediaLibrary.find((item) => item.url === url);
  }
  function setPictures(offerId: string, sources: string[]) {
    updateFamily((item) => item.offerId === offerId ? { ...item, body: { ...item.body, pictures: [...new Set(sources)].slice(0, 12).map((source) => ({ source })) } } : item);
  }
  function movePicture(payload: MercadoLivreDraftPayload, index: number, direction: -1 | 1) {
    const sources = picturesOf(payload); const target = index + direction;
    if (target < 0 || target >= sources.length) return;
    [sources[index], sources[target]] = [sources[target], sources[index]]; setPictures(payload.offerId, sources);
  }
  function setMainPicture(payload: MercadoLivreDraftPayload, url: string) {
    setPictures(payload.offerId, [url, ...picturesOf(payload).filter((item) => item !== url)]);
  }
  function saveDraft() {
    if (!draft || selectedKit === null) return;
    request("/admin/api/mercado-livre/rascunho/editar", {
      productId, unitsPerPack: selectedKit, familyName: title, description, listingTypeId: listingType,
      offers: family.map((item) => ({ offerId: item.offerId, selected: item.selectedForPublishing !== false, price: bodyOf(item).price, pictureSources: picturesOf(item) })),
    });
  }

  if (!defaultCandidate) return <p className="border-y border-white/10 py-5 text-sm text-zinc-400">Nenhum produto encontrado.</p>;

  return <section className="border-t border-white/10 pt-7">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-black uppercase text-laser">Editor de publicacao</p><h2 className="mt-2 text-xl font-black">Prepare exatamente o que sera enviado</h2></div>
      {draft ? <span className="text-sm font-bold text-zinc-300">{dirty ? "Alteracoes nao salvas" : statusLabels[draft.status] ?? draft.status}</span> : null}
    </div>

    <div className="mt-5 grid gap-4 border-y border-white/10 py-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-center">
      <div><p className="text-xs text-zinc-500">Resultado minimo</p><p className="mt-1 font-black">{money.format(commercialRules.minProfitInCents / 100)}</p></div>
      <div><p className="text-xs text-zinc-500">Retorno minimo</p><p className="mt-1 font-black">{commercialRules.minReturnPercentage}%</p></div>
      <div><p className="text-xs text-zinc-500">Custo maximo</p><p className="mt-1 font-black">{money.format(commercialRules.maxProductCostInCents / 100)}</p></div>
      <div><p className="text-xs text-zinc-500">Custo operacional</p><p className="mt-1 font-black">{money.format(commercialRules.operationalCostInCents / 100)}</p></div>
      <div><p className="text-xs text-zinc-500">Reserva</p><p className="mt-1 font-black">{commercialRules.taxReservePercentage}%</p></div>
      <Link href="/admin/precos" className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-white/15 px-3 text-sm font-black"><SlidersHorizontal size={16}/> Alterar</Link>
    </div>

    <div className="grid gap-4 border-b border-white/10 py-5 lg:grid-cols-[5rem_minmax(0,1fr)_auto] lg:items-end">
      <div className="h-20 w-20 overflow-hidden rounded border border-white/10 bg-white">{selected?.imageUrl ? <img src={selected.imageUrl} alt="" className="h-full w-full object-contain"/> : <Images className="m-7 text-zinc-500"/>}</div>
      <label className="grid min-w-0 gap-2 text-sm font-bold text-zinc-300">Produto
        <select value={productId} disabled={isPending} onChange={(event) => void changeProduct(event.target.value)} className={`${fieldClass} h-11 w-full min-w-0`}>
          {[...new Set(candidates.map((item) => item.category))].map((category) => <optgroup key={category} label={category}>{candidates.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.scxSku} - {item.title} ({item.variantCount} variacoes){item.profileStatus !== "reviewed" ? " - configurar categoria" : ""}</option>)}</optgroup>)}
        </select>
        <span className={`text-xs ${selected?.profileStatus === "reviewed" ? "text-emerald-300" : "text-amber-200"}`}>{selected?.profileStatus === "reviewed" ? `${selected.category} pronta` : "Esta categoria ainda precisa de mapeamento seguro"}</span>
      </label>
      <button type="button" disabled={isPending || selected?.profileStatus !== "reviewed"} onClick={() => request("/admin/api/mercado-livre/rascunho", { productId })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-white/15 px-4 text-sm font-black disabled:text-zinc-600">{isPending ? <LoaderCircle size={17} className="animate-spin"/> : <FileSearch size={17}/>} Gerar nova previa</button>
    </div>

    {draft ? <>
      <div className="mt-6 flex flex-wrap gap-2" aria-label="Tamanho do kit">{kits.map((size) => <button key={size} type="button" onClick={() => { setSelectedKit(size); setDirty(false); setConfirmed(false); }} className={`min-h-10 rounded border px-3 text-sm font-black ${selectedKit === size ? "border-laser bg-red-950/30" : "border-white/15 text-zinc-400"}`}>Kit {size}</button>)}</div>

      <section className="mt-6 border-y border-white/10 py-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">Titulo do anuncio <input value={title} maxLength={60} onChange={(event) => updateFamily((item) => ({ ...item, body: { ...item.body, family_name: event.target.value } }))} className={`${fieldClass} h-11`}/><span className={`text-xs ${title.length >= 45 ? "text-emerald-300" : "text-amber-200"}`}>{title.length}/60 caracteres</span></label>
          <fieldset><legend className="text-sm font-bold">Modalidade</legend><div className="mt-2 inline-flex rounded border border-white/15 p-1">{[["gold_special","Classico"],["gold_pro","Premium"]].map(([value,label]) => <button key={value} type="button" onClick={() => updateFamily((item) => ({ ...item, body: { ...item.body, listing_type_id: value } }))} className={`min-h-9 rounded px-4 text-sm font-black ${listingType === value ? "bg-white text-black" : "text-zinc-400"}`}>{label}</button>)}</div></fieldset>
          <label className="grid gap-2 text-sm font-bold lg:col-span-2">Descricao <textarea value={description} rows={8} maxLength={5000} onChange={(event) => updateFamily((item) => ({ ...item, description: event.target.value }))} className={`${fieldClass} resize-y py-3 leading-6`}/><span className="text-xs text-zinc-500">{description.length}/5.000 caracteres</span></label>
        </div>
      </section>

      <section className="border-b border-white/10 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Biblioteca de imagens</h3><p className="mt-1 text-sm text-zinc-400">Clique nas fotos dentro de cada variacao para inclui-las. A ordem exibida sera a ordem do anuncio.</p></div><input ref={parentFile} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0], null)}/><button type="button" disabled={Boolean(uploading)} onClick={() => parentFile.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded border border-white/15 px-3 text-sm font-black">{uploading === "parent" ? <LoaderCircle size={16} className="animate-spin"/> : <ImagePlus size={16}/>} Adicionar ao produto pai</button></div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{draft.mediaLibrary.filter((item) => item.owner === "product").map((asset) => <div key={asset.id} className="h-20 w-20 shrink-0 overflow-hidden rounded border border-white/15 bg-white"><img src={asset.url} alt={asset.label} className="h-full w-full object-contain"/></div>)}{!draft.mediaLibrary.some((item) => item.owner === "product") ? <p className="text-sm font-bold text-amber-200">Adicione uma foto geral do produto para complementar as variacoes.</p> : null}</div>
      </section>

      {unavailableCount > 0 ? <p className="border-b border-white/10 py-3 text-xs text-zinc-500">{unavailableCount} variacao(oes) sem estoque suficiente para este kit foram ocultadas.</p> : null}

      <div className="divide-y divide-white/10">
        {family.map((payload) => {
          const body = bodyOf(payload); const pictures = picturesOf(payload);
          const assets = [...draft.mediaLibrary].sort((a,b) => Number(b.variantId === payload.variantId) - Number(a.variantId === payload.variantId));
          const validation = draft.validationResults.find((item) => (item as {sku?:string}).sku === payload.sku) as {ok?:boolean}|undefined;
          return <article key={payload.offerId} className={`py-6 ${payload.selectedForPublishing === false ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <label className="inline-flex min-h-10 items-center gap-3 font-black"><input type="checkbox" checked={payload.selectedForPublishing !== false} onChange={(event) => updateFamily((item) => item.offerId === payload.offerId ? { ...item, selectedForPublishing: event.target.checked } : item)} className="h-5 w-5 accent-red-600"/><span>{payload.color}</span><span className="text-xs font-normal text-zinc-500">{payload.sku}</span></label>
              <span className={`text-xs font-black ${validation?.ok ? "text-emerald-300" : payload.publishable ? "text-zinc-400" : "text-red-200"}`}>{validation?.ok ? "Validada" : payload.publishable ? "Pronta para validar" : "Bloqueada"}</span>
            </div>
            <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(280px,.75fr)_1.25fr]">
              <div className="min-w-0">
                <label className="grid gap-2 text-sm font-bold">Preco do kit <input type="number" min="0.01" step="0.01" value={body.price ?? ""} onChange={(event) => updateFamily((item) => item.offerId === payload.offerId ? { ...item, body: { ...item.body, price: Number(event.target.value) } } : item)} className={`${fieldClass} h-11`}/></label>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-zinc-500">Estoque</dt><dd className="font-black">{body.available_quantity ?? 0} kits</dd></div><div><dt className="text-zinc-500">Custo</dt><dd className="font-black">{money.format(payload.productCostInCents/100)}</dd></div>{payload.fees ? <><div><dt className="text-zinc-500">Comissao</dt><dd className="font-black">-{money.format(payload.fees.saleFeeInCents/100)}</dd></div><div><dt className="text-zinc-500">Frete</dt><dd className="font-black">-{money.format(payload.fees.shippingCostInCents/100)}</dd></div><div><dt className="text-zinc-500">Resultado</dt><dd className={payload.publishable ? "font-black text-emerald-300" : "font-black text-red-200"}>{money.format(payload.fees.estimatedProfitInCents/100)}</dd></div><div><dt className="text-zinc-500">Retorno</dt><dd className="font-black">{payload.fees.returnPercentage.toFixed(1)}%</dd></div></> : null}</dl>
                {payload.contentReadiness ? <p className="mt-4 inline-flex items-center gap-2 text-sm font-black"><CircleGauge size={16}/> Qualidade {payload.contentReadiness.score}/100</p> : null}
                {payload.fees?.blockReasons.length ? <div className="mt-3 space-y-1 text-xs text-red-200">{payload.fees.blockReasons.map((reason) => <p key={reason}>{reason}</p>)}</div> : null}
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-black">Fotos selecionadas ({pictures.length}/12)</p><label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded border border-white/15 px-3 text-xs font-black"><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0], payload.variantId, payload.offerId)}/>{uploading === payload.variantId ? <LoaderCircle size={15} className="animate-spin"/> : <ImagePlus size={15}/>} Nova desta variacao</label></div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{pictures.map((url,index) => { const asset=pictureAsset(url,payload.variantId); return <div key={url} className="relative h-28 w-28 shrink-0 overflow-hidden rounded border border-white/20 bg-white"><img src={url} alt="" className="h-full w-full object-contain"/><span className="absolute left-1 top-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-black">{index+1}</span>{index===0 ? <Star size={15} className="absolute right-1 top-1 fill-yellow-300 text-yellow-300"/> : null}<div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/80 p-1"><button type="button" title="Mover para esquerda" onClick={()=>movePicture(payload,index,-1)}><ChevronLeft size={16}/></button><button type="button" title="Definir como principal" onClick={()=>setMainPicture(payload,url)}><Star size={15}/></button><button type="button" title="Remover do anuncio" onClick={()=>setPictures(payload.offerId,pictures.filter((item)=>item!==url))}><Trash2 size={15}/></button><button type="button" title="Mover para direita" onClick={()=>movePicture(payload,index,1)}><ChevronRight size={16}/></button></div>{asset ? <span className="absolute left-1 top-7 rounded bg-black/75 px-1 text-[10px]">{asset.owner === "product" ? "Pai" : asset.label}</span> : null}</div>})}</div>
                <p className="mt-3 text-xs font-bold text-zinc-400">Fotos disponiveis. Clique para incluir:</p>
                <div className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-y-auto">{assets.map((asset) => { const active=pictures.includes(asset.url); return <button key={asset.id} type="button" title={`${active ? "Remover" : "Incluir"}: ${asset.label}`} onClick={()=>setPictures(payload.offerId,active ? pictures.filter((item)=>item!==asset.url) : [...pictures,asset.url])} className={`relative h-16 w-16 overflow-hidden rounded border-2 bg-white ${active ? "border-emerald-400" : asset.variantId===payload.variantId ? "border-sky-400" : "border-transparent"}`}><img src={asset.url} alt={asset.label} className="h-full w-full object-contain"/>{active ? <Check size={16} className="absolute right-0 top-0 rounded-bl bg-emerald-500 p-0.5 text-black"/> : null}</button>})}</div>
                <p className={`mt-3 text-xs font-bold ${draft.mediaLibrary.some((a)=>a.url===pictures[0] && a.variantId===payload.variantId) && pictures.length>=2 ? "text-emerald-300" : "text-amber-200"}`}>A foto 1 deve ser desta variacao. Use a foto geral do produto como apoio nas demais posicoes.</p>
              </div>
            </div>
          </article>;
        })}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-white/15 bg-[#050606]/95 px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-zinc-300">{included.length} variacao(oes) selecionada(s) no kit {selectedKit}</p><p className="mt-1 text-xs text-zinc-500">{dirty ? "Proximo passo: salve para recalcular os custos." : draft.status === "validated" ? "Validacao concluida. Confira tudo abaixo antes de publicar." : blocked ? "Corrija os avisos em vermelho antes de validar." : "Custos atualizados. Proximo passo: validar no Mercado Livre."}</p></div><div className="flex flex-wrap gap-2">
          <button type="button" disabled={!dirty || isPending} onClick={saveDraft} className="inline-flex min-h-11 items-center gap-2 rounded bg-white px-4 text-sm font-black text-black disabled:bg-zinc-800 disabled:text-zinc-500">{isPending ? <LoaderCircle size={17} className="animate-spin"/> : <Save size={17}/>} 1. Salvar e recalcular</button>
          <button type="button" disabled={dirty || isPending || blocked} onClick={()=>request("/admin/api/mercado-livre/validar",{productId,unitsPerPack:selectedKit})} className="inline-flex min-h-11 items-center gap-2 rounded border border-emerald-300/30 px-4 text-sm font-black text-emerald-200 disabled:border-white/10 disabled:text-zinc-600"><CheckCircle2 size={17}/> 2. Validar no ML</button>
        </div></div>
        {draft.status === "validated" && !dirty ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><label className="inline-flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)} className="h-5 w-5 accent-red-600"/> Conferi fotos, variacoes, preco, estoque e custos</label><button type="button" disabled={!confirmed || blocked || isPending} onClick={()=>request("/admin/api/mercado-livre/publicar",{productId,unitsPerPack:selectedKit,confirmed:true})} className="inline-flex min-h-11 items-center gap-2 rounded bg-laser px-5 text-sm font-black disabled:bg-zinc-800 disabled:text-zinc-500"><Send size={17}/> 3. Publicar agora</button></div> : null}
      </div>
    </> : null}
    {message ? <p className="mt-4 border-y border-white/10 py-3 text-sm font-bold text-zinc-200">{message}</p> : null}
  </section>;
}
