"use client";

import { Sparkles } from "lucide-react";

export function AiEnhanceButton() {
  return (
    <button
      type="button"
      disabled
      title="Melhoria com IA sera liberada em uma proxima etapa"
      aria-label="Melhorar com IA, recurso em breve"
      className="ai-enhance-button inline-flex min-h-8 shrink-0 cursor-not-allowed items-center gap-1.5 rounded border border-violet-400/25 bg-violet-500/10 px-2.5 text-xs font-black text-violet-300 opacity-70"
    >
      <Sparkles size={15} aria-hidden="true" />
      Melhorar com IA
      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-zinc-400">Em breve</span>
    </button>
  );
}
