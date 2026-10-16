import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { defaultRules, type AppData, type BudgetItem } from "@/domain/types";
import { addMonths, budgetFor, d, monthEnd, project } from "@/domain/finance";
import { amountSchema, dateSchema, goalSchema, itemSchema, monthSchema, movementSchema, projectionSchema, rulesSchema, type Operation } from "@/domain/validation";

export const json = <T>(data: unknown): T => JSON.parse(JSON.stringify(data));
export async function initialize() {
  await db.financialProfile.upsert({ where: { id: "personal" }, create: { id: "personal" }, update: {} });
  for (const [kind, name] of [["CASH", "Conta corrente"], ["INVESTMENT", "Investimentos"], ["RESERVE", "Reserva de emergência"]]) {
    await db.account.upsert({ where: { kind }, create: { kind, name }, update: {} });
  }
}
export async function getData(): Promise<AppData> {
  await initialize();
  const [accounts, categories, items, movements, goals, scenarios, profile, imports] = await Promise.all([
    db.account.findMany({ orderBy: { kind: "asc" } }), db.category.findMany({ orderBy: { name: "asc" } }),
    db.budgetItem.findMany({ include: { overrides: true }, orderBy: { name: "asc" } }),
    db.movement.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }), db.financialGoal.findMany({ orderBy: { deadline: "asc" } }),
    db.projectionScenario.findMany({ orderBy: { updatedAt: "desc" } }), db.financialProfile.findUniqueOrThrow({ where: { id: "personal" } }),
    db.importBatch.findMany({ select: { id: true, filename: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return json({ accounts, categories, items, movements, goals, scenarios, imports, birthDate: profile.birthDate, rules: { ...defaultRules, ...(profile.rules as object) } });
}
const idInput = z.object({ id: z.string().min(1) });
export async function mutate(operation: Operation, raw: unknown) {
  return db.$transaction(async tx => {
    let result: unknown = null;
    switch (operation) {
      case "item.save": {
        const { id, ...data } = itemSchema.parse(raw);
        if (id) {
          const old = await tx.budgetItem.findUniqueOrThrow({ where: { id } });
          const changedAt = data.startMonth;
          if (changedAt < old.startMonth) throw Error("A alteração futura não pode começar antes do item original.");
          const paid = await tx.movement.count({ where: { itemId: id, voidedAt: null, month: { gte: changedAt } } });
          if (paid) throw Error("Existem pagamentos nesse período. Escolha um mês posterior ou estorne o pagamento para corrigir.");
          if (changedAt > old.startMonth && old.recurring) {
            await tx.budgetItem.update({ where: { id }, data: { endMonth: addMonths(changedAt, -1), sourceKey: null } });
            result = await tx.budgetItem.create({ data: { ...data, sourceKey: old.sourceKey } });
          } else result = await tx.budgetItem.update({ where: { id }, data });
        } else result = await tx.budgetItem.create({ data });
        break;
      }
      case "item.override": {
        const v = z.object({ id: z.string(), month: monthSchema, amount: amountSchema, skipped: z.boolean() }).parse(raw);
        if (await tx.movement.count({ where: { itemId: v.id, month: v.month, voidedAt: null } })) throw Error("Estorne o pagamento antes de alterar esta ocorrência.");
        await tx.budgetOverride.upsert({ where: { itemId_month: { itemId: v.id, month: v.month } },
          create: { itemId: v.id, month: v.month, amount: v.amount, skipped: v.skipped }, update: { amount: v.amount, skipped: v.skipped } }); break;
      }
      case "item.remove": {
        const v = z.object({ id: z.string(), month: monthSchema }).parse(raw);
        if (await tx.movement.count({ where: { itemId: v.id, month: { gte: v.month }, voidedAt: null } })) throw Error("Existem pagamentos no período que seria removido.");
        await tx.budgetItem.update({ where: { id: v.id }, data: { endMonth: addMonths(v.month, -1) } }); break;
      }
      case "budget.copy": {
        const { from, to } = z.object({ from: monthSchema, to: monthSchema }).refine(v => v.from !== v.to, "Selecione outro mês.").parse(raw);
        const items = json<BudgetItem[]>(await tx.budgetItem.findMany({ include: { overrides: true } }));
        if (budgetFor(items, to).length) throw Error("O mês de destino já possui planejamento. Escolha um mês vazio para evitar duplicação.");
        for (const item of budgetFor(items, from)) {
          const { id: _id, overrides: _overrides, sourceKey: _sourceKey, ...data } = item;
          void _id; void _overrides; void _sourceKey;
          await tx.budgetItem.create({ data: { ...data, startMonth: to, endMonth: to, recurring: false } });
        } break;
      }
      case "category.save": {
        const { id, name } = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80) }).parse(raw);
        result = id ? await tx.category.update({ where: { id }, data: { name } }) : await tx.category.create({ data: { name } }); break;
      }
      case "category.remove": {
        const { id, replacementId } = z.object({ id: z.string(), replacementId: z.string().nullable() }).parse(raw);
        if (replacementId === id) throw Error("Escolha outra categoria.");
        const count = await tx.budgetItem.count({ where: { categoryId: id } });
        if (count && !replacementId) throw Error("Reclassifique os itens antes de excluir a categoria.");
        if (replacementId) await tx.budgetItem.updateMany({ where: { categoryId: id }, data: { categoryId: replacementId } });
        await tx.category.delete({ where: { id } }); break;
      }
      case "account.opening": {
        const v = z.object({ id: z.string(), opening: amountSchema, openingDate: dateSchema }).parse(raw);
        const existing = await tx.account.findUniqueOrThrow({ where: { id: v.id } });
        if (await tx.movement.count({ where: { OR: [{ originId: v.id }, { destinationId: v.id }], date: { lt: v.openingDate }, voidedAt: null } })) throw Error("A data de abertura não pode excluir movimentos existentes.");
        await tx.auditEvent.create({ data: { action: "account.opening.previous", data: json(existing) } });
        await tx.account.update({ where: { id: v.id }, data: { opening: v.opening, openingDate: v.openingDate } }); break;
      }
      case "movement.save": {
        const v = movementSchema.parse(raw);
        for (const id of [v.originId, v.destinationId].filter(Boolean) as string[]) {
          const account = await tx.account.findUniqueOrThrow({ where: { id } });
          if (account.opening === null || !account.openingDate) throw Error("Informe o saldo de abertura das contas envolvidas antes de registrar movimentos.");
          if (v.date < account.openingDate) throw Error("O movimento não pode anteceder a abertura da conta.");
        }
        if (v.itemId) {
          const item = await tx.budgetItem.findUniqueOrThrow({ where: { id: v.itemId }, include: { overrides: true } });
          if (!budgetFor(json([item]), v.month).length) throw Error("O item não pertence ao mês informado.");
          const expected = item.kind === "INCOME" ? "INCOME" : item.kind === "EXPENSE" ? "EXPENSE" : "TRANSFER";
          if (v.kind !== expected) throw Error("Tipo de movimento incompatível com o planejamento.");
          if (expected === "TRANSFER") {
            const dest = await tx.account.findUniqueOrThrow({ where: { id: v.destinationId! } });
            if (dest.kind !== item.kind) throw Error("Destino incompatível com o aporte planejado.");
          }
        }
        result = await tx.movement.create({ data: { ...v, paymentKey: v.itemId ? `${v.itemId}:${v.month}` : null } }); break;
      }
      case "movement.void": {
        const { id } = idInput.parse(raw);
        await tx.movement.update({ where: { id }, data: { voidedAt: new Date(), paymentKey: null } }); break;
      }
      case "goal.save": {
        const { id, ...data } = goalSchema.parse(raw);
        result = id ? await tx.financialGoal.update({ where: { id }, data }) : await tx.financialGoal.create({ data }); break;
      }
      case "goal.remove": await tx.financialGoal.delete({ where: idInput.parse(raw) }); break;
      case "scenario.save": {
        const { id, name, parameters } = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), parameters: projectionSchema }).parse(raw);
        if (project(parameters).some(r => d(r.expenses).lt(0) || d(r.investment).lt(0) || d(r.reserve).lt(0) || d(r.income).lt(0))) throw Error("Os eventos produzem valores negativos. Revise as alterações programadas.");
        const data = { name, parameters: json<Prisma.InputJsonValue>(parameters) };
        result = id ? await tx.projectionScenario.update({ where: { id }, data }) : await tx.projectionScenario.create({ data }); break;
      }
      case "scenario.remove": await tx.projectionScenario.delete({ where: idInput.parse(raw) }); break;
      case "scenario.apply": {
        const { id, from, confirmation } = z.object({ id: z.string(), from: monthSchema, confirmation: z.literal(true) }).parse(raw); void confirmation;
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
        if (from <= today) throw Error("Aplique a partir de um mês futuro para preservar o período atual.");
        const scenario = await tx.projectionScenario.findUniqueOrThrow({ where: { id } });
        const parameters = projectionSchema.parse(scenario.parameters), rows = project(parameters).filter(r => r.month >= from);
        if (!rows.length) throw Error("O cenário não abrange o mês selecionado.");
        if (rows.some(r => !r.feasible)) throw Error("Resolva os déficits do cenário antes de aplicá-lo.");
        const items = await tx.budgetItem.findMany({ include: { overrides: true } });
        const to = rows.at(-1)!.month;
        if (await tx.movement.count({ where: { month: { gte: from, lte: to }, itemId: { not: null }, voidedAt: null } })) throw Error("Há movimentos realizados nesse período. O planejamento não foi alterado.");
        for (const row of rows) {
          const active = budgetFor(json<BudgetItem[]>(items), row.month);
          for (const item of active) await tx.budgetOverride.upsert({ where: { itemId_month: { itemId: item.id, month: row.month } }, create: { itemId: item.id, month: row.month, skipped: true }, update: { skipped: true } });
          for (const [kind, amount, name] of [["INCOME", row.income, "Receitas"], ["EXPENSE", row.expenses, "Despesas"], ["INVESTMENT", row.investment, "Investimento"], ["RESERVE", row.reserve, "Reserva"]]) {
            await tx.budgetItem.create({ data: { name: `${name} · ${scenario.name}`, kind, amount, startMonth: row.month, endMonth: row.month, recurring: false, dueDay: kind === "INCOME" ? parameters.salaryDay : null, notes: "Aplicado de cenário agregado. Revise categorias e essencialidade." } });
          }
        } break;
      }
      case "rules.save": await tx.financialProfile.update({ where: { id: "personal" }, data: { rules: rulesSchema.parse(raw) } }); break;
      case "profile.save": {
        const data = z.object({ birthDate: dateSchema.nullable() }).parse(raw);
        await tx.financialProfile.update({ where: { id: "personal" }, data }); break;
      }
      default: throw Error("Operação desconhecida.");
    }
    await tx.auditEvent.create({ data: { action: operation, data: json<Prisma.InputJsonValue>(raw) } });
    return json(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
export function readableError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map(i => i.message).join(" ");
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "Este registro já existe ou o item já foi pago nesse mês.";
    if (error.code === "P2034") return "Outra alteração ocorreu ao mesmo tempo. Tente novamente.";
    if (error.code === "P2003") return "O registro está em uso ou a referência não existe.";
    if (error.code === "P2025") return "Registro não encontrado. Atualize a página.";
    return "Não foi possível gravar os dados no banco.";
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
