"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle, Star, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import type { MercadoLivreListingEditor } from "@/domain/mercadoLivre/listingsRepository";

type Props = {
  itemId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const fieldClass = "w-full rounded border border-white/15 bg-black px-3 text-sm text-white outline-none focus:border-laser disabled:cursor-not-allowed disabled:opacity-60";

export function MercadoLivreListingEditModal({ itemId, onClose, onSaved }: Props) {
  const [editor, setEditor] = useState<MercadoLivreListingEditor | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [pictures, setPictures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(`/admin/api/mercado-livre/anuncios/editar?itemId=${encodeURIComponent(itemId)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.message ?? "Nao foi possivel abrir o anuncio.");
        const next = result.editor as MercadoLivreListingEditor;
        setEditor(next);
        setTitle(next.title);
        setPrice(String(next.price).replace(".", ","));
        setDescription(next.description);
        setPictures(next.pictureSources);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Nao foi possivel abrir o anuncio.");
      });
    return () => controller.abort();
  }, [itemId]);

  function togglePicture(url: string) {
    setPictures((current) => {
      if (current.includes(url)) return current.filter((picture) => picture !== url);
      if (current.length >= 12) return current;
      return [...current, url];
    });
  }

  function movePicture(index: number, direction: -1 | 1) {
    setPictures((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    if (!editor) return;
    setError(null);
    startSaving(async () => {
      try {
        const response = await fetch("/admin/api/mercado-livre/anuncios/editar", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemId,
            title,
            price: Number(price.replace(",", ".")),
            description,
            pictureSources: pictures,
          }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.message ?? "Nao foi possivel atualizar o anuncio.");
        onSaved(result.message);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Nao foi possivel atualizar o anuncio.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="listing-edit-title">
      <div className="mx-auto w-full max-w-5xl rounded-md border border-white/15 bg-[#0d0f10] p-4 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div><p className="text-xs font-black uppercase text-laser">{itemId}</p><h2 id="listing-edit-title" className="mt-1 text-xl font-black">Editar anuncio publicado</h2></div>
          <button type="button" title="Fechar" onClick={onClose} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white"><X size={19} /></button>
        </div>

        {!editor && !error ? <div className="flex min-h-72 items-center justify-center gap-2 text-sm font-bold text-zinc-400"><LoaderCircle size={18} className="animate-spin" /> Lendo o anuncio no Mercado Livre...</div> : null}
        {error ? <p className="my-4 border-l-2 border-red-400 pl-3 text-sm font-bold leading-6 text-red-200">{error}</p> : null}

        {editor ? (
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="grid content-start gap-4">
              <label className="grid gap-2 text-sm font-bold">Titulo
                <input value={title} maxLength={60} disabled={!editor.titleEditable} onChange={(event) => setTitle(event.target.value)} className={`${fieldClass} h-11`} />
                <span className="flex justify-between gap-3 text-xs font-medium text-zinc-500"><span>{editor.titleEditable ? "Pode ser alterado porque este anuncio ainda nao teve vendas." : `Bloqueado pelo ML: ${editor.soldQuantity} venda(s).`}</span><span>{title.length}/60</span></span>
              </label>
              <label className="grid gap-2 text-sm font-bold">Preco do kit
                <input value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} className={`${fieldClass} h-11`} />
                <span className="text-xs font-medium text-zinc-500">O estoque continua sendo controlado automaticamente pelo catalogo.</span>
              </label>
              <label className="grid gap-2 text-sm font-bold">Descricao
                <textarea value={description} maxLength={5000} rows={12} onChange={(event) => setDescription(event.target.value)} className={`${fieldClass} resize-y py-3 leading-6`} />
                <span className="text-right text-xs font-medium text-zinc-500">{description.length}/5.000</span>
              </label>
            </div>

            <div className="min-w-0">
              <div className="flex items-end justify-between gap-4"><div><h3 className="text-sm font-black">Fotos do anuncio</h3><p className="mt-1 text-xs text-zinc-500">A foto 1 sera a principal. Selecione de 2 a 12.</p></div><span className="text-xs font-black text-zinc-400">{pictures.length}/12</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {pictures.map((url, index) => {
                  const asset = editor.mediaLibrary.find((item) => item.url === url);
                  return <div key={url} className="relative overflow-hidden rounded border border-white/15 bg-white">
                    <img src={url} alt={asset?.label ?? `Foto ${index + 1}`} className="aspect-square w-full object-contain" />
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/80 px-2 py-1 text-xs font-black text-white">{index + 1}</span>
                    {index === 0 ? <Star className="absolute right-2 top-2 fill-amber-300 text-amber-300" size={17} /> : null}
                    <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/75 p-1">
                      <button type="button" title="Mover para esquerda" disabled={index === 0} onClick={() => movePicture(index, -1)} className="rounded p-1.5 text-white disabled:opacity-25"><ArrowLeft size={15} /></button>
                      <button type="button" title="Remover foto" onClick={() => togglePicture(url)} className="rounded px-2 text-xs font-black text-white">Remover</button>
                      <button type="button" title="Mover para direita" disabled={index === pictures.length - 1} onClick={() => movePicture(index, 1)} className="rounded p-1.5 text-white disabled:opacity-25"><ArrowRight size={15} /></button>
                    </div>
                  </div>;
                })}
              </div>

              <h3 className="mt-6 text-sm font-black">Biblioteca deste produto</h3>
              <p className="mt-1 text-xs text-zinc-500">Clique para incluir ou remover. Fotos do produto pai e de todas as variacoes ficam disponiveis.</p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {editor.mediaLibrary.map((asset) => {
                  const selected = pictures.includes(asset.url);
                  return <button key={asset.id} type="button" title={`${asset.label} - ${asset.owner === "product" ? "produto pai" : "variacao"}`} onClick={() => togglePicture(asset.url)} className={`relative overflow-hidden rounded border-2 bg-white ${selected ? "border-emerald-400" : "border-transparent"}`}>
                    <img src={asset.url} alt={asset.label} className="aspect-square w-full object-contain" />
                    {selected ? <span className="absolute right-1 top-1 rounded-full bg-emerald-500 p-0.5 text-white"><Check size={13} /></span> : null}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-1 text-[10px] font-bold text-white">{asset.label}</span>
                  </button>;
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" disabled={isSaving} onClick={onClose} className="min-h-10 rounded border border-white/15 px-4 text-sm font-black text-zinc-300">Cancelar</button>
          <button type="button" disabled={!editor || isSaving} onClick={save} className="inline-flex min-h-10 items-center gap-2 rounded bg-laser px-4 text-sm font-black text-white hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500">{isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} Salvar no Mercado Livre</button>
        </div>
      </div>
    </div>
  );
}
