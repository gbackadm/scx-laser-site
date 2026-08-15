"use client";

import { CheckCircle2, FileSearch, LoaderCircle, Send } from "lucide-react";
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
          <h2 className="mt-2 text-xl font-black">Produto individual</h2>
          <p className="mt-2 text-sm text-zinc-400">Primeiro validamos todas as cores. Nada e publicado durante a validacao.</p>
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
            <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Variacoes</dt><dd className="font-bold">{draft.payloads.length}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">Ja publicadas</dt><dd className="font-bold">{selected?.publishedVariants ?? 0}</dd></div>
          </dl>
          <div>
            <p className="text-sm font-bold text-zinc-400">Descricao</p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/35 p-4 font-sans text-sm leading-6 text-zinc-200">{draft.description}</pre>
          </div>
        </div>
      ) : null}

      {message ? <p className="border-y border-white/10 py-3 text-sm font-bold text-zinc-200">{message}</p> : null}

      {draft?.status === "validated" ? (
        <div className="mt-5 grid gap-4 border border-red-500/25 bg-red-950/15 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <label className="flex items-start gap-3 text-sm leading-6 text-zinc-200">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-red-600" />
            Confirmo a criacao real de {draft.payloads.length} anuncios, um para cada cor, no plano Classico.
          </label>
          <button
            type="button"
            disabled={isPending || !confirmed}
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
