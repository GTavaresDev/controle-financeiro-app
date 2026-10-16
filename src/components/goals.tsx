"use client";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Target, CalendarDays, WalletCards, ArrowUpRight } from "lucide-react";
import type { AppData, Goal, ProjectionInput } from "@/domain/types";
import { accountBalance, addMonths, budgetFor, cashFlow, d, money, monthDistance, requiredContribution, reverseScenarios, solveGoal, sum } from "@/domain/finance";
import { brl, today, monthLabel } from "@/lib/utils";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { Empty, Field, MoneyInput, Submit, useMutation } from "./shared";

function GoalForm({ data, goal, onDone }: { data: AppData; goal?: Goal; onDone: () => void }) {
  const m = useMutation();
  return <form className="stack" onSubmit={async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (await m.run("goal.save", { id: goal?.id, name: f.get("name"), description: f.get("description"), kind: f.get("kind"), target: f.get("target"), initial: f.get("initial") || null, startDate: f.get("startDate"), deadline: f.get("deadline"), contribution: f.get("contribution"), accountId: f.get("accountId") || null })) onDone();
  }}><div className="form-grid"><Field label="Nome da meta"><input name="name" defaultValue={goal?.name} required /></Field><Field label="Tipo"><select name="kind" defaultValue={goal?.kind ?? "INVESTMENT"}><option value="INVESTMENT">Investimento</option><option value="RESERVE">Reserva</option><option value="CUSTOM">Objetivo personalizado</option></select></Field><Field label="Valor desejado"><MoneyInput name="target" defaultValue={goal?.target ?? ""} /></Field><Field label="Aporte mensal planejado"><MoneyInput name="contribution" defaultValue={goal?.contribution ?? "0"} /></Field><Field label="Data inicial"><input type="date" name="startDate" defaultValue={goal?.startDate ?? today()} required /></Field><Field label="Data limite"><input type="date" name="deadline" defaultValue={goal?.deadline} required /></Field><Field label="Saldo inicial na data de início (opcional)"><MoneyInput name="initial" defaultValue={goal?.initial ?? ""} required={false} /></Field><Field label="Conta que acompanha a meta"><select name="accountId" defaultValue={goal?.accountId ?? data.accounts.find(a => a.kind === "INVESTMENT")?.id}>{data.accounts.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></Field></div><Field label="Descrição"><textarea name="description" defaultValue={goal?.description} rows={2} /></Field><p className="muted">O valor atual vem da conta associada. Metas na mesma conta acompanham os mesmos recursos; não representam reservas de dinheiro separadas.</p>{m.feedback}<Submit busy={m.busy} /></form>;
}
function GoalSimulator({ data, goal, month }: { data: AppData; goal: Goal; month: string }) {
  const rows = budgetFor(data.items, month), flow = cashFlow(rows), account = data.accounts.find(a => a.id === goal.accountId);
  const current = account ? accountBalance(account, data.movements, today()) : null;
  const [target, setTarget] = useState(goal.target), [initial, setInitial] = useState(current ?? ""), [deadline, setDeadline] = useState(goal.deadline);
  const [rate, setRate] = useState("0"), [contribution, setContribution] = useState(goal.contribution), [useScheduled, setUseScheduled] = useState("");
  const startMonth = today().slice(0, 7), months = monthDistance(startMonth, deadline.slice(0, 7)) + 1;
  const valid = initial !== "" && target !== "" && rate !== "" && contribution !== "" && Number(rate) > -100 && Number(rate) <= 1000;
  const selected = data.scenarios.find(s => s.id === useScheduled);
  const params: ProjectionInput = { ...(selected?.parameters ?? {}), startMonth, months: Math.max(1, Math.min(1200, months)), salary: flow.income, expenses: flow.expenses, investment: contribution || "0", reserve: flow.reserve, initialInvestment: initial || "0", initialReserve: "0", initialCash: "0", annualRate: rate || "0", reserveAnnualRate: "0", taxRate: "0", salaryGrowth: selected?.parameters.salaryGrowth ?? "0", expenseInflation: selected?.parameters.expenseInflation ?? "0", annualContributionIncrease: selected?.parameters.annualContributionIncrease ?? "0", timing: "END", salaryDay: 31, salaryOffset: 0, events: selected?.parameters.events ?? [], extras: selected?.parameters.extras ?? [] };
  const results = useMemo(() => {
    if (!valid) return null;
    const solved = solveGoal(target, params);
    const required = deadline < today() && d(initial).lt(target) ? null : selected ? solved.contribution : requiredContribution(target, initial, months, rate);
    if (required === null) return { required: null, solved, alternatives: null, faster: null, reduced: null };
    const reducible = money(sum(rows.filter(i => i.kind === "EXPENSE" && i.essential === false).map(i => i.amount)));
    return { required, solved, alternatives: reverseScenarios(required, flow.income, flow.expenses, flow.reserve, reducible),
      faster: solveGoal(target, { ...params, investment: money(d(contribution).plus(100)) }).months,
      reduced: solveGoal(target, { ...params, investment: money(d(contribution).plus(d(reducible).mul("0.1"))) }).months };
  // Params are the complete serializable simulation inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, target, initial, deadline, rate, contribution, useScheduled, JSON.stringify(params), JSON.stringify(rows)]);
  const completion = (n: number | null) => n === null ? "Não alcançada em 100 anos" : n === 0 ? "Já alcançada" : monthLabel(addMonths(startMonth, n - 1));
  return <div className="stack"><p className="notice">Simulação independente. Valores digitados aqui não alteram suas contas ou orçamento. A meta considera saldo bruto, com aportes ao fim de cada mês, incluindo o mês atual se o prazo permitir.</p>
    <div className="form-grid"><Field label="Quanto quero acumular"><MoneyInput value={target} onChange={setTarget} /></Field><Field label="Quanto já tenho" hint={current === null ? "Saldo real pendente. Informe uma hipótese para simular." : "Saldo da conta associada; pode ser alterado apenas nesta simulação."}><MoneyInput value={initial} onChange={setInitial} /></Field><Field label="Até quando"><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field><Field label="Aporte mensal atual"><MoneyInput value={contribution} onChange={setContribution} /></Field><Field label="Rendimento anual hipotético (%)"><input type="number" min="-99" max="1000" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></Field><Field label="Usar eventos de um cenário"><select value={useScheduled} onChange={e => setUseScheduled(e.target.value)}><option value="">Sem eventos programados</option>{data.scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>
    {results?.required === null && <p className="notice danger">O prazo já terminou e o valor ainda não foi alcançado. Escolha uma nova data.</p>}
    {results?.required !== null && results?.alternatives && <><div className="sim-hero"><span>Aporte mensal necessário</span><strong>{brl(results.required)}</strong><p>{months} meses considerados · reserva mensal de {brl(flow.reserve)} preservada</p></div>
      <div className="scenario-grid"><article><span className="eyebrow">A · MANTER SALÁRIO</span><h3>{brl(results.alternatives.cut)} em cortes</h3><p>Capacidade atual para a meta: {brl(results.alternatives.available)}. Diferença a cobrir: {brl(results.alternatives.gap)}.</p><p>{results.alternatives.cutFeasible ? "A diferença cabe nas despesas classificadas como não essenciais." : "Cortes permitidos não bastam. É necessário aumentar a renda ou o prazo."}</p></article><article><span className="eyebrow">B · MANTER DESPESAS</span><h3>{brl(results.alternatives.minimumIncome)} de renda</h3><p>Despesas + reserva + aporte necessário. Renda adicional necessária: {brl(results.alternatives.extraIncome)}.</p></article><article><span className="eyebrow">C · EQUILIBRADO</span><h3>{brl(results.alternatives.balancedIncome)} a mais</h3><p>Com redução de {brl(results.alternatives.balancedCut)} nas despesas não essenciais. Metade da diferença é destinada a cortes, respeitando o limite disponível.</p></article><article><span className="eyebrow">D · ALTERAR PRAZO</span><h3>{completion(results.solved.months)}</h3><p>Com aporte mensal de {brl(contribution)} e rendimento anual de {rate}%. {d(contribution).gt(results.alternatives.available) ? "Atenção: esse aporte supera a capacidade do orçamento atual." : ""}</p></article></div>
      <div className="notice"><strong>Pequenas mudanças</strong><p>Mais R$ 100 por mês: {completion(results.faster)}. Reduzir 10% das despesas não essenciais e investir a diferença: {completion(results.reduced)}.</p></div>
      {selected && <p className="notice">Com eventos programados, o aporte foi calculado pelo simulador mensal. As alternativas de renda e corte mostram a capacidade do mês selecionado; confira os déficits futuros na Projeção Anual.</p>}
      <p className="muted">Despesas essenciais e não classificadas nunca entram nos cortes. Se o prazo cair antes do último dia do mês, o aporte desse mês não deve ser contado: ajuste a data ou o início dos aportes.</p>
    </>}
    {!valid && <p className="empty-inline">Preencha os valores para calcular os cenários.</p>}
  </div>;
}
export function Goals({ data, month }: { data: AppData; month: string }) {
  const [editing, setEditing] = useState<Goal | "new" | null>(null), [sim, setSim] = useState<Goal | null>(null), [remove, setRemove] = useState<string | null>(null);
  const [year, setYear] = useState("all"), m = useMutation();
  const visibleGoals = data.goals.filter(g => year === "all" || g.deadline.startsWith(year));
  const totalTarget = visibleGoals.reduce((total, goal) => total.plus(goal.target), d(0));
  const plannedMonthly = visibleGoals.reduce((total, goal) => total.plus(goal.contribution), d(0));

  return (
    <div className="stack-lg">
      <div className="goals-hero">
        <div>
          <span className="eyebrow">PLANEJAMENTO FINANCEIRO</span>
          <h2>Metas e objetivos</h2>
          <p>Transforme seus planos em marcos claros e acompanhe sua evolução mês a mês.</p>
        </div>
        <div className="flex-row items-center gap-3">
          <select aria-label="Ano das metas" value={year} onChange={e => setYear(e.target.value)}>
            <option value="all">Todos os anos</option>
            {[...new Set(data.goals.map(g => g.deadline.slice(0, 4)))].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> Nova meta
          </Button>
        </div>
      </div>

      <div className="goals-overview">
        <div className="goal-overview-card">
          <span className="goal-overview-icon"><Target size={22} /></span>
          <div>
            <strong>{visibleGoals.length}</strong>
            <span>Metas ativas</span>
          </div>
        </div>
        <div className="goal-overview-card">
          <span className="goal-overview-icon"><ArrowUpRight size={22} /></span>
          <div>
            <strong>{brl(totalTarget.toString())}</strong>
            <span>Valor total dos objetivos</span>
          </div>
        </div>
        <div className="goal-overview-card">
          <span className="goal-overview-icon"><WalletCards size={22} /></span>
          <div>
            <strong>{brl(plannedMonthly.toString())}</strong>
            <span>Aportes planejados / mês</span>
          </div>
        </div>
      </div>

      {!data.goals.length ? (
        <section className="panel">
          <Empty title="Qual é seu próximo objetivo?" text="Importe sua meta do Excel ou crie uma meta com valor e prazo." />
        </section>
      ) : !visibleGoals.length ? (
        <section className="panel">
          <Empty title="Nenhuma meta neste período" text="Escolha outro ano para visualizar suas metas." />
        </section>
      ) : (
        <div className="goals-grid">
          {visibleGoals.map(goal => {
            const account = data.accounts.find(a => a.id === goal.accountId),
              current = account ? accountBalance(account, data.movements, today()) : null;
            const progress = current !== null && d(goal.target).gt(0)
              ? d(current).div(goal.target).mul(100).toNumber()
              : current !== null ? 100 : null;
            const baseline = goal.initial ?? (account?.openingDate && account.openingDate <= goal.startDate ? accountBalance(account, data.movements, goal.startDate) : null);
            const expected = baseline === null ? null : d(baseline).plus(d(goal.contribution).mul(Math.max(0, monthDistance(goal.startDate.slice(0, 7), today().slice(0, 7)))));
            const status = current === null ? "Saldo pendente" : d(current).gte(goal.target) ? "Alcançada" : goal.deadline < today() ? "Atrasada" : expected === null ? "Sem base de comparação" : d(current).gt(expected) ? "Adiantada" : d(current).lt(expected) ? "Atrasada" : "Dentro do prazo";
            const percent = Math.max(0, Math.min(100, progress ?? 0));

            return (
              <article className="panel goal-card" key={goal.id}>
                <div className="goal-card-content">
                  <div className="goal-card-top">
                    <span className="goal-icon"><Target size={20} /></span>
                    <span className={`badge ${status === "Alcançada" ? "green" : ""}`}>{status}</span>
                  </div>

                  <div className="goal-title">
                    <div>
                      <h2>{goal.name}</h2>
                      <p>{goal.description || "Objetivo financeiro personalizado."}</p>
                    </div>
                  </div>

                  <div className="goal-amount">
                    <strong>{brl(current)}</strong>
                    <span>de {brl(goal.target)}</span>
                  </div>

                  <div className="progress-track" role="progressbar" aria-label={goal.name} aria-valuenow={progress ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${percent}%` }} />
                  </div>

                  <div className="goal-meta">
                    <span>{progress === null ? "Progresso pendente" : `${progress.toFixed(1)}% concluído`}</span>
                    <span><CalendarDays size={13} /> Até {goal.deadline.split("-").reverse().join("/")}</span>
                  </div>

                  <dl className="key-values">
                    <div>
                      <dt>Falta alcançar</dt>
                      <dd>{current === null ? "Pendente" : brl(money(d(goal.target).minus(current).clamp(0, Infinity)))}</dd>
                    </div>
                    <div>
                      <dt>Aporte mensal</dt>
                      <dd>{brl(goal.contribution)}</dd>
                    </div>
                    <div>
                      <dt>Conta associada</dt>
                      <dd>{account?.name ?? "Sem conta"}</dd>
                    </div>
                    <div>
                      <dt>Diferença para o plano</dt>
                      <dd className={expected !== null && current !== null && d(current).lt(expected) ? "text-danger" : ""}>
                        {current === null || expected === null ? "Pendente" : brl(money(d(current).minus(expected)))}
                      </dd>
                    </div>
                  </dl>

                  <div className="goal-actions">
                    <Button onClick={() => setSim(goal)} variant="outline">
                      Simular como alcançar
                    </Button>
                    <div className="toolbar">
                      <button className="icon-button" onClick={() => setEditing(goal)} aria-label={`Editar ${goal.name}`} title="Editar meta">
                        <Pencil size={16} />
                      </button>
                      <button className="icon-button" onClick={() => setRemove(goal.id)} aria-label={`Excluir ${goal.name}`} title="Excluir meta">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <aside className="goal-progress-panel">
                  <span className="eyebrow">PROGRESSO</span>
                  <div className="goal-ring" style={{ background: `conic-gradient(var(--accent) ${percent}%, var(--surface-raised) 0)` }}>
                    <span>{progress === null ? "—" : `${Math.round(percent)}%`}</span>
                  </div>
                  <strong>{progress === null ? "Saldo pendente" : `${Math.round(percent)}% concluído`}</strong>
                  <span>{brl(current)} de {brl(goal.target)}</span>
                </aside>
              </article>
            );
          })}
        </div>
      )}

      <Modal title={editing === "new" ? "Nova meta financeira" : "Editar meta"} open={!!editing} onClose={() => setEditing(null)}>
        {editing && <GoalForm data={data} goal={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal title={`Simulador · ${sim?.name ?? ""}`} description="Descubra o que precisa mudar para alcançar seu objetivo." open={!!sim} onClose={() => setSim(null)}>
        {sim && <GoalSimulator data={data} goal={sim} month={month} />}
      </Modal>
      <Modal title="Excluir meta" open={!!remove} onClose={() => setRemove(null)}>
        <div className="stack">
          <p>Excluir esta meta? Os recursos da conta associada serão preservados.</p>
          <Button variant="destructive" disabled={m.busy} onClick={async () => { if (await m.run("goal.remove", { id: remove })) setRemove(null); }}>
            Confirmar exclusão
          </Button>
          {m.feedback}
        </div>
      </Modal>
    </div>
  );
}
