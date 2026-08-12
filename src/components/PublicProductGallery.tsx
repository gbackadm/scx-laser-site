"use client";

import { useMemo, useState } from "react";

import type { PublicCatalogVariant } from "@/domain/catalog/publicTypes";

type PublicProductGalleryProps = {
  title: string;
  imageUrls: string[];
  variants: PublicCatalogVariant[];
};

const colorSwatches: Record<string, string> = {
  amarelo: "#eab308",
  azul: "#2563eb",
  branco: "#f4f4f5",
  cafe: "#6f4e37",
  chocolate: "#5c3317",
  cinza: "#71717a",
  cru: "#d6c7a1",
  dourado: "#c89b3c",
  grafite: "#3f3f46",
  laranja: "#ea580c",
  prata: "#a1a1aa",
  preto: "#18181b",
  rosa: "#ec4899",
  roxo: "#7e22ce",
  verde: "#16a34a",
  vermelho: "#dc2626",
};

function swatchColor(color?: string) {
  return colorSwatches[color?.toLocaleLowerCase("pt-BR") ?? ""] ?? "#71717a";
}

export function PublicProductGallery({
  title,
  imageUrls,
  variants,
}: PublicProductGalleryProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>();
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  const availableImages = useMemo(
    () =>
      Array.from(
        new Set(
          selectedVariant?.imageUrls.length
            ? [...selectedVariant.imageUrls, ...imageUrls]
            : imageUrls,
        ),
      ),
    [imageUrls, selectedVariant],
  );
  const [selectedImage, setSelectedImage] = useState<string>();
  const mainImage =
    selectedImage && availableImages.includes(selectedImage)
      ? selectedImage
      : availableImages[0];

  function selectVariant(variant: PublicCatalogVariant) {
    setSelectedVariantId(variant.id);
    setSelectedImage(variant.imageUrls[0]);
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-md border border-white/10 bg-[#0d0f10]">
        {mainImage ? (
          <img
            src={mainImage}
            alt={selectedVariant ? `${title} - ${selectedVariant.color ?? selectedVariant.name}` : title}
            className="aspect-[4/3] w-full bg-white object-contain"
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-black/35 px-6 text-center text-sm font-bold text-zinc-500">
            Imagem em revisao
          </div>
        )}
      </div>

      {variants.length > 0 ? (
        <div className="border-y border-white/10 py-4">
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const selected = variant.id === selectedVariantId;
              const label = variant.color ?? variant.name;
              return (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectVariant(variant)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded border px-3 text-sm font-bold transition ${
                    selected
                      ? "border-laser bg-red-950/35 text-white"
                      : "border-white/12 bg-black/25 text-zinc-300 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-white/25"
                    style={{ backgroundColor: swatchColor(variant.color) }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
          {selectedVariant ? (
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              Codigo: {selectedVariant.sku}
            </p>
          ) : null}
        </div>
      ) : null}

      {availableImages.length > 1 ? (
        <div className="grid grid-cols-4 gap-3">
          {availableImages.slice(0, 8).map((imageUrl) => (
            <button
              key={imageUrl}
              type="button"
              onClick={() => setSelectedImage(imageUrl)}
              className={`overflow-hidden rounded border bg-black/35 ${
                imageUrl === mainImage ? "border-laser" : "border-white/10"
              }`}
            >
              <img
                src={imageUrl}
                alt={title}
                className="aspect-square w-full bg-white object-contain"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
