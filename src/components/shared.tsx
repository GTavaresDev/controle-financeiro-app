"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { perform } from "@/app/actions";
import type { Operation } from "@/domain/validation";
import { Button } from "./ui/button";

export function useMutation() {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function run(operation: Operation, payload: unknown) {
    setBusy(true); setError(""); setMessage("");
    try { const result = await perform(operation, payload); if (!result.ok) { setError(result.error ?? "Falha ao salvar."); return false; } setMessage("Alterações salvas."); router.refresh(); return true; }
    catch { setError("Não foi possível conectar. Tente novamente."); return false; }
    finally { setBusy(false); }
  }
  return { run, busy, error, message, clear: () => { setError(""); setMessage(""); }, feedback: <div aria-live="polite">{error && <p role="alert" className="notice danger">{error}</p>}{message && <p className="notice success">{message}</p>}</div> };
}
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function MoneyInput({ name, value, onChange, required = true, ...props }: { name?: string; value?: string; onChange?: (value: string) => void; required?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return <input name={name} type="number" min="0" step="0.01" required={required} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined} {...props} />;
}
export function Submit({ busy, label = "Salvar alterações" }: { busy: boolean; label?: string }) { return <Button disabled={busy} type="submit">{busy ? "Salvando…" : label}</Button>; }
export function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) { return <div className="empty"><div className="empty-symbol">↗</div><h3>{title}</h3><p>{text}</p>{children}</div>; }
export function Stat({ label, value, detail, tone, onClick }: { label: string; value: string; detail?: string; tone?: string; onClick?: () => void }) {
  const content = <><span className="stat-label">{label}</span><strong className={value === "Pendente de informação" ? "pending-value" : ""}>{value}</strong>{detail && <span className="stat-detail">{detail}</span>}</>;
  return onClick ? <button className={`stat ${tone ?? ""}`} onClick={onClick}>{content}</button> : <div className={`stat ${tone ?? ""}`}>{content}</div>;
}
