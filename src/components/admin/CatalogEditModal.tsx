"use client";

import { Save, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import type { CatalogPublicationStatus } from "@/domain/catalog/types";
import type { AdminProduct } from "@/domain/catalog/viewModels";
import { formatMoneyInput, parseMoneyToCents } from "@/domain/catalog/money";
import { publicationStatusLabel } from "@/domain/catalog/viewModels";

type CatalogEditModalProps = {
  canPublish: boolean;
  categories: string[];
  product: AdminProduct;
  onClose: () => void;
  onSaved: (product: AdminProduct) => void;
};

export function CatalogEditModal({
  canPublish,
  categories,
  product,
  onClose,
  onSaved,
}: CatalogEditModalProps) {
  const [title, setTitle] = useState(product.name);
  const [categoryName, setCategoryName] = useState(product.category);
  const [description, setDescription] = useState(product.description);
  const [price, setPrice] = useState(formatMoneyInput(product.priceInCents));
  const [stockQuantity, setStockQuantity] = useState(String(product.stock));
  const [publicationStatus, setPublicationStatus] =
    useState<CatalogPublicationStatus>(product.publicationStatus);
  const [imageUrls, setImageUrls] = useState(product.imageUrls.join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const normalizedImageUrls = imageUrls
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  const primaryImageUrl = normalizedImageUrls[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-edit-title"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-md border border-white/12 bg-[#0d0f10] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0d0f10] px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
              Edicao rapida
            </p>
            <h2 id="catalog-edit-title" className="mt-1 text-xl font-black text-white">
              {product.name}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Codigo SCX {product.scxSku ?? "-"} - SKU fornecedor {product.sku}
              {" "} - Fornecedor: {product.supplier}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/12 text-zinc-300 transition hover:border-laser hover:text-white"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
          <div className="grid content-start gap-3">
            <div className="aspect-square overflow-hidden rounded border border-white/10 bg-black/35">
              {primaryImageUrl ? (
                <img
                  src={primaryImageUrl}
                  alt={title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs font-black uppercase tracking-[0.12em] text-zinc-600">
                  Sem imagem
                </div>
              )}
            </div>
            {message ? (
              <div className="rounded border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-zinc-100">
                {message}
              </div>
            ) : null}
          </div>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);

              const nextProduct: AdminProduct = {
                ...product,
                name: title.trim(),
                description,
                category: categoryName.trim(),
                imageUrls: normalizedImageUrls,
                primaryImageUrl,
                priceInCents: parseMoneyToCents(price),
                stock: Math.max(0, Math.round(Number(stockQuantity) || 0)),
                publicationStatus,
                status: publicationStatusLabel(publicationStatus),
              };

              startTransition(async () => {
                try {
                  const response = await fetch("/admin/catalogo/editar", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      productId: product.catalogId,
                      title: nextProduct.name,
                      description: nextProduct.description,
                      categoryName: nextProduct.category,
                      priceAmountInCents: nextProduct.priceInCents,
                      stockQuantity: nextProduct.stock,
                      publicationStatus,
                      imageUrls: normalizedImageUrls,
                    }),
                  });
                  const responseText = await response.text();
                  const result = (
                    responseText
                      ? JSON.parse(responseText)
                      : {
                          ok: false,
                          message:
                            "Nao foi possivel salvar: resposta vazia do servidor.",
                        }
                  ) as {
                    ok: boolean;
                    message: string;
                    publicationStatus?: CatalogPublicationStatus;
                  };

                  setMessage(
                    result.message ??
                      `Nao foi possivel salvar. Codigo ${response.status}.`,
                  );

                  if (response.ok && result.ok) {
                    const savedStatus =
                      result.publicationStatus ?? nextProduct.publicationStatus;
                    setPublicationStatus(savedStatus);
                    onSaved({
                      ...nextProduct,
                      publicationStatus: savedStatus,
                      status: publicationStatusLabel(savedStatus),
                    });
                  }
                } catch {
                  setMessage("Nao foi possivel salvar este produto agora.");
                }
              });
            }}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Titulo
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Categoria
                <input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  list="quick-edit-categories"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                />
                <datalist id="quick-edit-categories">
                  {categories.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Preco
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Estoque
                <input
                  value={stockQuantity}
                  onChange={(event) => setStockQuantity(event.target.value)}
                  type="number"
                  min={0}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Status
                <select
                  value={publicationStatus}
                  onChange={(event) =>
                    setPublicationStatus(
                      event.target.value as CatalogPublicationStatus,
                    )
                  }
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                >
                  <option value="draft">Rascunho</option>
                  <option value="hidden">Oculto</option>
                  <option value="out_of_stock">Sem estoque</option>
                  {canPublish || product.publicationStatus === "published" ? (
                    <option value="published">Publicado</option>
                  ) : null}
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Descricao
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="rounded border border-white/12 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-laser"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Imagens
              <textarea
                value={imageUrls}
                onChange={(event) => setImageUrls(event.target.value)}
                rows={4}
                placeholder="Uma URL por linha"
                className="rounded border border-white/12 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-laser"
              />
            </label>

            <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center justify-center rounded border border-white/12 px-5 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-5 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)] transition disabled:border-white/12 disabled:bg-white/[0.03] disabled:text-zinc-500"
              >
                <Save size={16} />
                {isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
