"use client";

import { CheckCircle2, FileSearch, Images, LoaderCircle, PackageCheck, Send } from "lucide-react";
import { useState, useTransition } from "react";

import type { MercadoLivreDraft } from "@/domain/mercadoLivre/publishingRepository";

type Candidate = {
  id: string;
  scxSku: string;
  title: string;
  category: string;
  variantCount: number;
  publishedVariants: number;
  draftStatus: string | null;
};

type ApiResult = {
  ok?: boolean;
  message?: string;
  draft?: MercadoLivreDraft | null;
};

const statusLabels: Record<string, string> = {
  draft: "Previa gerada",
  validated: "Validado pelo Mercado Livre",
  publishing: "Publicando",
  published: "Publicado",
  error: "Requer correcao",
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type PreviewBody = {
  family_name?: string;
  price?: number;
  available_quantity?: number;
  listing_type_id?: string;
  pictures?: Array<{ source?: string }>;
  attributes?: Array<{ id?: string; value_id?: string; value_name?: string }>;
};

function previewBody(payload: MercadoLivreDraft["payloads"][number]) {
  return payload.body as PreviewBody;
}

export function MercadoLivrePublishPanel({
  candidates,
  initialDraft,
}: {
  candidates: Candidate[];
  initialDraft: MercadoLivreDraft | null;
}) {
  const defaultCandidate = candidates.find((item) => item.scxSku === "SCX-CAN-0021") ?? candidates[0];
  const [productId, setProductId] = useState(defaultCandidate?.id ?? "");
  const [draft, setDraft] = useState(initialDraft);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const selected = candidates.find((candidate) => candidate.id === productId);
  const kitSizes = [...new Set((draft?.payloads ?? []).map((payload) => payload.unitsPerPack))];
  const hasBlockedOffers = draft?.payloads.some((payload) => !payload.publishable) ?? false;

  function run(path: string, body: Record<string, unknown>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json().catch(() => null)) as ApiResult | null;
        if (result?.draft) setDraft(result.draft);
        setMessage(result?.message ?? `Operacao concluida com codigo ${response.status}.`);
      } catch {
        setMessage("Nao foi possivel concluir a operacao agora.");
      }
    });
  }

  if (!defaultCandidate) {
    return <p className="border-y border-white/10 py-5 text-sm text-zinc-400">Nenhuma caneta elegivel encontrada.</p>;
  }

  return (
    <section className="border-t border-white/10 pt-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-laser">Publicacao piloto</p>
          <h2 className="mt-2 text-xl font-black">Kit por cor</h2>
          <p className="mt-2 text-sm text-zinc-400">Kits de 50 e 100 usam embalagem proporcional estimada; o kit de 200 usa a caixa-mestre confirmada.</p>
        </div>
        {draft ? (
          <span className={`text-sm font-bold ${draft.status === "validated" || draft.status === "published" ? "text-emerald-300" : draft.status === "error" ? "text-amber-200" : "text-zinc-300"}`}>
            {statusLabels[draft.status] ?? draft.status}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 border-y border-white/10 py-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="grid gap-2 text-sm font-bold text-zinc-300">
          Produto
          <select
            value={productId}
            disabled={isPending}
            onChange={(event) => {
              setProductId(event.target.value);
              setDraft(null);
              setConfirmed(false);
              setMessage(null);
            }}
            className="h-11 rounded border border-white/15 bg-black px-3 text-white outline-none focus:border-laser"
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.scxSku} - {candidate.title} ({candidate.variantCount} cores)
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("/admin/api/mercado-livre/rascunho", { productId })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-white/15 px-4 text-sm font-black text-zinc-200 hover:border-white/30 disabled:text-zinc-600"
          >
            {isPending ? <LoaderCircle size={17} className="animate-spin" /> : <FileSearch size={17} />}
            Gerar previa
          </button>
          <button
            type="button"
            disabled={isPending || !draft}
            onClick={() => run("/admin/api/mercado-livre/validar", { productId })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-emerald-300/30 px-4 text-sm font-black text-emerald-200 hover:border-emerald-200 disabled:border-white/10 disabled:text-zinc-600"
          >
            <CheckCircle2 size={17} /> Validar no Mercado Livre
          </button>
        </div>
      </div>

      {draft ? (
        <div className="grid gap-5 py-5 lg:grid-cols-[0.8fr_1.2fr]">
          <dl className="divide-y divide-white/10 text-sm">
            <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Familia</dt><dd className="text-right font-bold">{draft.familyName}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Categoria ML</dt><dd className="font-bold">{draft.categoryId}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Ofertas</dt><dd className="font-bold">{draft.payloads.length}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Tamanhos de kit</dt><dd className="font-bold">{kitSizes.join(", ")}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Ja publicadas</dt><dd className="font-bold">{selected?.publishedVariants ?? 0}</dd></div>
          </dl>
          <div>
            <p className="text-sm font-bold text-zinc-400">Descricao</p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/35 p-4 font-sans text-sm leading-6 text-zinc-200">{draft.description}</pre>
          </div>
        </div>
      ) : null}

      {draft?.errorMessage ? (
        <p className="border-y border-amber-300/20 bg-amber-950/15 px-3 py-3 text-sm font-bold text-amber-100">
          {draft.errorMessage}
        </p>
      ) : null}

      {draft ? (
        <section className="border-t border-white/10 py-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-laser">Conferencia completa</p>
              <h3 className="mt-2 text-xl font-black">Ofertas que serao enviadas</h3>
            </div>
            <p className="max-w-xl text-sm leading-6 text-zinc-400">
              Dentro de cada tamanho de kit, as cores compartilham uma familia e aparecem como opcoes para o comprador.
            </p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {draft.payloads.map((payload) => {
              const body = previewBody(payload);
              const pictures = body.pictures ?? [];
              const validation = draft.validationResults.find((item) => (item as { sku?: string })?.sku === payload.sku) as { ok?: boolean; warnings?: Array<{ code?: string; message?: string }>; errors?: unknown[] } | undefined;
              const totalUnits = (body.available_quantity ?? 0) * payload.unitsPerPack;
              return (
                <article key={payload.offerId} className="overflow-hidden rounded-md border border-white/10 bg-[#0d0f10]">
                  <div className="grid sm:grid-cols-[180px_1fr]">
                    <div className="border-b border-white/10 bg-white p-3 sm:border-b-0 sm:border-r">
                      {pictures[0]?.source ? (
                        <img src={pictures[0].source} alt={`${payload.color} - ${payload.sku}`} className="aspect-square h-full w-full object-contain" />
                      ) : (
                        <div className="flex aspect-square items-center justify-center text-zinc-500"><Images size={28} /></div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase text-laser">{payload.color}</p>
                          <h4 className="mt-1 font-black">{body.family_name}</h4>
                          <p className="mt-1 text-xs text-zinc-500">{payload.sku}</p>
                        </div>
                        <span className={`rounded px-2 py-1 text-xs font-black ${!payload.publishable ? "bg-red-400/10 text-red-200" : payload.financialStatus === "warning" ? "bg-amber-400/10 text-amber-200" : validation?.ok ? "bg-emerald-400/10 text-emerald-200" : "bg-zinc-800 text-zinc-400"}`}>
                          {!payload.publishable ? "Bloqueado por custo" : payload.financialStatus === "warning" ? "Margem baixa" : validation?.ok ? "Validado" : "A validar"}
                        </span>
                      </div>
                      <p className="mt-4 text-2xl font-black text-white">{money.format(body.price ?? 0)}</p>
                      <p className="mt-1 text-sm text-zinc-400">{money.format(payload.unitPriceInCents / 100)} por unidade</p>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div><dt className="text-zinc-500">Conteudo</dt><dd className="font-bold">{payload.unitsPerPack} canetas</dd></div>
                        <div><dt className="text-zinc-500">Estoque ML</dt><dd className="font-bold">{body.available_quantity ?? 0} kits</dd></div>
                        <div><dt className="text-zinc-500">Unidades cobertas</dt><dd className="font-bold">{totalUnits}</dd></div>
                        <div><dt className="text-zinc-500">Plano</dt><dd className="font-bold">Classico</dd></div>
                      </dl>
                      {payload.fees ? (
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/10 pt-4 text-sm">
                          <div><dt className="text-zinc-500">Comissao ML</dt><dd className="font-bold text-amber-100">-{money.format(payload.fees.saleFeeInCents / 100)}</dd></div>
                          <div><dt className="text-zinc-500">Frete estimado</dt><dd className="font-bold text-amber-100">-{money.format(payload.fees.shippingCostInCents / 100)}</dd></div>
                          <div><dt className="text-zinc-500">Custo do produto</dt><dd className="font-bold">-{money.format(payload.productCostInCents / 100)}</dd></div>
                          <div><dt className="text-zinc-500">Resultado estimado</dt><dd className={`font-black ${payload.publishable ? "text-emerald-200" : "text-red-200"}`}>{money.format(payload.fees.contributionInCents / 100)}</dd></div>
                          <div className="col-span-2"><dt className="text-zinc-500">Margem antes de impostos e outros custos</dt><dd className={`font-black ${payload.publishable ? "text-emerald-200" : "text-red-200"}`}>{payload.fees.contributionPercentage.toLocaleString("pt-BR")}%</dd></div>
                        </dl>
                      ) : null}
                      {payload.financialStatus === "warning" ? <p className="mt-3 text-xs leading-5 text-amber-200">Margem inferior a 15% antes de impostos e outros custos. Revise antes de publicar.</p> : null}
                    </div>
                  </div>

                  <div className="border-t border-white/10 px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-black"><PackageCheck size={16} className={payload.package.confidence === "confirmed" ? "text-emerald-300" : "text-amber-300"} /> Embalagem {payload.package.confidence === "confirmed" ? "confirmada" : "estimada"}</div>
                    <p className="mt-2 text-sm text-zinc-400">
                      {payload.package.lengthCm} x {payload.package.widthCm} x {payload.package.heightCm} cm · {payload.package.weightGrams} g
                    </p>
                    {payload.package.warning ? <p className="mt-2 text-xs leading-5 text-amber-200">{payload.package.warning}</p> : null}
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                      {pictures.map((picture, index) => picture.source ? (
                        <div key={`${picture.source}-${index}`} className="w-16 shrink-0">
                          <img src={picture.source} alt={index === 0 ? `Imagem da cor ${payload.color}` : "Imagem de apoio do produto pai"} className="aspect-square w-full rounded border border-white/10 bg-white object-contain" />
                          <span className="mt-1 block text-center text-[10px] text-zinc-500">{index === 0 ? "Cor" : "Pai"}</span>
                        </div>
                      ) : null)}
                    </div>
                    {validation?.warnings?.length ? (
                      <div className="mt-4 text-xs leading-5 text-amber-200">
                        {validation.warnings.map((warning) => <p key={warning.code}>{warning.code}: {warning.message}</p>)}
                      </div>
                    ) : null}
                    <details className="mt-4 border-t border-white/10 pt-3">
                      <summary className="cursor-pointer text-sm font-black text-zinc-300">Atributos enviados ({body.attributes?.length ?? 0})</summary>
                      <dl className="mt-3 grid gap-2 text-xs">
                        {(body.attributes ?? []).map((attribute) => (
                          <div key={attribute.id} className="grid grid-cols-[minmax(130px,0.8fr)_1.2fr] gap-3 border-b border-white/5 pb-2">
                            <dt className="break-words text-zinc-500">{attribute.id}</dt>
                            <dd className="break-words font-bold text-zinc-200">{attribute.value_name ?? attribute.value_id ?? "-"}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                    <details className="mt-3 border-t border-white/10 pt-3">
                      <summary className="cursor-pointer text-sm font-black text-zinc-300">Payload completo da API</summary>
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words bg-black/35 p-3 text-xs leading-5 text-zinc-300">{JSON.stringify(body, null, 2)}</pre>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {message ? <p className="border-y border-white/10 py-3 text-sm font-bold text-zinc-200">{message}</p> : null}

      {draft?.status === "validated" ? (
        <div className="mt-5 grid gap-4 border border-red-500/25 bg-red-950/15 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <label className="flex items-start gap-3 text-sm leading-6 text-zinc-200">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-red-600" />
            Confirmo a criacao real de {draft.payloads.length} anuncios para kits de {kitSizes.join(", ")} unidades, separados por cor, no plano Classico.
          </label>
          <button
            type="button"
            disabled={isPending || !confirmed || hasBlockedOffers}
            onClick={() => run("/admin/api/mercado-livre/publicar", { productId, confirmed: true })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-laser px-4 text-sm font-black text-white hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Send size={17} /> Publicar agora
          </button>
        </div>
      ) : null}
    </section>
  );
}
