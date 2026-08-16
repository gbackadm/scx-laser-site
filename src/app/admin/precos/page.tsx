import Link from "next/link";

import { logoutAdmin } from "@/app/admin/actions";
import { saveGlobalPricingRule } from "@/app/admin/precos/actions";
import { AdminNotice } from "@/components/admin/AdminNotice";
import { requireAdminSession } from "@/domain/auth/session";
import {
  formatMoneyInput,
  parseMoneyToCents as parseCatalogMoneyToCents,
} from "@/domain/catalog/money";
import { roleCan } from "@/domain/catalog/permissions";
import {
  calculateBatchTierPrices,
  calculatePrice,
  getGlobalPricingRule,
  listGlobalPricingBatchTiers,
} from "@/domain/pricing/rules";

export const metadata = {
  title: "Admin SCX Laser | Precos",
};

export const dynamic = "force-dynamic";

type AdminPricingPageProps = {
  searchParams?: Promise<{
    erro?: string;
    salvo?: string;
    custo?: string;
    qtd?: string;
  }>;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function parseSearchMoneyToCents(value: string | undefined, fallback: number) {
  const amountInCents = parseCatalogMoneyToCents(value);

  return amountInCents > 0 ? amountInCents : fallback;
}

function parseQuantity(value: string | undefined) {
  const numericValue = Number(String(value ?? "").trim());

  return Number.isFinite(numericValue) ? Math.max(1, Math.round(numericValue)) : 1;
}

function feedbackMessage(params: Awaited<AdminPricingPageProps["searchParams"]>) {
  if (params?.erro === "permissao") {
    return "Seu usuario nao tem permissao para editar regras de preco.";
  }

  if (params?.salvo) {
    return "Regra global de precos salva.";
  }

  return null;
}

export default async function AdminPricingPage({
  searchParams,
}: AdminPricingPageProps) {
  const [session, params, pricingRule, batchTiers] = await Promise.all([
    requireAdminSession(),
    searchParams,
    getGlobalPricingRule(),
    listGlobalPricingBatchTiers(),
  ]);
  const canEditPricing = roleCan(session.role, "catalog:edit");
  const sampleCostAmountInCents = parseSearchMoneyToCents(params?.custo, 2500);
  const sampleQuantity = parseQuantity(params?.qtd);
  const simulation = calculatePrice({
    costAmountInCents: sampleCostAmountInCents,
    quantity: sampleQuantity,
    rule: pricingRule,
  });
  const tierSimulations = calculateBatchTierPrices(
    sampleCostAmountInCents,
    pricingRule,
    batchTiers,
  );
  const message = feedbackMessage(params);

  return (
    <main className="min-h-screen bg-[#050606] text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/admin/catalogo" className="inline-flex items-center gap-3">
            <img
              src="/images/logo-scx-oficial.webp"
              alt="SCX Laser"
              width={96}
              height={64}
              className="h-12 w-[72px] object-contain object-left"
            />
            <span className="text-sm font-black uppercase tracking-[0.16em] text-zinc-200">
              Admin
            </span>
          </Link>
          <nav className="flex flex-wrap gap-2 text-sm md:justify-end">
            <span className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-400">
              {session.name} - {session.role}
            </span>
            <Link
              href="/admin/catalogo"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Catalogo
            </Link>
            <Link
              href="/admin/importacao"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Importacao
            </Link>
            <Link
              href="/admin/olist"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Olist
            </Link>
            <Link
              href="/"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Site publico
            </Link>
            <form action={logoutAdmin}>
              <button
                type="submit"
                className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-8 sm:py-6 lg:px-12">
        <AdminNotice message={message} />

        <section className="rounded-md border border-white/10 bg-[#0d0f10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
            Precificacao
          </p>
          <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
            Regra global de precos
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Define os precos do catalogo e os bloqueios obrigatorios usados
            antes de publicar ofertas nos marketplaces.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <form action={saveGlobalPricingRule} className="grid content-start gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-zinc-200">
                  Multiplicador sobre custo
                  <input
                    name="costMultiplier"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={pricingRule.costMultiplier}
                    disabled={!canEditPricing}
                    className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-zinc-200">
                  Taxa fixa
                  <input
                    name="fixedFee"
                    inputMode="decimal"
                    defaultValue={formatMoneyInput(pricingRule.fixedFeeAmountInCents)}
                    disabled={!canEditPricing}
                    className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-zinc-200">
                  Perda / risco (%)
                  <input
                    name="lossPercentage"
                    type="number"
                    min={0}
                    step="0.1"
                    defaultValue={pricingRule.lossPercentage}
                    disabled={!canEditPricing}
                    className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-zinc-200">
                  Preco minimo
                  <input
                    name="minimumPrice"
                    inputMode="decimal"
                    defaultValue={formatMoneyInput(pricingRule.minimumPriceAmountInCents)}
                    disabled={!canEditPricing}
                    className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-zinc-200">
                  Estoque minimo publico
                  <input
                    name="publicationStockMinQuantity"
                    type="number"
                    min={0}
                    defaultValue={pricingRule.publicationStockMinQuantity}
                    disabled={!canEditPricing}
                    className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                  />
                </label>
              </div>

              <div className="rounded-md border border-amber-300/20 bg-amber-950/10 p-4">
                <h2 className="text-lg font-black">Protecao de marketplace</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">A oferta fica bloqueada quando nao cumprir qualquer limite abaixo.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold text-zinc-200">
                    Resultado minimo por pedido
                    <input name="marketplaceMinProfit" inputMode="decimal" defaultValue={formatMoneyInput(pricingRule.marketplaceMinProfitAmountInCents)} disabled={!canEditPricing} className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500" />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-zinc-200">
                    Retorno minimo sobre o custo (%)
                    <input name="marketplaceMinReturnPercentage" type="number" min={0} step="0.1" defaultValue={pricingRule.marketplaceMinReturnPercentage} disabled={!canEditPricing} className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500" />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-zinc-200">
                    Custo maximo da mercadoria
                    <input name="marketplaceMaxProductCost" inputMode="decimal" defaultValue={formatMoneyInput(pricingRule.marketplaceMaxProductCostAmountInCents)} disabled={!canEditPricing} className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500" />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-zinc-200">
                    Custo operacional por pedido
                    <input name="marketplaceOperationalCost" inputMode="decimal" defaultValue={formatMoneyInput(pricingRule.marketplaceOperationalCostAmountInCents)} disabled={!canEditPricing} className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500" />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-zinc-200 sm:col-span-2">
                    Reserva para impostos e outros custos (%)
                    <input name="marketplaceTaxReservePercentage" type="number" min={0} step="0.1" defaultValue={pricingRule.marketplaceTaxReservePercentage} disabled={!canEditPricing} className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500" />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-zinc-200 sm:col-span-2">
                    Pausar anuncio com estoque igual ou menor que (kits)
                    <input name="marketplaceStockPauseThreshold" type="number" min={0} step={1} defaultValue={pricingRule.marketplaceStockPauseThreshold} disabled={!canEditPricing} className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500" />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-zinc-200 sm:col-span-2">
                    Sinalizar estoque baixo abaixo de (kits)
                    <input name="marketplaceLowStockWarningThreshold" type="number" min={0} step={1} defaultValue={pricingRule.marketplaceLowStockWarningThreshold} disabled={!canEditPricing} className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500" />
                  </label>
                </div>
              </div>

              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Arredondamento
                <select
                  name="roundingMode"
                  defaultValue={pricingRule.roundingMode}
                  disabled={!canEditPricing}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                >
                  <option value="none">Sem arredondar</option>
                  <option value="nearest_real">Real mais proximo</option>
                  <option value="ending_90">Terminar em ,90</option>
                  <option value="ending_99">Terminar em ,99</option>
                </select>
              </label>

              <div className="rounded-md border border-white/10 bg-black/25 p-4">
                <h2 className="text-lg font-black">Faixas por lote</h2>
                <div className="mt-4 grid gap-3">
                  <div className="hidden grid-cols-[90px_1fr_1fr] gap-3 text-xs font-black uppercase tracking-[0.12em] text-zinc-500 sm:grid">
                    <span>Qtd.</span>
                    <span>Desconto</span>
                    <span>Min. unit.</span>
                  </div>
                  {batchTiers.map((tier, index) => (
                    <div
                      key={tier.id}
                      className="grid gap-3 rounded border border-white/10 bg-black/20 p-3 sm:grid-cols-[90px_1fr_1fr] sm:border-0 sm:bg-transparent sm:p-0"
                    >
                      <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-zinc-500 sm:block">
                        <span className="sm:hidden">Qtd.</span>
                        <input
                          name={`tierQuantity${index}`}
                          type="number"
                          min={1}
                          defaultValue={tier.minQuantity}
                          disabled={!canEditPricing}
                          className="h-10 w-full rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-zinc-500 sm:block">
                        <span className="sm:hidden">Desconto</span>
                        <input
                          name={`tierDiscount${index}`}
                          type="number"
                          min={0}
                          step="0.1"
                          defaultValue={tier.discountPercentage}
                          disabled={!canEditPricing}
                          className="h-10 w-full rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-zinc-500 sm:block">
                        <span className="sm:hidden">Min. unit.</span>
                        <input
                          name={`tierMinimumUnitPrice${index}`}
                          inputMode="decimal"
                          defaultValue={formatMoneyInput(
                            tier.minimumUnitPriceAmountInCents,
                          )}
                          disabled={!canEditPricing}
                          className="h-10 w-full rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canEditPricing}
                className="inline-flex min-h-11 items-center justify-center rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-5 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)] transition disabled:border-white/12 disabled:bg-white/[0.03] disabled:text-zinc-500 sm:w-fit"
              >
                Salvar regra
              </button>
            </form>

            <div className="rounded-md border border-white/10 bg-black/25 p-4">
              <h2 className="text-lg font-black">Simulador</h2>
              <form className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-zinc-200">
                  Custo
                  <input
                    name="custo"
                    inputMode="decimal"
                    defaultValue={formatMoneyInput(sampleCostAmountInCents)}
                    className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-zinc-200">
                  Quantidade
                  <input
                    name="qtd"
                    type="number"
                    min={1}
                    defaultValue={sampleQuantity}
                    className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center rounded border border-white/12 px-4 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white sm:col-span-2"
                >
                  Simular
                </button>
              </form>

              <dl className="mt-5 grid gap-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                  <dt className="text-zinc-400">Base multiplicada</dt>
                  <dd className="font-bold text-zinc-100">
                    {currencyFormatter.format(simulation.subtotalAmountInCents / 100)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                  <dt className="text-zinc-400">Perda / risco</dt>
                  <dd className="font-bold text-zinc-100">
                    {currencyFormatter.format(simulation.lossAmountInCents / 100)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                  <dt className="text-zinc-400">Taxa fixa</dt>
                  <dd className="font-bold text-zinc-100">
                    {currencyFormatter.format(simulation.fixedFeeAmountInCents / 100)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                  <dt className="text-zinc-400">Preco final</dt>
                  <dd className="text-lg font-black text-white">
                    {currencyFormatter.format(simulation.roundedAmountInCents / 100)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-400">Unitario estimado</dt>
                  <dd className="font-black text-emerald-200">
                    {currencyFormatter.format(simulation.unitPriceAmountInCents / 100)}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 rounded border border-white/10 bg-black/30 p-3">
                <h3 className="text-sm font-black">Simulacao por lote</h3>
                <div className="mt-3 grid gap-2">
                  {tierSimulations.map(({ tier, simulation: tierSimulation }) => (
                    <div
                      key={tier.id}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span className="text-zinc-400">{tier.minQuantity}+ un.</span>
                      <span className="font-bold text-emerald-200">
                        {currencyFormatter.format(
                          tierSimulation.unitPriceAmountInCents / 100,
                        )}
                        /un.
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
