"use client";

import { useMemo, useState } from "react";
import {
  TrendingUp,
  Coins,
  Percent,
  Calendar,
  Layers,
  BarChart3,
  Table as TableIcon,
  ArrowRight
} from "lucide-react";
import type { AppData, ProjectionInput } from "@/domain/types";
import { accountBalance, budgetFor, cashFlow, d, money, monthDistance, project } from "@/domain/finance";
import { brl, monthLabel, today } from "@/lib/utils";
import { FinanceChart } from "./charts";
import { Button } from "./ui/button";
import { MoneyInput, Stat } from "./shared";
const YIELD_PRESETS = [
  { id: "poupanca", label: "Poupança", rate: "6.17", badge: "6,17% a.a." },
  { id: "nubank", label: "Caixinha Nubank (100% CDI)", rate: "10.65", badge: "10,65% a.a." },
  { id: "turbo", label: "Caixinha Turbo (115% CDI)", rate: "12.25", badge: "12,25% a.a." },
  { id: "custom", label: "Personalizado", rate: "", badge: "Manual" }
];

export function Projections({ data, month }: { data: AppData; month: string }) {
  const currentMonth = today().slice(0, 7);
  const currentYear = Number(currentMonth.slice(0, 4));

  // 1. Dados base atuais do orçamento
  const baseBudget = budgetFor(data.items, month);
  const baseFlow = cashFlow(baseBudget);
  const baseIncome = Number(baseFlow.income) || 0;
  const baseExpenses = Number(baseFlow.expenses) || 0;
  const baseInvestment = Number(baseFlow.investment) || 0;
  const baseReserve = Number(baseFlow.reserve) || 0;

  // Proporções base (em %)
  const defaultExpensesPct = baseIncome > 0 ? Number(((baseExpenses / baseIncome) * 100).toFixed(1)) : 40.9;
  const defaultInvestmentPct = baseIncome > 0 ? Number(((baseInvestment / baseIncome) * 100).toFixed(1)) : 29.7;
  const defaultReservePct = baseIncome > 0 ? Number(((baseReserve / baseIncome) * 100).toFixed(1)) : 29.4;

  // 2. Estados dos controles
  const [targetYear, setTargetYear] = useState<string>(String(currentYear + 1));
  const [salaryMode, setSalaryMode] = useState<"current" | "custom">("current");
  const [customSalary, setCustomSalary] = useState<string>(baseIncome ? String(Math.round(baseIncome * 1.5)) : "3000");

  const [proportionMode, setProportionMode] = useState<"keep" | "custom">("keep");
  const [customExpensesPct, setCustomExpensesPct] = useState<number>(Math.round(defaultExpensesPct));
  const [customInvestmentPct, setCustomInvestmentPct] = useState<number>(Math.round(defaultInvestmentPct));
  const [customReservePct, setCustomReservePct] = useState<number>(Math.round(defaultReservePct));

  const [selectedYield, setSelectedYield] = useState<string>("nubank");
  const [annualRate, setAnnualRate] = useState<string>("10.65");
  const [viewTab, setViewTab] = useState<"chart" | "yearly" | "monthly">("chart");
  const [detailPage, setDetailPage] = useState(1);

  function handleSelectYield(id: string, rate: string) {
    setSelectedYield(id);
    if (rate) {
      setAnnualRate(rate);
    }
  }

  // Saldos reais atuais das contas
  const investAccount = data.accounts.find(a => a.kind === "INVESTMENT");
  const reserveAccount = data.accounts.find(a => a.kind === "RESERVE");
  const cashAccount = data.accounts.find(a => a.kind === "CASH");
  const initInvest = investAccount ? (accountBalance(investAccount, data.movements, today()) ?? "0") : "0";
  const initReserve = reserveAccount ? (accountBalance(reserveAccount, data.movements, today()) ?? "0") : "0";
  const initCash = cashAccount ? (accountBalance(cashAccount, data.movements, today()) ?? "0") : "0";

  // 3. Resolução dos valores efetivos mensais
  const effectiveSalary = salaryMode === "current" ? baseIncome : (Number(customSalary) || 0);

  const effectiveExpensesPct = proportionMode === "keep" ? defaultExpensesPct : customExpensesPct;
  const effectiveInvestmentPct = proportionMode === "keep" ? defaultInvestmentPct : customInvestmentPct;
  const effectiveReservePct = proportionMode === "keep" ? defaultReservePct : customReservePct;

  const projectedExpenses = Math.round((effectiveSalary * effectiveExpensesPct) / 100);
  const projectedInvestment = Math.round((effectiveSalary * effectiveInvestmentPct) / 100);
  const projectedReserve = Math.round((effectiveSalary * effectiveReservePct) / 100);

  // 4. Cálculo da Projeção Mês a Mês
  const targetEndMonth = `${targetYear}-12`;
  const totalMonths = Math.max(1, monthDistance(currentMonth, targetEndMonth) + 1);

  const projectionInput: ProjectionInput = useMemo(() => ({
    startMonth: currentMonth,
    months: totalMonths,
    salary: money(effectiveSalary),
    expenses: money(projectedExpenses),
    investment: money(projectedInvestment),
    reserve: money(projectedReserve),
    initialInvestment: initInvest,
    initialReserve: initReserve,
    initialCash: initCash,
    annualRate: annualRate || "0",
    reserveAnnualRate: "0",
    taxRate: "0",
    salaryGrowth: "0",
    expenseInflation: "0",
    annualContributionIncrease: "0",
    timing: "END",
    salaryDay: 31,
    salaryOffset: 0,
    events: [],
    extras: []
  }), [currentMonth, totalMonths, effectiveSalary, projectedExpenses, projectedInvestment, projectedReserve, initInvest, initReserve, initCash, annualRate]);

  const rows = useMemo(() => project(projectionInput), [projectionInput]);
  const finalRow = rows.at(-1);

  // Dados para o Gráfico
  const chartRows = useMemo(() => {
    return rows.map(r => ({
      label: monthLabel(r.month),
      net: Number(r.net),
      invested: Number(r.invested),
      reserve: Number(r.reserveBalance)
    }));
  }, [rows]);

  // Agrupamento por Ano
  const yearlySummary = useMemo(() => {
    const yearsMap = new Map<string, {
      year: string;
      incomeTotal: ReturnType<typeof d>;
      investedTotal: ReturnType<typeof d>;
      reserveTotal: ReturnType<typeof d>;
      endInvested: string;
      endReserve: string;
      endNet: string;
      gains: string;
    }>();

    for (const r of rows) {
      const y = r.month.slice(0, 4);
      if (!yearsMap.has(y)) {
        yearsMap.set(y, {
          year: y,
          incomeTotal: d(0),
          investedTotal: d(0),
          reserveTotal: d(0),
          endInvested: r.invested,
          endReserve: r.reserveBalance,
          endNet: r.net,
          gains: r.gains
        });
      }
      const item = yearsMap.get(y)!;
      item.incomeTotal = item.incomeTotal.plus(r.income);
      item.investedTotal = item.investedTotal.plus(r.investment);
      item.reserveTotal = item.reserveTotal.plus(r.reserve);
      item.endInvested = r.invested;
      item.endReserve = r.reserveBalance;
      item.endNet = r.net;
      item.gains = r.gains;
    }

    return Array.from(yearsMap.values());
  }, [rows]);

  // Paginação da tabela mensal detalhada
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(detailPage, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Botões de anos rápidos
  const quickYears = [
    String(currentYear + 1),
    String(currentYear + 2),
    String(currentYear + 3),
    String(currentYear + 5),
    String(currentYear + 10)
  ];

  // Meses de reserva cobertos no final
  const reserveMonthsCovered = projectedExpenses > 0 && finalRow
    ? (Number(finalRow.reserveBalance) / projectedExpenses).toFixed(1)
    : "—";

  return (
    <div className="stack-lg">
      {/* Cabeçalho da Projeção */}
      <div className="panel-heading flex-between">
        <div>
          <span className="eyebrow">PLANEJAMENTO ESTRATÉGICO</span>
          <h2>Projeção de Futuro</h2>
          <p>Simule a evolução do seu patrimônio definindo o ano alvo, seu salário e a distribuição da sua renda.</p>
        </div>
      </div>

      {/* Bloco 1: Seleção de Premissas */}
      <div className="projection-controls-panel">
        {/* Escolha do Ano Alvo */}
        <div className="projection-control-group">
          <label className="control-label">
            <Calendar size={16} />
            <span>Ano final da projeção:</span>
          </label>
          <div className="flex-row items-center gap-2 flex-wrap">
            {quickYears.map(yr => (
              <button
                key={yr}
                type="button"
                className={`quick-pill-btn ${targetYear === yr ? "active" : ""}`}
                onClick={() => setTargetYear(yr)}
              >
                {yr}
              </button>
            ))}
            <div className="custom-year-input">
              <span>Outro:</span>
              <input
                type="number"
                min={currentYear + 1}
                max={currentYear + 50}
                value={targetYear}
                onChange={e => e.target.value && setTargetYear(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="projection-settings-grid">
          {/* Card: Salário */}
          <div className="projection-setting-card">
            <span className="setting-title">
              <Coins size={16} /> Salário Mensal
            </span>
            <div className="segmented-toggle">
              <button
                type="button"
                className={salaryMode === "current" ? "active" : ""}
                onClick={() => setSalaryMode("current")}
              >
                Salário atual ({brl(baseIncome)})
              </button>
              <button
                type="button"
                className={salaryMode === "custom" ? "active" : ""}
                onClick={() => setSalaryMode("custom")}
              >
                Novo salário
              </button>
            </div>
            {salaryMode === "custom" && (
              <div className="mt-3">
                <label className="text-xs muted block mb-1">Informe o valor mensal previsto:</label>
                <MoneyInput value={customSalary} onChange={setCustomSalary} />
              </div>
            )}
          </div>

          {/* Card: Proporções */}
          <div className="projection-setting-card">
            <span className="setting-title">
              <Percent size={16} /> Distribuição da Renda
            </span>
            <div className="segmented-toggle">
              <button
                type="button"
                className={proportionMode === "keep" ? "active" : ""}
                onClick={() => setProportionMode("keep")}
              >
                Manter proporção atual
              </button>
              <button
                type="button"
                className={proportionMode === "custom" ? "active" : ""}
                onClick={() => setProportionMode("custom")}
              >
                Personalizar (%)
              </button>
            </div>

            {proportionMode === "keep" ? (
              <div className="proportions-badges mt-3">
                <span className="badge">Gastos: <strong>{defaultExpensesPct}%</strong></span>
                <span className="badge green">Investimentos: <strong>{defaultInvestmentPct}%</strong></span>
                <span className="badge blue">Reserva: <strong>{defaultReservePct}%</strong></span>
              </div>
            ) : (
              <div className="custom-sliders mt-3">
                <div className="slider-row">
                  <span>Gastos ({customExpensesPct}%)</span>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={customExpensesPct}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setCustomExpensesPct(val);
                      const remain = 100 - val;
                      setCustomInvestmentPct(Math.round(remain * 0.6));
                      setCustomReservePct(remain - Math.round(remain * 0.6));
                    }}
                  />
                </div>
                <div className="slider-row">
                  <span>Investimentos ({customInvestmentPct}%)</span>
                  <input
                    type="range"
                    min="0"
                    max={100 - customExpensesPct}
                    value={customInvestmentPct}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setCustomInvestmentPct(val);
                      setCustomReservePct(Math.max(0, 100 - customExpensesPct - val));
                    }}
                  />
                </div>
                <div className="slider-row">
                  <span>Reserva ({customReservePct}%)</span>
                  <input
                    type="range"
                    min="0"
                    max={100 - customExpensesPct}
                    value={customReservePct}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setCustomReservePct(val);
                      setCustomInvestmentPct(Math.max(0, 100 - customExpensesPct - val));
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card: Rentabilidade Estimada */}
          <div className="projection-setting-card">
            <span className="setting-title">
              <TrendingUp size={16} /> Rentabilidade Anual
            </span>
            <div className="yield-presets-list">
              {YIELD_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`yield-pill-btn ${selectedYield === p.id ? "active" : ""}`}
                  onClick={() => handleSelectYield(p.id, p.rate)}
                >
                  <span className="yield-pill-label">{p.label}</span>
                  <span className="yield-pill-rate">{p.badge}</span>
                </button>
              ))}
            </div>

            {selectedYield === "custom" && (
              <div className="flex-row items-center gap-2 mt-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={annualRate}
                  onChange={e => setAnnualRate(e.target.value)}
                  style={{ width: "90px" }}
                />
                <span className="text-sm font-semibold">% ao ano</span>
              </div>
            )}
            <span className="text-xs muted block mt-2">
              Taxa aplicada nos cálculos: <strong>{annualRate}% a.a.</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Bloco 2: Raio-X Comparativo Mensal */}
      <div className="panel compare-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RAIO-X DO MÊS</span>
            <h2>Comparativo de Fluxo Mensal</h2>
            <p>Veja como seu orçamento mensal se transforma com este cenário projetado.</p>
          </div>
        </div>

        <div className="monthly-comparison-grid">
          <div className="compare-card">
            <span className="compare-card-title">Salário Mensal</span>
            <div className="compare-values">
              <div>
                <span>Hoje</span>
                <strong>{brl(baseIncome)}</strong>
              </div>
              <ArrowRight size={18} className="text-muted" />
              <div>
                <span>Projeção</span>
                <strong className="text-accent">{brl(effectiveSalary)}</strong>
              </div>
            </div>
          </div>

          <div className="compare-card">
            <span className="compare-card-title">Despesas Mensais ({effectiveExpensesPct}%)</span>
            <div className="compare-values">
              <div>
                <span>Hoje</span>
                <strong>{brl(baseExpenses)}</strong>
              </div>
              <ArrowRight size={18} className="text-muted" />
              <div>
                <span>Projeção</span>
                <strong>{brl(projectedExpenses)}</strong>
              </div>
            </div>
          </div>

          <div className="compare-card">
            <span className="compare-card-title">Aporte em Investimentos ({effectiveInvestmentPct}%)</span>
            <div className="compare-values">
              <div>
                <span>Hoje</span>
                <strong>{brl(baseInvestment)}</strong>
              </div>
              <ArrowRight size={18} className="text-muted" />
              <div>
                <span>Projeção</span>
                <strong className="text-accent">{brl(projectedInvestment)}</strong>
              </div>
            </div>
          </div>

          <div className="compare-card">
            <span className="compare-card-title">Aporte na Reserva ({effectiveReservePct}%)</span>
            <div className="compare-values">
              <div>
                <span>Hoje</span>
                <strong>{brl(baseReserve)}</strong>
              </div>
              <ArrowRight size={18} className="text-muted" />
              <div>
                <span>Projeção</span>
                <strong className="text-accent">{brl(projectedReserve)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bloco 3: Resultados Acumulados no Ano Alvo */}
      <div className="stats-grid">
        <Stat
          label={`Patrimônio Total em dez/${targetYear}`}
          value={finalRow ? brl(finalRow.net) : "—"}
          detail={`Acumulado em ${totalMonths} meses projetados`}
          tone="accent"
        />
        <Stat
          label={`Investimentos em dez/${targetYear}`}
          value={finalRow ? brl(finalRow.invested) : "—"}
          detail="Carteira acumulada com aportes e juros"
        />
        <Stat
          label={`Reserva em dez/${targetYear}`}
          value={finalRow ? brl(finalRow.reserveBalance) : "—"}
          detail={`Cobre ${reserveMonthsCovered} meses de despesas`}
        />
        <Stat
          label="Juros Compostos Ganhos"
          value={finalRow ? brl(finalRow.gains) : "—"}
          detail={`Rendimentos sobre o capital aplicado (${annualRate}% a.a.)`}
        />
      </div>

      {/* Bloco 4: Visualização (Gráfico ou Tabelas) */}
      <section className="panel">
        <div className="panel-heading flex-between">
          <div>
            <h2>Trajetória de Evolução</h2>
            <p>Acompanhe o crescimento do seu capital até dezembro de {targetYear}.</p>
          </div>
          <div className="segmented-toggle">
            <button
              type="button"
              className={viewTab === "chart" ? "active" : ""}
              onClick={() => setViewTab("chart")}
            >
              <BarChart3 size={15} /> Gráfico
            </button>
            <button
              type="button"
              className={viewTab === "yearly" ? "active" : ""}
              onClick={() => setViewTab("yearly")}
            >
              <Layers size={15} /> Ano a Ano
            </button>
            <button
              type="button"
              className={viewTab === "monthly" ? "active" : ""}
              onClick={() => setViewTab("monthly")}
            >
              <TableIcon size={15} /> Mês a Mês
            </button>
          </div>
        </div>

        {viewTab === "chart" && (
          <div className="mt-4">
            <FinanceChart
              rows={chartRows}
              series={[
                { key: "net", name: "Patrimônio Total" },
                { key: "invested", name: "Investimentos" },
                { key: "reserve", name: "Reserva de Emergência" }
              ]}
            />
          </div>
        )}

        {viewTab === "yearly" && (
          <div className="table-wrap mt-4">
            <table>
              <thead>
                <tr>
                  <th>Ano</th>
                  <th>Receita Total no Ano</th>
                  <th>Total Investido no Ano</th>
                  <th>Total Aportado na Reserva</th>
                  <th>Investimentos ao Fim do Ano</th>
                  <th>Reserva ao Fim do Ano</th>
                  <th>Patrimônio Total</th>
                  <th>Rendimentos Ganhos</th>
                </tr>
              </thead>
              <tbody>
                {yearlySummary.map(y => (
                  <tr key={y.year}>
                    <td><strong>{y.year}</strong></td>
                    <td>{brl(y.incomeTotal.toString())}</td>
                    <td>{brl(y.investedTotal.toString())}</td>
                    <td>{brl(y.reserveTotal.toString())}</td>
                    <td>{brl(y.endInvested)}</td>
                    <td>{brl(y.endReserve)}</td>
                    <td><strong className="text-accent">{brl(y.endNet)}</strong></td>
                    <td>{brl(y.gains)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewTab === "monthly" && (
          <div className="mt-4">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Receita</th>
                    <th>Despesas</th>
                    <th>Investimento</th>
                    <th>Reserva</th>
                    <th>Investimentos Acumulados</th>
                    <th>Reserva Acumulada</th>
                    <th>Patrimônio Total</th>
                    <th>Juros Ganhos</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map(r => (
                    <tr key={r.month}>
                      <td>{monthLabel(r.month)}</td>
                      <td>{brl(r.income)}</td>
                      <td>{brl(r.expenses)}</td>
                      <td>{brl(r.investment)}</td>
                      <td>{brl(r.reserve)}</td>
                      <td>{brl(r.invested)}</td>
                      <td>{brl(r.reserveBalance)}</td>
                      <td><strong>{brl(r.net)}</strong></td>
                      <td>{brl(r.gains)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-pagination">
              <span>
                Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, rows.length)} de {rows.length} meses
              </span>
              <div className="toolbar">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setDetailPage(p => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="pagination-page">Página {currentPage} de {pageCount}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === pageCount}
                  onClick={() => setDetailPage(p => Math.min(pageCount, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
