"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

type AdminNoticeTone = "success" | "warning" | "error" | "info";

const toneClasses: Record<AdminNoticeTone, string> = {
  success: "border-emerald-400/40 bg-emerald-950 text-emerald-100",
  warning: "border-amber-300/40 bg-amber-950 text-amber-100",
  error: "border-red-400/40 bg-red-950 text-red-100",
  info: "border-sky-300/40 bg-zinc-950 text-zinc-100",
};

function inferredTone(message: string): AdminNoticeTone {
  if (/nao |falh|erro|recus|expir|bloque/i.test(message)) return "error";
  if (/pendente|aviso|paus|estoque baixo/i.test(message)) return "warning";
  if (/conclu|sucesso|salv|atualiz|sincroniz|criad|exclu/i.test(message)) return "success";
  return "info";
}

export function AdminNotice({ message, tone }: { message?: string | null; tone?: AdminNoticeTone }) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    setVisible(Boolean(message));
    if (!message) return;
    const timeout = window.setTimeout(() => setVisible(false), 7000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  if (!message || !visible) return null;
  const resolvedTone = tone ?? inferredTone(message);
  const Icon = resolvedTone === "success" ? CheckCircle2 : resolvedTone === "info" ? Info : CircleAlert;

  return (
    <div className="fixed left-4 right-4 top-4 z-[100] sm:left-auto sm:w-[min(28rem,calc(100vw-2rem))]" role="status" aria-live="polite">
      <div className={`flex items-start gap-3 rounded border px-4 py-3 shadow-2xl ${toneClasses[resolvedTone]}`}>
        <Icon size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-bold leading-6">{message}</p>
        <button type="button" onClick={() => setVisible(false)} title="Fechar aviso" aria-label="Fechar aviso" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded opacity-70 hover:bg-white/10 hover:opacity-100">
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
