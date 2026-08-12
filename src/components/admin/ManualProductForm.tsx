"use client";

import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { createManualCatalogProduct } from "@/app/admin/catalogo/actions";

type VariationAttributeDraft = {
  id: string;
  name: string;
  value: string;
};

type VariationDraft = {
  id: string;
  scxSku: string;
  supplierSku: string;
  name: string;
  price: string;
  cost: string;
  stockQuantity: string;
  imageUrls: string;
  attributes: VariationAttributeDraft[];
};

function createVariation(index: number): VariationDraft {
  return {
    id: `variation-${Date.now()}-${index}`,
    scxSku: "",
    supplierSku: "",
    name: "",
    price: "",
    cost: "",
    stockQuantity: "0",
    imageUrls: "",
    attributes: [
      {
        id: `attribute-${Date.now()}-${index}-0`,
        name: "Cor",
        value: "",
      },
    ],
  };
}

const inputClassName =
  "h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser";
const textareaClassName =
  "rounded border border-white/12 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-laser";

function RequiredMark() {
  return <span aria-hidden="true" className="required-mark absolute right-0 top-0 text-laser">*</span>;
}

export function ManualProductForm({
  categories,
  canPublish,
}: {
  categories: string[];
  canPublish: boolean;
}) {
  const [variations, setVariations] = useState<VariationDraft[]>(() => [
    createVariation(0),
  ]);
  const [title, setTitle] = useState("");

  function updateVariation(
    variationId: string,
    field: keyof Omit<VariationDraft, "id" | "attributes">,
    value: string,
  ) {
    setVariations((current) =>
      current.map((variation) =>
        variation.id === variationId ? { ...variation, [field]: value } : variation,
      ),
    );
  }

  function updateAttribute(
    variationId: string,
    attributeId: string,
    field: "name" | "value",
    value: string,
  ) {
    setVariations((current) =>
      current.map((variation) =>
        variation.id === variationId
          ? {
              ...variation,
              attributes: variation.attributes.map((attribute) =>
                attribute.id === attributeId
                  ? { ...attribute, [field]: value }
                  : attribute,
              ),
            }
          : variation,
      ),
    );
  }

  const variantsJson = JSON.stringify(
    variations.map((variation) => ({
      scxSku: variation.scxSku,
      supplierSku: variation.supplierSku,
      name: variation.name,
      price: variation.price,
      cost: variation.cost,
      stockQuantity: variation.stockQuantity,
      imageUrls: variation.imageUrls,
      attributes: variation.attributes.map(({ name, value }) => ({ name, value })),
    })),
  );

  return (
    <form action={createManualCatalogProduct} className="manual-product-form mt-6 grid gap-6">
      <input type="hidden" name="variants" value={variantsJson} />

      <nav className="sticky top-16 z-20 -mx-5 grid grid-cols-4 gap-1 border-y border-white/10 bg-[#0d0f10]/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0">
        <a href="#identificacao" className="rounded px-1 py-2 text-center text-[0.68rem] font-black text-zinc-300 transition hover:bg-white/5 hover:text-white sm:px-3 sm:text-xs">
          1. Produto
        </a>
        <a href="#logistica" className="rounded px-1 py-2 text-center text-[0.68rem] font-black text-zinc-300 transition hover:bg-white/5 hover:text-white sm:px-3 sm:text-xs">
          2. Logistica
        </a>
        <a href="#fotos" className="rounded px-1 py-2 text-center text-[0.68rem] font-black text-zinc-300 transition hover:bg-white/5 hover:text-white sm:px-3 sm:text-xs">
          3. Fotos
        </a>
        <a href="#variacoes" className="rounded px-1 py-2 text-center text-[0.68rem] font-black text-zinc-300 transition hover:bg-white/5 hover:text-white sm:px-3 sm:text-xs">
          4. Variacoes
        </a>
      </nav>

      <section id="identificacao" className="grid scroll-mt-36 gap-4 border-b border-white/10 pb-6 lg:scroll-mt-20">
        <div>
          <p className="text-xs font-black uppercase text-laser">Etapa 1</p>
          <h2 className="mt-1 text-xl font-black text-white">Identificacao do produto</h2>
          <p className="mt-1 text-xs text-zinc-500">Campos com * sao obrigatorios.</p>
        </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          SKU SCX do produto pai <RequiredMark />
          <input
            name="scxSku"
            required
            maxLength={30}
            placeholder="SCX-CAN-0007"
            className={inputClassName}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Codigo principal do fornecedor <RequiredMark />
          <input
            name="supplierCode"
            required
            placeholder="COD-FORN-001"
            className={inputClassName}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Status <RequiredMark />
          <select
            name="publicationStatus"
            defaultValue="hidden"
            required
            className={inputClassName}
          >
            <option value="hidden">Oculto</option>
            <option value="out_of_stock">Sem estoque</option>
            <option value="draft">Rascunho</option>
            {canPublish ? <option value="published">Publicado</option> : null}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_180px]">
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Titulo comercial <RequiredMark />
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={60}
            placeholder="Garrafa termica inox 500 ml"
            className={inputClassName}
          />
          <span className="text-right text-[0.68rem] font-semibold text-zinc-500">
            {title.length}/60
          </span>
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Categoria <RequiredMark />
          <input
            name="categoryName"
            required
            list="manual-product-categories"
            className={inputClassName}
          />
          <datalist id="manual-product-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          NCM <RequiredMark />
          <input
            name="ncm"
            required
            maxLength={10}
            placeholder="9608.10.00"
            className={inputClassName}
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-bold text-zinc-200">
        Descricao
        <textarea name="description" rows={5} className={textareaClassName} />
      </label>

      </section>

      <section id="logistica" className="grid scroll-mt-36 gap-4 border-b border-white/10 pb-6 lg:scroll-mt-20">
        <div>
          <p className="text-xs font-black uppercase text-laser">Etapa 2</p>
          <h2 className="mt-1 text-xl font-black text-white">Fornecedor e logistica</h2>
        </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Fornecedor <RequiredMark />
          <input
            name="supplierName"
            required
            placeholder="Fornecedor / fabrica"
            className={inputClassName}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200 lg:col-span-2">
          ID fornecedor no Olist/Tiny <RequiredMark />
          <input
            name="olistSupplierId"
            required
            placeholder="ID do fornecedor cadastrado no Olist/Tiny"
            className={inputClassName}
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Peso kg <RequiredMark />
          <input
            name="weightKg"
            required
            inputMode="decimal"
            placeholder="0,010"
            className={inputClassName}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Altura cm <RequiredMark />
          <input
            name="heightCm"
            required
            inputMode="decimal"
            placeholder="14"
            className={inputClassName}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Largura cm <RequiredMark />
          <input
            name="widthCm"
            required
            inputMode="decimal"
            placeholder="2"
            className={inputClassName}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-zinc-200">
          Comprimento cm <RequiredMark />
          <input
            name="lengthCm"
            required
            inputMode="decimal"
            placeholder="2"
            className={inputClassName}
          />
        </label>
      </div>

      </section>

      <section id="fotos" className="grid scroll-mt-36 gap-4 border-b border-white/10 pb-6 lg:scroll-mt-20">
        <div>
          <p className="text-xs font-black uppercase text-laser">Etapa 3</p>
          <h2 className="mt-1 text-xl font-black text-white">Fotos do produto pai</h2>
        </div>
      <label className="grid gap-2 text-sm font-bold text-zinc-200">
        <span className="inline-flex items-center gap-2">
          <ImagePlus size={17} /> Fotos do produto, uma URL por linha <RequiredMark />
        </span>
        <textarea
          name="imageUrls"
          required
          rows={5}
          placeholder="https://..."
          className={textareaClassName}
        />
      </label>
      </section>

      <section id="variacoes" className="grid scroll-mt-36 gap-4 lg:scroll-mt-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
              Grade do produto
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Variacoes obrigatorias
            </h2>
          </div>
          <button
            type="button"
            onClick={() =>
              setVariations((current) => [...current, createVariation(current.length)])
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-emerald-300/35 px-4 text-sm font-black text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-400/10"
          >
            <Plus size={17} /> Adicionar variacao
          </button>
        </div>

        {variations.map((variation, variationIndex) => (
          <article
            key={variation.id}
            className="grid gap-4 rounded-md border border-white/12 bg-black/25 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black text-white">
                Variacao {variationIndex + 1}
              </h3>
              <button
                type="button"
                disabled={variations.length === 1}
                onClick={() =>
                  setVariations((current) =>
                    current.filter((item) => item.id !== variation.id),
                  )
                }
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/12 text-zinc-300 transition hover:border-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:text-zinc-700"
                title="Remover variacao"
              >
                <Trash2 size={17} />
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Nome da opcao <RequiredMark />
                <input
                  required
                  value={variation.name}
                  onChange={(event) =>
                    updateVariation(variation.id, "name", event.target.value)
                  }
                  placeholder="Azul / Grande"
                  className={inputClassName}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                SKU SCX da variacao <RequiredMark />
                <input
                  required
                  maxLength={30}
                  value={variation.scxSku}
                  onChange={(event) =>
                    updateVariation(variation.id, "scxSku", event.target.value)
                  }
                  placeholder="SCX-CAN-0007-AZ"
                  className={inputClassName}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Codigo da variacao no fornecedor <RequiredMark />
                <input
                  required
                  value={variation.supplierSku}
                  onChange={(event) =>
                    updateVariation(variation.id, "supplierSku", event.target.value)
                  }
                  className={inputClassName}
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Preco de venda <RequiredMark />
                <input
                  required
                  inputMode="decimal"
                  value={variation.price}
                  onChange={(event) =>
                    updateVariation(variation.id, "price", event.target.value)
                  }
                  placeholder="49,90"
                  className={inputClassName}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Custo <RequiredMark />
                <input
                  required
                  inputMode="decimal"
                  value={variation.cost}
                  onChange={(event) =>
                    updateVariation(variation.id, "cost", event.target.value)
                  }
                  placeholder="22,00"
                  className={inputClassName}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Estoque <RequiredMark />
                <input
                  required
                  type="number"
                  min={0}
                  value={variation.stockQuantity}
                  onChange={(event) =>
                    updateVariation(variation.id, "stockQuantity", event.target.value)
                  }
                  className={inputClassName}
                />
              </label>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-black text-zinc-200">
                  Atributos da grade <RequiredMark />
                </h4>
                <button
                  type="button"
                  disabled={variation.attributes.length >= 3}
                  onClick={() =>
                    setVariations((current) =>
                      current.map((item) =>
                        item.id === variation.id
                          ? {
                              ...item,
                              attributes: [
                                ...item.attributes,
                                {
                                  id: `attribute-${Date.now()}-${item.attributes.length}`,
                                  name: "",
                                  value: "",
                                },
                              ],
                            }
                          : item,
                      ),
                    )
                  }
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-white/12 px-3 text-xs font-black text-zinc-200 transition hover:border-laser disabled:text-zinc-700"
                >
                  <Plus size={15} /> Atributo
                </button>
              </div>

              {variation.attributes.map((attribute) => (
                <div
                  key={attribute.id}
                  className="grid gap-3 sm:grid-cols-[1fr_1fr_40px]"
                >
                  <input
                    required
                    value={attribute.name}
                    onChange={(event) =>
                      updateAttribute(
                        variation.id,
                        attribute.id,
                        "name",
                        event.target.value,
                      )
                    }
                    placeholder="Tipo: Cor, Tamanho, Modelo"
                    className={inputClassName}
                  />
                  <input
                    required
                    value={attribute.value}
                    onChange={(event) =>
                      updateAttribute(
                        variation.id,
                        attribute.id,
                        "value",
                        event.target.value,
                      )
                    }
                    placeholder="Valor: Azul, G, 500 ml"
                    className={inputClassName}
                  />
                  <button
                    type="button"
                    disabled={variation.attributes.length === 1}
                    onClick={() =>
                      setVariations((current) =>
                        current.map((item) =>
                          item.id === variation.id
                            ? {
                                ...item,
                                attributes: item.attributes.filter(
                                  (itemAttribute) => itemAttribute.id !== attribute.id,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                    className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/12 text-zinc-300 transition hover:border-red-300 hover:text-red-200 disabled:text-zinc-700"
                    title="Remover atributo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Fotos exclusivas desta variacao
              <textarea
                value={variation.imageUrls}
                onChange={(event) =>
                  updateVariation(variation.id, "imageUrls", event.target.value)
                }
                rows={3}
                placeholder="Uma URL por linha. Vazio usa as fotos do produto."
                className={textareaClassName}
              />
            </label>
          </article>
        ))}
      </section>

      <div className="-mx-5 flex flex-col gap-3 border-t border-white/10 bg-[#0d0f10] px-5 pt-5 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <a
          href="/admin/catalogo"
          className="inline-flex min-h-11 items-center justify-center rounded border border-white/12 px-5 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white"
        >
          Cancelar
        </a>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-5 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)]"
        >
          Criar produto com variacoes
        </button>
      </div>
    </form>
  );
}
