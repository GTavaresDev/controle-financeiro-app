import { z } from "zod";
import { d } from "./finance";

export const amountSchema = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Informe um valor positivo com até duas casas decimais.");
export const signedAmountSchema = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Valor monetário inválido.");
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(v => v >= "1900-01" && v <= "2199-12", "Ano entre 1900 e 2199.");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const date = new Date(v + "T00:00:00Z"); return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === v;
}, "Data inválida.");
const rate = z.string().refine(v => /^-?\d+(\.\d+)?$/.test(v) && d(v).gt(-100) && d(v).lte(1000), "Taxa inválida.");
const percentage = z.string().refine(v => /^\d+(\.\d+)?$/.test(v) && d(v).lte(100), "Percentual entre 0 e 100.");
export const itemSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(1).max(120),
  kind: z.enum(["INCOME", "EXPENSE", "INVESTMENT", "RESERVE"]), amount: amountSchema,
  startMonth: monthSchema, endMonth: monthSchema.nullable(), recurring: z.boolean(),
  dueDay: z.number().int().min(1).max(31).nullable(), fixed: z.boolean(), essential: z.boolean().nullable(),
  notes: z.string().max(1000), categoryId: z.string().nullable(),
}).refine(v => !v.endMonth || v.endMonth >= v.startMonth, "O fim deve ser posterior ao início.");
export const goalSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(1).max(120), description: z.string().max(2000),
  kind: z.enum(["INVESTMENT", "RESERVE", "CUSTOM"]), target: amountSchema,
  initial: amountSchema.nullable(), startDate: dateSchema, deadline: dateSchema,
  contribution: amountSchema, accountId: z.string().nullable(),
}).refine(v => v.deadline >= v.startDate, "O prazo deve ser posterior ao início.");
export const projectionSchema = z.object({
  startMonth: monthSchema, months: z.number().int().min(1).max(1200),
  salary: amountSchema, expenses: amountSchema, investment: amountSchema, reserve: amountSchema,
  initialInvestment: amountSchema, initialReserve: amountSchema, initialCash: amountSchema,
  annualRate: rate, reserveAnnualRate: rate, taxRate: percentage, salaryGrowth: rate,
  expenseInflation: rate, annualContributionIncrease: amountSchema, timing: z.enum(["START", "END"]),
  salaryDay: z.number().int().min(1).max(31), salaryOffset: z.number().int().min(0).max(1),
  events: z.array(z.object({ month: monthSchema, field: z.enum(["salary", "expenses", "investment", "reserve"]),
    amount: signedAmountSchema, mode: z.enum(["SET", "ADD"]), endMonth: monthSchema.optional(),
  }).refine(e => e.mode !== "SET" || d(e.amount).gte(0), "Valor de substituição não pode ser negativo.")
    .refine(e => !e.endMonth || e.endMonth >= e.month, "Fim anterior ao início.")).max(100),
  extras: z.array(z.object({ date: dateSchema, amount: amountSchema, name: z.string().max(120) })).max(300),
});
export const movementSchema = z.object({
  name: z.string().trim().min(1).max(120), kind: z.enum(["INCOME", "EXPENSE", "TRANSFER", "YIELD"]),
  amount: amountSchema.refine(v => d(v).gt(0), "O valor deve ser maior que zero."), date: dateSchema,
  month: monthSchema, originId: z.string().nullable(), destinationId: z.string().nullable(), itemId: z.string().nullable(),
}).superRefine((v, ctx) => {
  const valid = v.kind === "TRANSFER" ? v.originId && v.destinationId && v.originId !== v.destinationId
    : v.kind === "EXPENSE" ? v.originId && !v.destinationId : v.destinationId && !v.originId;
  if (!valid) ctx.addIssue({ code: "custom", message: "Selecione as contas de origem/destino corretamente." });
});
export const rulesSchema = z.object({
  minInvestmentPercent: percentage, maxExpensePercent: percentage,
  reserveMonths: z.number().int().min(0).max(120), prioritizeReserve: z.boolean(),
  savingsTarget: amountSchema, autoDistribution: z.boolean(), investmentShare: percentage,
});
export type Operation = "item.save" | "item.override" | "item.remove" | "budget.copy" | "category.save" | "category.remove" |
  "account.opening" | "movement.save" | "movement.void" | "goal.save" | "goal.remove" |
  "scenario.save" | "scenario.remove" | "scenario.apply" | "rules.save" | "profile.save";
