import { LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AdminNotice } from "@/components/admin/AdminNotice";
import { getCurrentAdminSession } from "@/domain/auth/session";

import { loginAdmin } from "./actions";

export const metadata = {
  title: "Admin SCX Laser | Login",
};

type AdminLoginPageProps = {
  searchParams?: Promise<{
    erro?: string;
    logout?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const [session, params] = await Promise.all([
    getCurrentAdminSession(),
    searchParams,
  ]);

  if (session) {
    redirect("/admin/catalogo");
  }

  const errorMessage =
    params?.erro === "credenciais"
      ? "E-mail ou senha invalidos."
      : params?.erro === "campos"
        ? "Informe e-mail e senha."
        : params?.erro === "banco"
          ? "Banco de dados indisponivel ou nao configurado no ambiente."
        : null;

  return (
    <main className="min-h-screen bg-[#050606] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <section>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-laser">
              SCX Laser Admin
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">
              Base de acesso administrativo
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">
              Acesso local com sessao segura, senha com hash forte e protecao
              server-side das rotas administrativas.
            </p>
            <div className="mt-7 max-w-2xl">
              <AdminNotice />
            </div>
          </section>

          <section className="rounded-md border border-white/10 bg-[#0d0f10] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded border border-red-300/35 bg-laser/15 text-laser">
              <LockKeyhole size={24} />
            </div>
            <h2 className="mt-5 text-xl font-black">Entrar no painel</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Use a conta administrativa criada pelo comando local seguro. Nao ha
              usuario ou senha padrao.
            </p>

            {errorMessage ? (
              <div className="mt-5 rounded border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-100">
                {errorMessage}
              </div>
            ) : null}

            {params?.logout ? (
              <div className="mt-5 rounded border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">
                Sessao encerrada.
              </div>
            ) : null}

            <form action={loginAdmin} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                E-mail
                <input
                  required
                  name="email"
                  type="email"
                  placeholder="admin@scxlaser.com.br"
                  autoComplete="email"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Senha
                <input
                  required
                  name="password"
                  type="password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <button
                type="submit"
                className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-4 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)] transition hover:bg-red-600"
              >
                <ShieldCheck size={17} />
                Entrar
              </button>
            </form>

            <div className="mt-6 rounded border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                Previa local
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Para criar o primeiro acesso, execute o comando interativo local
                documentado. A senha nunca fica em texto puro.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
