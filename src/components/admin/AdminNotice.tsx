import { MonitorDot } from "lucide-react";

export function AdminNotice() {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-300/20 pb-3 text-xs font-bold text-amber-100">
      <MonitorDot className="h-4 w-4 shrink-0 text-amber-300" />
      <span>Ambiente local</span>
      <span className="text-zinc-500">Dados conectados ao banco configurado</span>
    </div>
  );
}
