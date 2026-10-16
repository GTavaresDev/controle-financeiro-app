"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, CheckCircle2, WalletCards, TrendingUp, ShieldCheck } from "lucide-react";
import type { AppData } from "@/domain/types";
import type { ImportPreview } from "@/server/excel";
import { brl, today } from "@/lib/utils";
import { Button } from "./ui/button";
import { Field, MoneyInput, Submit, useMutation } from "./shared";
import { Modal } from "./ui/dialog";

export function ImportForm({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<ImportPreview | null>(null);
  const [month, setMonth] = useState(today().slice(0, 7)), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  async function send(commit: boolean) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("file", file); body.set("commit", String(commit)); body.set("startMonth", month);
      const response = await fetch("/api/import", { method: "POST", body }); const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (commit) { router.refresh(); onClose(); } else setPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na importação."); }
    finally { setBusy(false); }
  }
  return <div className="stack"><label className="upload-area"><FileSpreadsheet size={34} /><strong>Importe seu planejamento</strong><span>Excel com Dashboard, Orçamento mensal, Meta 2026 e Projeção 2027. Até 5 MB.</span><input aria-label="Arquivo Excel" type="file" accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} /></label>
    {error && <p className="notice danger" role="alert">{error}</p>}
    {!preview ? <Button disabled={!file || busy} onClick={() => send(false)}><Upload size={16} />{busy ? "Lendo arquivo…" : "Analisar arquivo"}</Button> : <>
      <div className="notice">{preview.alreadyImported ? "Este arquivo já foi importado; confirmar novamente não criará duplicações." : "Prévia pronta. Revise os valores antes de confirmar."}</div>
      <div className="table-wrap"><table><thead><tr><th>Planejamento</th><th>Valor atual</th><th>Valor do Excel</th></tr></thead><tbody>{preview.differences.map((row, i) => <tr key={i}><td>{row.name}</td><td>{row.previous === null ? "Novo registro" : brl(row.previous)}</td><td>{brl(row.next)}</td></tr>)}</tbody></table></div>
      <p>Meta 2026: <strong>{brl(preview.target)}</strong> · despesas: <strong>{brl(preview.totalExpenses)}</strong>.</p>
      <Field label="Primeiro mês do planejamento" hint="Na reimportação, os meses anteriores serão preservados."><input type="month" value={month} onChange={e => setMonth(e.target.value)} required /></Field>
      <ul className="notes-list">{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul>
      <details><summary>Fórmulas e origem dos dados</summary><div className="table-wrap"><table><thead><tr><th>Célula</th><th>Valor</th><th>Fórmula original</th></tr></thead><tbody>{preview.cells.filter(c => c.formula).map(c => <tr key={`${c.sheet}:${c.cell}`}><td>{c.sheet}!{c.cell}</td><td>{c.value}</td><td><code>{c.formula}</code></td></tr>)}</tbody></table></div></details>
      <Button disabled={busy || !month} onClick={() => send(true)}><CheckCircle2 size={16} />{busy ? "Importando…" : "Confirmar importação"}</Button>
    </>}
  </div>;
}
export function AccountsForm({ data }: { data: AppData }) {
  const mutation = useMutation();
  const icons = { CASH: WalletCards, INVESTMENT: TrendingUp, RESERVE: ShieldCheck };
  return <div className="accounts-settings"><div className="accounts-intro"><div><span className="eyebrow">PATRIMÔNIO ATUAL</span><p>Informe o saldo real de cada conta e a data a partir da qual os movimentos serão contabilizados.</p></div><span className="accounts-tip">Os valores projetados não substituem os saldos reais.</span></div><div className="account-grid">{data.accounts.map(account => {
    const Icon = icons[account.kind];
    return <form key={account.id} className="account-form" onSubmit={async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget); await mutation.run("account.opening", { id: account.id, opening: f.get("opening"), openingDate: f.get("openingDate") });
    }}><div className="account-form-heading"><span className="account-icon"><Icon size={18} /></span><div><h3>{account.name}</h3><span>{account.opening === null ? "Saldo ainda não informado" : "Saldo confirmado"}</span></div></div><div className="account-fields"><Field label="Saldo de abertura"><MoneyInput name="opening" defaultValue={account.opening ?? ""} /></Field><Field label="Data de referência"><input type="date" name="openingDate" required defaultValue={account.openingDate ?? today()} /></Field></div><Submit busy={mutation.busy} label="Salvar saldo" /></form>;
  })}</div>{mutation.feedback}</div>;
}
export function RulesForm({ data }: { data: AppData }) {
  const m = useMutation(), r = data.rules;
  return <form className="stack" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void m.run("rules.save", {
    minInvestmentPercent: f.get("minInvestmentPercent"), maxExpensePercent: f.get("maxExpensePercent"), reserveMonths: Number(f.get("reserveMonths")),
    prioritizeReserve: f.has("prioritizeReserve"), savingsTarget: f.get("savingsTarget"), autoDistribution: f.has("autoDistribution"), investmentShare: f.get("investmentShare"),
  }); }}><div className="form-grid"><Field label="Investimento mínimo (% da renda)"><MoneyInput name="minInvestmentPercent" max="100" defaultValue={r.minInvestmentPercent} /></Field><Field label="Limite de despesas (% da renda)"><MoneyInput name="maxExpensePercent" max="100" defaultValue={r.maxExpensePercent} /></Field><Field label="Meses de reserva desejados"><input type="number" min="0" max="120" name="reserveMonths" defaultValue={r.reserveMonths} required /></Field><Field label="Meta de economia mensal"><MoneyInput name="savingsTarget" defaultValue={r.savingsTarget} /></Field><Field label="Investimento na distribuição (%)"><MoneyInput name="investmentShare" max="100" defaultValue={r.investmentShare} /></Field></div>
    <label className="check"><input type="checkbox" name="prioritizeReserve" defaultChecked={r.prioritizeReserve} />Priorizar a reserva até atingir o objetivo</label><label className="check"><input type="checkbox" name="autoDistribution" defaultChecked={r.autoDistribution} />Calcular distribuição automática da sobra ao transferir</label><p className="muted">A distribuição calcula uma sugestão. Transferências reais só serão registradas quando você confirmar.</p>{m.feedback}<Submit busy={m.busy} /></form>;
}
export function Categories({ data }: { data: AppData }) {
  const m = useMutation(), [remove, setRemove] = useState<string | null>(null), [replacement, setReplacement] = useState("");
  return <div className="stack"><form className="inline-form" onSubmit={async e => { e.preventDefault(); const f = e.currentTarget; if (await m.run("category.save", { name: new FormData(f).get("name") })) f.reset(); }}><input name="name" aria-label="Nova categoria" placeholder="Nome da categoria" required /><Submit busy={m.busy} label="Adicionar" /></form>
    {data.categories.map(c => <form className="inline-form" key={c.id} onSubmit={e => { e.preventDefault(); void m.run("category.save", { id: c.id, name: new FormData(e.currentTarget).get("name") }); }}><input name="name" defaultValue={c.name} aria-label={`Nome de ${c.name}`} required /><Button size="sm" variant="outline" disabled={m.busy}>Salvar</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRemove(c.id)}>Excluir</Button></form>)}{m.feedback}
    <Modal title="Excluir categoria" open={!!remove} onClose={() => setRemove(null)}><div className="stack"><Field label="Reclassificar itens em"><select value={replacement} onChange={e => setReplacement(e.target.value)}><option value="">Sem substituição (apenas se não utilizada)</option>{data.categories.filter(c => c.id !== remove).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Button variant="destructive" disabled={m.busy} onClick={async () => { if (await m.run("category.remove", { id: remove, replacementId: replacement || null })) setRemove(null); }}>Confirmar exclusão</Button>{m.feedback}</div></Modal>
  </div>;
}
