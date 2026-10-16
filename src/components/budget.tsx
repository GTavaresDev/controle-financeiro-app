"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRightLeft, Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { AppData, BudgetItem, Movement } from "@/domain/types";
import { accountBalance, budgetFor, cashFlow, d, distributeSurplus, money } from "@/domain/finance";
import { itemSchema } from "@/domain/validation";
import { brl, today } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { Empty, Field, MoneyInput, Stat, Submit, useMutation } from "./shared";

const kindNames = { INCOME: "Receita", EXPENSE: "Despesa", INVESTMENT: "Investimento", RESERVE: "Reserva" };
export function ItemForm({ data, month, item, onDone }: { data: AppData; month: string; item?: BudgetItem; onDone: () => void }) {
  const m = useMutation();
  const form = useForm<z.infer<typeof itemSchema>>({ resolver: zodResolver(itemSchema), defaultValues: item ? { ...item, startMonth: month } : {
    name: "", kind: "EXPENSE", amount: "", startMonth: month, endMonth: null, recurring: true, dueDay: null, fixed: false, essential: null, categoryId: null, notes: "",
  } });
  return <form className="stack" onSubmit={form.handleSubmit(async values => { if (await m.run("item.save", values)) onDone(); })}><div className="form-grid">
    <Field label="Nome"><input {...form.register("name")} required placeholder="Ex.: Internet" /></Field><Field label="Tipo"><select {...form.register("kind")}>{Object.entries(kindNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="Valor previsto (R$)"><input type="number" min="0" step="0.01" {...form.register("amount")} required /></Field><Field label={item ? "Alterar a partir de" : "Mês inicial"}><input type="month" {...form.register("startMonth")} required /></Field>
    <Field label="Mês final (opcional)"><input type="month" {...form.register("endMonth", { setValueAs: v => v || null })} /></Field><Field label="Dia de vencimento / recebimento"><input type="number" min="1" max="31" {...form.register("dueDay", { setValueAs: v => v === "" ? null : Number(v) })} /></Field>
    <Field label="Categoria"><select {...form.register("categoryId", { setValueAs: v => v || null })}><option value="">Sem categoria</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <Field label="Essencialidade"><select {...form.register("essential", { setValueAs: v => v === "" ? null : v === "true" })} defaultValue={item?.essential === null || item?.essential === undefined ? "" : String(item.essential)}><option value="">Não classificada</option><option value="true">Essencial</option><option value="false">Não essencial</option></select></Field>
  </div><label className="check"><input type="checkbox" {...form.register("recurring")} />Repetir mensalmente</label><label className="check"><input type="checkbox" {...form.register("fixed")} />Despesa fixa</label><Field label="Observações"><textarea {...form.register("notes")} rows={2} /></Field>
    {item && <p className="notice">Esta alteração vale para o mês escolhido e os seguintes. Para mudar somente um valor mensal, use a edição na tabela.</p>}
    {Object.keys(form.formState.errors).length > 0 && <p className="notice danger" role="alert">{Object.values(form.formState.errors).map(e => e.message).join(" ")}</p>}{m.feedback}<Submit busy={m.busy} /></form>;
}
export function MovementForm({ data, month, item, onDone, suggested }: { data: AppData; month: string; item?: BudgetItem; onDone: () => void; suggested?: string }) {
  const m = useMutation(), cash = data.accounts.find(a => a.kind === "CASH")!;
  const [kind, setKind] = useState<Movement["kind"]>(item ? item.kind === "INCOME" ? "INCOME" : item.kind === "EXPENSE" ? "EXPENSE" : "TRANSFER" : "TRANSFER");
  return <form className="stack" onSubmit={async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (await m.run("movement.save", { name: f.get("name"), amount: f.get("amount"), date: f.get("date"), month: f.get("month"), kind,
      originId: kind === "INCOME" || kind === "YIELD" ? null : f.get("originId"), destinationId: kind === "EXPENSE" ? null : f.get("destinationId"), itemId: item?.id ?? null })) onDone();
  }}><p className="notice">Registre somente valores efetivamente recebidos, pagos ou transferidos. Os saldos das contas serão atualizados juntos.</p><div className="form-grid">
    <Field label="Descrição"><input name="name" defaultValue={item?.name ?? "Transferência entre contas"} required /></Field><Field label="Tipo de movimento"><select value={kind} disabled={!!item} onChange={e => setKind(e.target.value as Movement["kind"])}><option value="TRANSFER">Transferência / aporte</option><option value="INCOME">Receita recebida</option><option value="EXPENSE">Despesa paga</option><option value="YIELD">Rendimento creditado</option></select></Field>
    <Field label="Valor realizado"><MoneyInput name="amount" defaultValue={suggested ?? item?.amount ?? ""} /></Field><Field label="Data efetiva"><input name="date" type="date" defaultValue={today()} required /></Field><Field label="Mês de competência"><input name="month" type="month" defaultValue={month} required readOnly={!!item} /></Field>
    {(kind === "EXPENSE" || kind === "TRANSFER") && <Field label="Conta de origem"><select name="originId" defaultValue={cash.id}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
    {kind !== "EXPENSE" && <Field label="Conta de destino"><select name="destinationId" defaultValue={kind === "INCOME" ? cash.id : data.accounts.find(a => a.kind === (item?.kind === "RESERVE" ? "RESERVE" : "INVESTMENT"))?.id}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
  </div>{m.feedback}<Submit busy={m.busy} label="Confirmar movimento real" /></form>;
}
export function Budget({ data, month }: { data: AppData; month: string }) {
  const rows = budgetFor(data.items, month), flow = cashFlow(rows), m = useMutation();
  const [editing, setEditing] = useState<BudgetItem | "new" | null>(null), [payment, setPayment] = useState<BudgetItem | "new" | null>(null);
  const [inline, setInline] = useState<string | null>(null), [copy, setCopy] = useState(false), [remove, setRemove] = useState<BudgetItem | null>(null), [voidId, setVoidId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const movements = data.movements.filter(v => v.month === month);
  const reserve = data.accounts.find(a => a.kind === "RESERVE");
  const distribution = distributeSurplus(flow.free, reserve ? accountBalance(reserve, data.movements, today()) : null, rows, data.rules);
  return <div className="stack-lg"><div className="stats-grid"><Stat label="Receitas previstas" value={brl(flow.income)} detail="Todas as fontes de renda" /><Stat label="Despesas previstas" value={brl(flow.expenses)} detail={`${flow.expensePercent ?? "—"}% da renda`} /><Stat label="Aportes planejados" value={brl(d(flow.investment).plus(flow.reserve).toString())} detail="Investimentos + reserva" /><Stat label="Saldo disponível" value={brl(flow.free)} tone={flow.deficit ? "negative" : "accent"} detail="Após despesas e aportes" /></div>
    {flow.deficit && <p className="notice danger">Orçamento deficitário. Revise despesas ou aportes antes de comprometer novos valores.</p>}
    <section className="panel"><div className="panel-heading"><div><h2>Seu orçamento, item por item</h2><p>Planeje o mês e registre o que realmente aconteceu.</p></div><div className="toolbar"><Button variant="outline" size="sm" onClick={() => setCopy(true)}><Copy size={15} />Duplicar mês</Button><Button size="sm" onClick={() => setEditing("new")}><Plus size={16} />Novo item</Button></div></div>
      <div className="tabs">{[["ALL", "Todos"], ...Object.entries(kindNames)].map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={filter === key ? "active" : ""}>{label}</button>)}</div>
      {!rows.length ? <Empty title="Seu orçamento começa aqui" text="Importe sua planilha ou cadastre a primeira receita e despesa." /> : <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Categoria / tipo</th><th>Previsto</th><th>Realizado</th><th>% da renda</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{rows.filter(i => filter === "ALL" || i.kind === filter).map(item => {
        const paid = movements.find(v => v.itemId === item.id && !v.voidedAt), over = paid && d(paid.amount).gt(item.amount);
        return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.recurring ? "Mensal" : "Único"}{item.dueDay ? ` · dia ${item.dueDay}` : " · sem vencimento"}{item.essential === true ? " · essencial" : item.essential === false ? " · não essencial" : ""}</small></td><td>{data.categories.find(c => c.id === item.categoryId)?.name ?? kindNames[item.kind]}</td><td>{inline === item.id ? <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (await m.run("item.override", { id: item.id, month, amount: new FormData(e.currentTarget).get("amount"), skipped: false })) setInline(null); }}><MoneyInput name="amount" defaultValue={item.amount} aria-label={`Novo valor de ${item.name}`} /><Button size="icon" disabled={m.busy} aria-label="Confirmar valor"><Check size={14} /></Button></form> : <button className="editable" onClick={() => setInline(item.id)} aria-label={`Editar valor de ${item.name}`}>{brl(item.amount)}<Pencil size={12} /></button>}</td><td className={over ? "text-danger" : ""}>{paid ? brl(paid.amount) : "—"}</td><td>{d(flow.income).gt(0) ? `${d(item.amount).div(flow.income).mul(100).toFixed(1)}%` : "—"}</td><td><span className={`badge ${paid ? over ? "warning" : "green" : ""}`}>{paid ? over ? "Acima do previsto" : "Realizado" : "Planejado"}</span></td><td><div className="row-actions">{!paid && <Button size="sm" variant="outline" onClick={() => setPayment(item)}>Registrar</Button>}<button className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => setEditing(item)}><Pencil size={15} /></button><button className="icon-button" aria-label={`Remover ${item.name}`} onClick={() => setRemove(item)}><Trash2 size={15} /></button></div></td></tr>;
      })}</tbody></table></div>}{m.feedback}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Movimentos realizados</h2><p>Transferências preservam o patrimônio total. Estornos mantêm o histórico.</p></div><Button size="sm" variant="outline" onClick={() => setPayment("new")}><ArrowRightLeft size={16} />Novo movimento</Button></div>
      {data.rules.autoDistribution && d(flow.free).gt(0) && <p className="notice">{distribution ? `Distribuição sugerida da sobra planejada: ${brl(distribution.investment)} para investimentos e ${brl(distribution.reserve)} para a reserva. Registre as transferências quando realizadas.` : "Classifique as despesas essenciais e informe a reserva real para calcular a distribuição."}</p>}
      {!movements.length ? <p className="empty-inline">Nenhum movimento registrado neste mês.</p> : <div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Movimento</th><th>Valor</th><th>Ação</th></tr></thead><tbody>{movements.map(v => <tr key={v.id} className={v.voidedAt ? "voided" : ""}><td>{v.date.split("-").reverse().join("/")}</td><td>{v.name}<small>{data.accounts.find(a => a.id === v.originId)?.name ?? "Externo"} → {data.accounts.find(a => a.id === v.destinationId)?.name ?? "Externo"}</small></td><td>{v.kind === "TRANSFER" ? "Transferência" : v.kind === "YIELD" ? "Rendimento" : v.kind === "INCOME" ? "Receita" : "Despesa"}</td><td>{brl(v.amount)}</td><td>{v.voidedAt ? "Estornado" : <Button size="sm" variant="ghost" onClick={() => setVoidId(v.id)}>Estornar</Button>}</td></tr>)}</tbody></table></div>}
    </section>
    <Modal title={editing === "new" ? "Novo item do orçamento" : "Editar planejamento"} open={!!editing} onClose={() => setEditing(null)}>{editing && <ItemForm data={data} month={month} item={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}</Modal>
    <Modal title="Registrar movimento real" open={!!payment} onClose={() => setPayment(null)}>{payment && <MovementForm data={data} month={month} item={payment === "new" ? undefined : payment} onDone={() => setPayment(null)} />}</Modal>
    <Modal title="Duplicar orçamento" open={copy} onClose={() => setCopy(false)}><form className="stack" onSubmit={async e => { e.preventDefault(); if (await m.run("budget.copy", { from: month, to: new FormData(e.currentTarget).get("to") })) setCopy(false); }}><p>Copiar apenas o planejamento para um mês vazio. Itens recorrentes já existentes impedem duplicações. Nenhum pagamento será copiado.</p><Field label="Mês de destino"><input type="month" name="to" required /></Field>{m.feedback}<Submit busy={m.busy} label="Copiar planejamento" /></form></Modal>
    <Modal title="Remover planejamento" open={!!remove} onClose={() => setRemove(null)}><div className="stack"><p>Como deseja remover <strong>{remove?.name}</strong>?</p><Button variant="outline" disabled={m.busy} onClick={async () => { if (await m.run("item.override", { id: remove?.id, month, amount: money(remove?.amount ?? 0), skipped: true })) setRemove(null); }}>Somente neste mês</Button><Button variant="destructive" disabled={m.busy} onClick={async () => { if (await m.run("item.remove", { id: remove?.id, month })) setRemove(null); }}>Neste mês e nos seguintes</Button>{m.feedback}</div></Modal>
    <Modal title="Estornar movimento" open={!!voidId} onClose={() => setVoidId(null)}><div className="stack"><p>O movimento deixará de compor os saldos. O registro continuará no histórico. Para corrigir, registre um novo movimento após o estorno.</p><Button variant="destructive" disabled={m.busy} onClick={async () => { if (await m.run("movement.void", { id: voidId })) setVoidId(null); }}>Confirmar estorno</Button>{m.feedback}</div></Modal>
  </div>;
}
