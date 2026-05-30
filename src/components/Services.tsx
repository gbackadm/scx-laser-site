import {
  Badge,
  BriefcaseBusiness,
  Cog,
  Gem,
  ScanLine,
  UserRound,
} from "lucide-react";

const services = [
  {
    title: "Brindes Corporativos",
    description: "Canetas, chaveiros, copos, placas e medalhas.",
    Icon: BriefcaseBusiness,
    imageSrc: "/images/services/brindes-corporativos-caneta-scx-laser.png",
    imageStyle:
      "radial-gradient(circle at 24% 22%, rgba(210,213,216,0.34), transparent 28%), linear-gradient(135deg, #181b1d 0%, #070808 52%, #111315 100%)",
  },
  {
    title: "Produtos Personalizados",
    description: "Presentes, decoração e itens exclusivos.",
    Icon: UserRound,
    imageSrc: "/images/services/produtos-personalizados-copo-sua-marca.png",
    imageStyle:
      "radial-gradient(circle at 50% 18%, rgba(210,213,216,0.32), transparent 24%), linear-gradient(160deg, #222426 0%, #08090a 48%, #151719 100%)",
  },
  {
    title: "Plaquetas e Tags",
    description: "QR Code, NFC e identificação.",
    Icon: Badge,
    imageSrc: "/images/services/plaquetas-tags-nfc-qrcode.png",
    imageStyle:
      "linear-gradient(135deg, rgba(200,201,204,0.2) 0 18%, transparent 18% 100%), radial-gradient(circle at 82% 28%, rgba(225,18,27,0.18), transparent 26%), #0b0d0e",
  },
  {
    title: "Peças Técnicas",
    description: "Componentes industriais e gravações técnicas.",
    Icon: Cog,
    imageSrc: "/images/services/pecas-tecnicas-aluminio-gravado.png",
    imageStyle:
      "repeating-linear-gradient(135deg, rgba(255,255,255,0.1) 0 1px, transparent 1px 14px), radial-gradient(circle at 32% 42%, rgba(200,201,204,0.24), transparent 26%), #090b0c",
  },
  {
    title: "Couro Sintético",
    description: "Carteiras, etiquetas e brindes.",
    Icon: ScanLine,
    imageSrc: "/images/services/couro-sintetico-logo-scx-laser.png",
    imageStyle:
      "radial-gradient(circle at 60% 38%, rgba(145,89,55,0.36), transparent 34%), linear-gradient(135deg, #241713 0%, #0a0807 55%, #19110f 100%)",
  },
  {
    title: "Acrílico e Vidro",
    description: "Acabamento sofisticado e preciso.",
    Icon: Gem,
    imageSrc: "/images/services/acrilico-vidro-placa-scx-laser.png",
    imageStyle:
      "linear-gradient(135deg, rgba(255,255,255,0.26) 0 1px, transparent 1px 100%), radial-gradient(circle at 72% 30%, rgba(210,213,216,0.32), transparent 24%), #090b0c",
  },
];

export function Services() {
  return (
    <section
      id="servicos"
      className="border-b border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.055),transparent_34%),linear-gradient(180deg,#070909_0%,#030303_100%)] px-5 py-8 text-white sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-laser">
            O que gravamos
          </p>
          <h2 className="mt-2 text-balance text-2xl font-extrabold leading-tight text-zinc-200 sm:text-3xl">
            Soluções personalizadas para brindes, produtos e peças técnicas
          </h2>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {services.map(
            ({ title, description, Icon, imageSrc, imageStyle }, index) => (
              <article
                key={title}
                className="group relative min-h-[206px] overflow-hidden rounded-md border border-white/22 bg-[#0a0c0d] shadow-[0_16px_45px_rgba(0,0,0,0.32)] transition duration-300 hover:-translate-y-1 hover:border-laser/70 hover:shadow-[0_18px_50px_rgba(225,18,27,0.12)] sm:min-h-[246px]"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="relative h-[96px] overflow-hidden border-b border-white/10 sm:h-[128px]">
                  <div
                    className="absolute inset-0 opacity-95 transition duration-300 group-hover:scale-105 group-hover:opacity-100"
                    style={
                      imageSrc
                        ? {
                            backgroundImage: `url(${imageSrc})`,
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                          }
                        : { background: imageStyle }
                    }
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,transparent_42%,rgba(0,0,0,0.45)_100%)]" />
                  <div className="absolute inset-x-5 bottom-5 h-px bg-gradient-to-r from-transparent via-white/28 to-transparent" />
                </div>

                <div className="absolute left-1/2 top-[78px] flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-red-300/45 bg-[linear-gradient(180deg,#b61920_0%,#7e0e13_100%)] text-white shadow-[0_0_20px_rgba(225,18,27,0.34)] sm:top-[106px] sm:h-12 sm:w-12">
                  <Icon size={23} strokeWidth={1.9} />
                </div>

                <div className="px-4 pb-4 pt-7 text-center sm:pb-5 sm:pt-9">
                  <h3 className="text-sm font-extrabold text-zinc-100">
                    {title}
                  </h3>
                  <p className="mt-2 text-[0.78rem] leading-5 text-zinc-300">
                    {description}
                  </p>
                </div>
              </article>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
