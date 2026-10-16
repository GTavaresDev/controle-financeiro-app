"use client";

import { useState } from "react";
import { ArrowUpRight, TrendingUp, ShieldCheck, Wallet, Sparkles, AlertCircle, Plus, Upload, CheckCircle2 } from "lucide-react";
import type { AppData } from "@/domain/types";
import { accountBalance, budgetFor, cashFlow, d, money, monthDistance } from "@/domain/finance";
import { brl, monthLabel, today } from "@/lib/utils";
import { Button } from "./ui/button";
import { Stat, Empty } from "./shared";
import { Distribution } from "./charts";
import { Modal } from "./ui/dialog";
import { AccountsForm, ImportForm } from "./settings";
import { MovementForm } from "./budget";

export function Dashboard({ data, month, onNavigate }: { data: AppData; month: string; onNavigate: (tab: string) => void }) {
  const [importOpen, setImportOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);

  const cashAccount = data.accounts.find(a => a.kind === "CASH");
  const investAccount = data.accounts.find(a => a.kind === "INVESTMENT");
  const reserveAccount = data.accounts.find(a => a.kind === "RESERVE");

  const cashBal = cashAccount ? accountBalance(cashAccount, data.movements, today()) : null;
  const investBal = investAccount ? accountBalance(investAccount, data.movements, today()) : null;
  const reserveBal = reserveAccount ? accountBalance(reserveAccount, data.movements, today()) : null;

  const hasAnyAccount = cashBal !== null || investBal !== null || reserveBal !== null;
  const allAccountsConfirmed = cashBal !== null && investBal !== null && reserveBal !== null;

  const totalNet = hasAnyAccount
    ? money(d(cashBal ?? 0).plus(investBal ?? 0).plus(reserveBal ?? 0))
    : null;

  const activeItems = budgetFor(data.items, month);
  const flow = cashFlow(activeItems);

  // Essential expenses for emergency reserve calculation
  const essentialExpenses = activeItems
    .filter(i => i.kind === "EXPENSE" && i.essential === true)
    .reduce((acc, i) => acc.plus(i.amount), d(0));
  const totalExp = d(flow.expenses);
  const expBaseForReserve = essentialExpenses.gt(0) ? essentialExpenses : totalExp;
  const reserveMonthsCoverage = reserveBal !== null && expBaseForReserve.gt(0)
    ? d(reserveBal).div(expBaseForReserve).toFixed(1)
    : null;

  // Distribution chart data
  const distRows = [
    { name: "Despesas", value: Number(flow.expenses) },
    { name: "Investimentos", value: Number(flow.investment) },
    { name: "Reserva", value: Number(flow.reserve) },
    ...(d(flow.free).gt(0) ? [{ name: "Saldo livre", value: Number(flow.free) }] : []),
  ];

  // Goals summary
  const goal2026 = data.goals.find(g => g.name.includes("2026") || g.deadline.startsWith("2026")) ?? data.goals[0];
  const goalCurrent = goal2026 && investAccount ? accountBalance(investAccount, data.movements, today()) : null;
  const goalProgress = goal2026 && goalCurrent !== null && d(goal2026.target).gt(0)
    ? Math.min(100, Math.round(d(goalCurrent).div(goal2026.target).mul(100).toNumber()))
    : null;

  const recentMovements = data.movements.filter(m => !m.voidedAt).slice(0, 5);

  return (
    <div className="stack-lg">
      {!allAccountsConfirmed && (
        <aside className="notice warning flex-between">
          <div className="flex-row items-center gap-3">
            <AlertCircle size={20} className="text-warning-foreground" />
            <div>
              <strong>Saldos reais pendentes de confirmação</strong>
              <p>Os indicadores mostram &ldquo;Pendente de informação&rdquo; até você cadastrar os saldos reais de abertura das suas contas.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setAccountsOpen(true)}>
            Cadastrar saldos reais
          </Button>
        </aside>
      )}

      {flow.deficit && (
        <div className="notice danger">
          <strong>Atenção: Orçamento deficitário para {monthLabel(month)}!</strong>
          <p>O total de despesas e aportes supera a receita prevista em {brl(d(flow.free).abs().toString())}. Revise os gastos no Orçamento Mensal.</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid">
        <Stat
          label="Patrimônio Total Confirmado"
          value={brl(totalNet)}
          detail={totalNet !== null ? "Soma das contas com saldo informado" : "Cadastre o saldo das contas"}
          tone="accent"
          onClick={() => setAccountsOpen(true)}
        />
        <Stat
          label="Investimentos Reais"
          value={brl(investBal)}
          detail={investBal !== null ? "Na conta de investimentos" : "Pendente de informação"}
          onClick={() => setAccountsOpen(true)}
        />
        <Stat
          label="Reserva de Emergência"
          value={brl(reserveBal)}
          detail={reserveMonthsCoverage !== null ? `${reserveMonthsCoverage} meses de despesas` : "Pendente de informação"}
          onClick={() => setAccountsOpen(true)}
        />
        <Stat
          label="Conta Corrente"
          value={brl(cashBal)}
          detail={cashBal !== null ? "Saldo operacional disponível" : "Pendente de informação"}
          onClick={() => setAccountsOpen(true)}
        />
      </div>

      <div className="grid-2-cols">
        {/* Orçamento do Mês Atual */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">COMPETÊNCIA {monthLabel(month).toUpperCase()}</span>
              <h2>Fluxo de Caixa Mensal</h2>
              <p>Planejamento base vs. capacidade de poupança.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onNavigate("budget")}>
              Ver Orçamento Completo
            </Button>
          </div>

          <div className="stats-grid two">
            <Stat label="Receita Mensal" value={brl(flow.income)} detail="Salário + outras fontes" />
            <Stat label="Despesas Mensais" value={brl(flow.expenses)} detail={`${flow.expensePercent ?? "—"}% da renda`} />
            <Stat label="Capacidade após Despesas" value={brl(flow.capacity)} detail="Disponível para aportes" />
            <Stat label="Livre após Aportes" value={brl(flow.free)} tone={flow.deficit ? "negative" : "accent"} detail="Economia excedente" />
          </div>

          {activeItems.length > 0 ? (
            <div className="mt-2">
              <Distribution rows={distRows} />
            </div>
          ) : (
            <Empty
              title="Sem orçamento cadastrado para este mês"
              text="Importe a planilha original de projeção ou crie seus itens de receita e despesa."
            >
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <Upload size={14} /> Importar Excel
              </Button>
            </Empty>
          )}
        </section>

        {/* Metas & Atividades Rápidas */}
        <div className="stack">
          {/* Meta de Destaque */}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">METAS PATRIMONIAIS</span>
                <h2>{goal2026?.name ?? "Meta de 2026"}</h2>
                <p>Alvo: {goal2026 ? brl(goal2026.target) : "R$ 5.453,89"} até {goal2026 ? monthLabel(goal2026.deadline.slice(0, 7)) : "dez/2026"}.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onNavigate("goals")}>
                Detalhes
              </Button>
            </div>

            {goal2026 ? (
              <div className="stack">
                <div className="flex-between text-sm">
                  <span>Progresso do objetivo:</span>
                  <strong>{goalProgress !== null ? `${goalProgress}%` : "Aguardando saldo real"}</strong>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${goalProgress ?? 0}%` }} />
                </div>
                <div className="flex-between text-xs muted">
                  <span>Atual: {brl(goalCurrent)}</span>
                  <span>Meta: {brl(goal2026.target)}</span>
                </div>
                <p className="text-xs muted">
                  Aporte planejado de {brl(goal2026.contribution)}/mês na conta de investimentos.
                </p>
              </div>
            ) : (
              <Empty
                title="Nenhuma meta cadastrada"
                text="Defina metas com prazo e valor para acompanhar o seu progresso."
              />
            )}
          </section>

          {/* Atalhos e Movimentações Recentes */}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Movimentos Reais Recentes</h2>
                <p>Pagamentos, receitas recebidas e transferências realizadas.</p>
              </div>
              <Button size="sm" onClick={() => setMovementOpen(true)}>
                <Plus size={14} /> Registrar
              </Button>
            </div>

            {recentMovements.length === 0 ? (
              <p className="empty-inline">Nenhum movimento confirmado ainda. Registre receitas e despesas pagas à medida que acontecerem.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMovements.map(m => (
                      <tr key={m.id}>
                        <td>{m.date}</td>
                        <td>{m.name}</td>
                        <td><strong>{brl(m.amount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modais de Ação Rápida */}
      <Modal title="Saldos Reais de Abertura" open={accountsOpen} onClose={() => setAccountsOpen(false)}>
        <AccountsForm data={data} />
      </Modal>

      <Modal title="Importar Planilha Excel" open={importOpen} onClose={() => setImportOpen(false)}>
        <ImportForm onClose={() => setImportOpen(false)} />
      </Modal>

      <Modal title="Novo Movimento Real" open={movementOpen} onClose={() => setMovementOpen(false)}>
        <MovementForm data={data} month={month} onDone={() => setMovementOpen(false)} />
      </Modal>
    </div>
  );
}
