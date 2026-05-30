import { Facebook, Instagram, Linkedin, Mail, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";

const quickLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Serviços", href: "#servicos" },
  { label: "Materiais", href: "#materiais" },
  { label: "Galeria", href: "#galeria" },
  { label: "Orçamento", href: "#orcamento" },
  { label: "Contato", href: "#contato" },
];

const socialLinks = [
  { label: "Instagram", href: "#", Icon: Instagram },
  { label: "Facebook", href: "#", Icon: Facebook },
  { label: "LinkedIn", href: "#", Icon: Linkedin },
];

const contactItems = [
  { label: "(47) 99722-8686", href: "https://wa.me/5547997228686", Icon: MessageCircle },
  { label: "contato@scxlaser.com.br", href: "mailto:contato@scxlaser.com.br", Icon: Mail },
  { label: "Santa Catarina - Brasil", href: "#", Icon: MapPin },
];

export function Footer() {
  return (
    <footer
      id="contato"
      className="bg-[linear-gradient(180deg,#030303_0%,#070808_100%)] text-white"
    >
      <div className="border-b border-laser/45 border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-9 px-5 py-9 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.35fr_0.8fr_1fr_0.8fr] lg:px-12">
          <div>
            <Link href="#inicio" aria-label="SCX Laser" className="inline-flex">
              <img
                src="/images/logo-scx-oficial.png"
                alt="SCX Laser"
                width={250}
                height={166}
                className="h-[76px] w-[114px] object-contain object-left"
              />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-300">
              SCX Laser é especializada em gravação a laser UV de alta precisão
              para brindes, produtos personalizados e peças técnicas.
            </p>
            <div className="mt-5 flex gap-4">
              {socialLinks.map(({ label, href, Icon }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  className="text-zinc-200 transition duration-300 hover:-translate-y-0.5 hover:text-laser"
                >
                  <Icon size={23} strokeWidth={2} />
                </Link>
              ))}
            </div>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-10">
            <h2 className="text-sm font-black uppercase tracking-[0.12em] text-laser">
              Links Rápidos
            </h2>
            <nav className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-zinc-300 sm:grid-cols-1">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition duration-300 hover:text-laser"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-10">
            <h2 className="text-sm font-black uppercase tracking-[0.12em] text-laser">
              Contato
            </h2>
            <div className="mt-5 grid gap-4 text-sm text-zinc-300">
              {contactItems.map(({ label, href, Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className="inline-flex items-center gap-3 transition duration-300 hover:text-laser"
                >
                  <Icon size={18} className="shrink-0 text-laser" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-10">
            <h2 className="text-sm font-black uppercase tracking-[0.12em] text-laser">
              Siga-nos
            </h2>
            <div className="mt-5 flex gap-5">
              {socialLinks.map(({ label, href, Icon }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-zinc-100 transition duration-300 hover:-translate-y-0.5 hover:border-laser/70 hover:bg-laser/10 hover:text-laser"
                >
                  <Icon size={22} strokeWidth={2} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 text-center text-xs text-zinc-500 sm:px-8 lg:px-12">
        © 2026 SCX Laser. Todos os direitos reservados.
      </div>
    </footer>
  );
}
