import Link from "next/link";

const galleryItems = [
  {
    title: "Caneca metálica gravada",
    imageSrc: "/images/gallery/caneca-metalica-gravada.webp",
    placeholder:
      "radial-gradient(ellipse at 34% 38%, rgba(218,221,224,0.36), transparent 24%), linear-gradient(112deg, transparent 0 34%, rgba(255,255,255,0.16) 34% 38%, transparent 38% 100%), radial-gradient(circle at 76% 68%, rgba(225,18,27,0.2), transparent 22%), #0b0d0e",
  },
  {
    title: "Garrafa térmica SCX Laser",
    imageSrc: "/images/gallery/garrafa-termica-scx-laser.webp",
    placeholder:
      "repeating-linear-gradient(28deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 8px), radial-gradient(circle at 58% 40%, rgba(168,112,76,0.46), transparent 28%), radial-gradient(circle at 42% 54%, rgba(225,18,27,0.14), transparent 20%), linear-gradient(135deg,#241713 0%,#090706 58%,#1a100d 100%)",
  },
  {
    title: "Cartão metálico NFC",
    imageSrc: "/images/gallery/cartao-metal-nfc.webp",
    placeholder:
      "radial-gradient(circle at 50% 43%, rgba(230,231,233,0.48), transparent 18%), radial-gradient(circle at 50% 43%, rgba(225,18,27,0.18), transparent 34%), linear-gradient(135deg, transparent 0 44%, rgba(255,255,255,0.18) 44% 46%, transparent 46% 100%), #090b0c",
  },
  {
    title: "Copo térmico gravado",
    imageSrc: "/images/gallery/copo-termico-gravado.webp",
    placeholder:
      "linear-gradient(105deg, transparent 0 38%, rgba(255,255,255,0.18) 38% 41%, transparent 41% 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 12px), radial-gradient(circle at 42% 38%, rgba(210,213,216,0.28), transparent 26%), #090a0b",
  },
  {
    title: "Sacola personalizada",
    imageSrc: "/images/gallery/sacola-personalizada.webp",
    placeholder:
      "radial-gradient(circle at 56% 45%, rgba(255,255,255,0.9), transparent 3%), radial-gradient(circle at 56% 45%, rgba(225,18,27,0.62), transparent 10%), radial-gradient(circle at 56% 45%, rgba(225,18,27,0.26), transparent 28%), linear-gradient(115deg, rgba(210,213,216,0.22) 0 18%, transparent 18% 100%), #08090a",
  },
  {
    title: "Isqueiro personalizado",
    imageSrc: "/images/gallery/isqueiro-personalizado.webp",
    placeholder:
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 5px, transparent 5px 12px), repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0 5px, transparent 5px 12px), radial-gradient(circle at 76% 28%, rgba(225,18,27,0.2), transparent 18%), linear-gradient(135deg,#d9d9d9,#9f9f9f)",
  },
  {
    title: "Anel com gravação digital",
    imageSrc: "/images/gallery/anel-gravacao-digital.webp",
    placeholder:
      "radial-gradient(circle at 50% 43%, rgba(230,231,233,0.48), transparent 18%), radial-gradient(circle at 50% 43%, rgba(225,18,27,0.18), transparent 34%), #090b0c",
  },
  {
    title: "Pingente metálico com onda sonora",
    imageSrc: "/images/gallery/pingente-metalico-onda-sonora.webp",
    placeholder:
      "linear-gradient(105deg, transparent 0 38%, rgba(255,255,255,0.18) 38% 41%, transparent 41% 100%), radial-gradient(circle at 42% 38%, rgba(210,213,216,0.28), transparent 26%), #090a0b",
  },
  {
    title: "Embalagem personalizada",
    imageSrc: "/images/gallery/embalagem-personalizada.webp",
    placeholder:
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 5px, transparent 5px 12px), repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0 5px, transparent 5px 12px), radial-gradient(circle at 76% 28%, rgba(225,18,27,0.2), transparent 18%), linear-gradient(135deg,#d9d9d9,#9f9f9f)",
  },
];

export function Gallery() {
  return (
    <section
      id="galeria"
      className="border-b border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(225,18,27,0.08),transparent_26%),linear-gradient(180deg,#050606_0%,#0c0f10_48%,#030303_100%)] px-5 py-9 text-white sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-laser">
            Resultados que você pode ver
          </p>
          <h2 className="mt-2 text-balance text-2xl font-extrabold leading-tight text-zinc-200 sm:text-3xl">
            Confira alguns trabalhos realizados
          </h2>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {galleryItems.map(({ title, imageSrc, placeholder }, index) => (
            <article
              key={title}
              className="group animate-fade-up overflow-hidden rounded-md border border-white/22 bg-black shadow-[0_18px_46px_rgba(0,0,0,0.42)] transition duration-300 hover:-translate-y-1 hover:border-laser/70 hover:shadow-[0_22px_58px_rgba(225,18,27,0.18)]"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="relative aspect-[1.16/1] overflow-hidden">
                <div
                  aria-label={title}
                  className="absolute inset-0 transition duration-500 group-hover:scale-110"
                  role="img"
                  style={
                    imageSrc
                      ? {
                          backgroundImage: `url(${imageSrc})`,
                          backgroundPosition: "center",
                          backgroundSize: "cover",
                        }
                      : { background: placeholder }
                  }
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),transparent_38%,rgba(0,0,0,0.45)),linear-gradient(90deg,rgba(0,0,0,0.18),transparent_38%,rgba(0,0,0,0.22))]" />
                <div className="absolute inset-x-4 bottom-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <div className="absolute inset-0 opacity-0 transition duration-300 group-hover:bg-laser/12 group-hover:opacity-100" />
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href="#galeria"
            className="inline-flex min-h-[42px] w-full max-w-[260px] items-center justify-center rounded border border-red-400/75 bg-black/35 px-7 py-3 text-xs font-black uppercase tracking-normal text-white transition duration-300 hover:border-laser hover:bg-laser/10 hover:shadow-[0_0_26px_rgba(225,18,27,0.18)] sm:min-w-[230px] sm:w-auto"
          >
            Ver mais trabalhos
          </Link>
        </div>
      </div>
    </section>
  );
}
