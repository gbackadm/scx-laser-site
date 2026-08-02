import { BadgeCheck, Crosshair, ShieldCheck } from "lucide-react";

import { scxWhatsappUrl } from "@/data/contact";

export const navigationLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Serviços", href: "#servicos" },
  { label: "Materiais", href: "#materiais" },
  { label: "Galeria", href: "#galeria" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Orçamento", href: "#orcamento" },
  { label: "Contato", href: "#contato" },
];

export const headerCta = {
  label: "Orçamento via WhatsApp",
  href: scxWhatsappUrl(),
};

export const heroButtons = [
  {
    label: "Pedir orçamento",
    href: scxWhatsappUrl(),
    variant: "primary",
  },
  {
    label: "Ver exemplos",
    href: "#galeria",
    variant: "secondary",
  },
] as const;

export const heroBenefits = [
  { label: "Alta definição", Icon: Crosshair },
  { label: "Sem contato", Icon: BadgeCheck },
  { label: "Não danifica o material", Icon: ShieldCheck },
];
