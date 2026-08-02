import { ShieldAlert } from "lucide-react";

export function AdminNotice() {
  return (
    <div className="rounded-md border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
        <div>
          <p className="font-bold">Base administrativa local</p>
          <p className="mt-1 text-amber-100/90">
            Esta area nao autentica usuarios ainda. Sem DATABASE_URL, o painel usa
            dados demonstrativos; com DATABASE_URL, le o PostgreSQL local. Um
            provedor real de autenticacao ainda e necessario antes de uso em
            producao.
          </p>
        </div>
      </div>
    </div>
  );
}
