import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "./db";
import { defaultRules, type AppData, type BudgetItem, type Account, type Category, type Movement, type Goal, type Scenario } from "@/domain/types";
import { addMonths, budgetFor, d, project } from "@/domain/finance";
import { amountSchema, dateSchema, goalSchema, itemSchema, monthSchema, movementSchema, projectionSchema, rulesSchema, type Operation } from "@/domain/validation";

export const json = <T>(data: unknown): T => JSON.parse(JSON.stringify(data));

export async function initialize() {
  await query(`
    INSERT INTO "FinancialProfile" (id, name, rules)
    VALUES ('personal', 'Meu planejamento', '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);
  for (const [kind, name] of [["CASH", "Conta corrente"], ["INVESTMENT", "Investimentos"], ["RESERVE", "Reserva de emergência"]]) {
    await query(`
      INSERT INTO "Account" (id, name, kind)
      VALUES ($1, $2, $3)
      ON CONFLICT (kind) DO NOTHING
    `, [randomUUID(), name, kind]);
  }
}

export async function getData(): Promise<AppData> {
  await initialize();
  const [
    accountsRes,
    categoriesRes,
    itemsRes,
    overridesRes,
    movementsRes,
    goalsRes,
    scenariosRes,
    profileRes,
    importsRes,
  ] = await Promise.all([
    query<Account>(`SELECT id, name, kind, opening, "openingDate" FROM "Account" ORDER BY kind ASC`),
    query<Category>(`SELECT id, name FROM "Category" ORDER BY name ASC`),
    query<Omit<BudgetItem, "overrides">>(`SELECT id, name, kind, amount, "startMonth", "endMonth", recurring, "dueDay", fixed, essential, notes, "sourceKey", "categoryId" FROM "BudgetItem" ORDER BY name ASC`),
    query<{ itemId: string; month: string; amount: string | null; skipped: boolean }>(`SELECT "itemId", month, amount, skipped FROM "BudgetOverride"`),
    query<Omit<Movement, "voidedAt"> & { voidedAt: Date | string | null }>(`SELECT id, name, kind, amount, date, month, "originId", "destinationId", "itemId", "paymentKey", "voidedAt", "createdAt" FROM "Movement" ORDER BY date DESC, "createdAt" DESC`),
    query<Goal>(`SELECT id, name, description, kind, target, initial, "startDate", deadline, contribution, "accountId" FROM "FinancialGoal" ORDER BY deadline ASC`),
    query<{ id: string; name: string; parameters: Scenario["parameters"] }>(`SELECT id, name, parameters FROM "ProjectionScenario" ORDER BY "updatedAt" DESC`),
    query<{ id: string; name: string; birthDate: string | null; rules: unknown }>(`SELECT id, name, "birthDate", rules FROM "FinancialProfile" WHERE id = 'personal' LIMIT 1`),
    query<{ id: string; filename: string; createdAt: Date | string }>(`SELECT id, filename, "createdAt" FROM "ImportBatch" ORDER BY "createdAt" DESC`),
  ]);

  const overridesByItem = new Map<string, { month: string; amount: string | null; skipped: boolean }[]>();
  for (const row of overridesRes.rows) {
    const list = overridesByItem.get(row.itemId) ?? [];
    list.push({ month: row.month, amount: row.amount, skipped: row.skipped });
    overridesByItem.set(row.itemId, list);
  }

  const items: BudgetItem[] = itemsRes.rows.map(item => ({
    ...item,
    overrides: overridesByItem.get(item.id) ?? [],
  }));

  const movements: Movement[] = movementsRes.rows.map(m => ({
    ...m,
    voidedAt: m.voidedAt ? (m.voidedAt instanceof Date ? m.voidedAt.toISOString() : String(m.voidedAt)) : null,
  }));

  const imports = importsRes.rows.map(imp => ({
    id: imp.id,
    filename: imp.filename,
    createdAt: imp.createdAt instanceof Date ? imp.createdAt.toISOString() : String(imp.createdAt),
  }));

  const profile = profileRes.rows[0];
  const rules = { ...defaultRules, ...((profile?.rules as object) ?? {}) };

  return json({
    accounts: accountsRes.rows,
    categories: categoriesRes.rows,
    items,
    movements,
    goals: goalsRes.rows,
    scenarios: scenariosRes.rows,
    imports,
    birthDate: profile?.birthDate ?? null,
    rules,
  });
}

const idInput = z.object({ id: z.string().min(1) });

export async function mutate(operation: Operation, raw: unknown) {
  return transaction(async client => {
    let result: unknown = null;
    switch (operation) {
      case "item.save": {
        const { id, ...data } = itemSchema.parse(raw);
        if (id) {
          const oldRes = await client.query(`SELECT * FROM "BudgetItem" WHERE id = $1`, [id]);
          if (!oldRes.rowCount) throw Error("Item não encontrado.");
          const old = oldRes.rows[0];
          const changedAt = data.startMonth;
          if (changedAt < old.startMonth) throw Error("A alteração futura não pode começar antes do item original.");
          const paidRes = await client.query(`SELECT COUNT(*)::int as count FROM "Movement" WHERE "itemId" = $1 AND "voidedAt" IS NULL AND month >= $2`, [id, changedAt]);
          if (paidRes.rows[0].count > 0) throw Error("Existem pagamentos nesse período. Escolha um mês posterior ou estorne o pagamento para corrigir.");
          if (changedAt > old.startMonth && old.recurring) {
            await client.query(`UPDATE "BudgetItem" SET "endMonth" = $1, "sourceKey" = NULL WHERE id = $2`, [addMonths(changedAt, -1), id]);
            const newId = randomUUID();
            const insertRes = await client.query(`
              INSERT INTO "BudgetItem" (id, name, kind, amount, "startMonth", "endMonth", recurring, "dueDay", fixed, essential, notes, "sourceKey", "categoryId")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              RETURNING *
            `, [newId, data.name, data.kind, data.amount, data.startMonth, data.endMonth ?? null, data.recurring ?? true, data.dueDay ?? null, data.fixed ?? false, data.essential ?? null, data.notes ?? "", old.sourceKey ?? null, data.categoryId ?? null]);
            result = insertRes.rows[0];
          } else {
            const updateRes = await client.query(`
              UPDATE "BudgetItem"
              SET name = $1, kind = $2, amount = $3, "startMonth" = $4, "endMonth" = $5, recurring = $6, "dueDay" = $7, fixed = $8, essential = $9, notes = $10, "categoryId" = $11
              WHERE id = $12
              RETURNING *
            `, [data.name, data.kind, data.amount, data.startMonth, data.endMonth ?? null, data.recurring ?? true, data.dueDay ?? null, data.fixed ?? false, data.essential ?? null, data.notes ?? "", data.categoryId ?? null, id]);
            result = updateRes.rows[0];
          }
        } else {
          const newId = randomUUID();
          const insertRes = await client.query(`
            INSERT INTO "BudgetItem" (id, name, kind, amount, "startMonth", "endMonth", recurring, "dueDay", fixed, essential, notes, "sourceKey", "categoryId")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
          `, [newId, data.name, data.kind, data.amount, data.startMonth, data.endMonth ?? null, data.recurring ?? true, data.dueDay ?? null, data.fixed ?? false, data.essential ?? null, data.notes ?? "", null, data.categoryId ?? null]);
          result = insertRes.rows[0];
        }
        break;
      }
      case "item.override": {
        const v = z.object({ id: z.string(), month: monthSchema, amount: amountSchema, skipped: z.boolean() }).parse(raw);
        const paidRes = await client.query(`SELECT COUNT(*)::int as count FROM "Movement" WHERE "itemId" = $1 AND month = $2 AND "voidedAt" IS NULL`, [v.id, v.month]);
        if (paidRes.rows[0].count > 0) throw Error("Estorne o pagamento antes de alterar esta ocorrência.");
        await client.query(`
          INSERT INTO "BudgetOverride" (id, "itemId", month, amount, skipped)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ("itemId", month)
          DO UPDATE SET amount = EXCLUDED.amount, skipped = EXCLUDED.skipped
        `, [randomUUID(), v.id, v.month, v.amount, v.skipped]);
        break;
      }
      case "item.remove": {
        const v = z.object({ id: z.string(), month: monthSchema }).parse(raw);
        const paidRes = await client.query(`SELECT COUNT(*)::int as count FROM "Movement" WHERE "itemId" = $1 AND month >= $2 AND "voidedAt" IS NULL`, [v.id, v.month]);
        if (paidRes.rows[0].count > 0) throw Error("Existem pagamentos no período que seria removido.");
        await client.query(`UPDATE "BudgetItem" SET "endMonth" = $1 WHERE id = $2`, [addMonths(v.month, -1), v.id]);
        break;
      }
      case "budget.copy": {
        const { from, to } = z.object({ from: monthSchema, to: monthSchema }).refine(v => v.from !== v.to, "Selecione outro mês.").parse(raw);
        const [itemsRes, overridesRes] = await Promise.all([
          client.query(`SELECT * FROM "BudgetItem"`),
          client.query(`SELECT * FROM "BudgetOverride"`),
        ]);
        const overridesByItem = new Map<string, { month: string; amount: string | null; skipped: boolean }[]>();
        for (const row of overridesRes.rows) {
          const list = overridesByItem.get(row.itemId) ?? [];
          list.push({ month: row.month, amount: row.amount, skipped: row.skipped });
          overridesByItem.set(row.itemId, list);
        }
        const items: BudgetItem[] = itemsRes.rows.map(item => ({
          ...item,
          overrides: overridesByItem.get(item.id) ?? [],
        }));
        if (budgetFor(items, to).length) throw Error("O mês de destino já possui planejamento. Escolha um mês vazio para evitar duplicação.");
        for (const item of budgetFor(items, from)) {
          const newId = randomUUID();
          await client.query(`
            INSERT INTO "BudgetItem" (id, name, kind, amount, "startMonth", "endMonth", recurring, "dueDay", fixed, essential, notes, "sourceKey", "categoryId")
            VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, NULL, $11)
          `, [newId, item.name, item.kind, item.amount, to, to, item.dueDay ?? null, item.fixed ?? false, item.essential ?? null, item.notes ?? "", item.categoryId ?? null]);
        }
        break;
      }
      case "category.save": {
        const { id, name } = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80) }).parse(raw);
        if (id) {
          const res = await client.query(`UPDATE "Category" SET name = $1 WHERE id = $2 RETURNING *`, [name, id]);
          result = res.rows[0];
        } else {
          const res = await client.query(`INSERT INTO "Category" (id, name) VALUES ($1, $2) RETURNING *`, [randomUUID(), name]);
          result = res.rows[0];
        }
        break;
      }
      case "category.remove": {
        const { id, replacementId } = z.object({ id: z.string(), replacementId: z.string().nullable() }).parse(raw);
        if (replacementId === id) throw Error("Escolha outra categoria.");
        const countRes = await client.query(`SELECT COUNT(*)::int as count FROM "BudgetItem" WHERE "categoryId" = $1`, [id]);
        if (countRes.rows[0].count > 0 && !replacementId) throw Error("Reclassifique os itens antes de excluir a categoria.");
        if (replacementId) {
          await client.query(`UPDATE "BudgetItem" SET "categoryId" = $1 WHERE "categoryId" = $2`, [replacementId, id]);
        }
        await client.query(`DELETE FROM "Category" WHERE id = $1`, [id]);
        break;
      }
      case "account.opening": {
        const v = z.object({ id: z.string(), opening: amountSchema, openingDate: dateSchema }).parse(raw);
        const existingRes = await client.query(`SELECT * FROM "Account" WHERE id = $1`, [v.id]);
        if (!existingRes.rowCount) throw Error("Conta não encontrada.");
        const existing = existingRes.rows[0];
        const countRes = await client.query(`SELECT COUNT(*)::int as count FROM "Movement" WHERE ("originId" = $1 OR "destinationId" = $1) AND date < $2 AND "voidedAt" IS NULL`, [v.id, v.openingDate]);
        if (countRes.rows[0].count > 0) throw Error("A data de abertura não pode excluir movimentos existentes.");
        await client.query(`INSERT INTO "AuditEvent" (id, action, data, "createdAt") VALUES ($1, $2, $3::jsonb, NOW())`, [randomUUID(), "account.opening.previous", JSON.stringify(existing)]);
        await client.query(`UPDATE "Account" SET opening = $1, "openingDate" = $2 WHERE id = $3`, [v.opening, v.openingDate, v.id]);
        break;
      }
      case "movement.save": {
        const v = movementSchema.parse(raw);
        for (const id of [v.originId, v.destinationId].filter(Boolean) as string[]) {
          const accRes = await client.query(`SELECT * FROM "Account" WHERE id = $1`, [id]);
          if (!accRes.rowCount) throw Error("Conta não encontrada.");
          const account = accRes.rows[0];
          if (account.opening === null || !account.openingDate) throw Error("Informe o saldo de abertura das contas envolvidas antes de registrar movimentos.");
          if (v.date < account.openingDate) throw Error("O movimento não pode anteceder a abertura da conta.");
        }
        if (v.itemId) {
          const itemRes = await client.query(`SELECT * FROM "BudgetItem" WHERE id = $1`, [v.itemId]);
          if (!itemRes.rowCount) throw Error("Item não encontrado.");
          const overridesRes = await client.query(`SELECT * FROM "BudgetOverride" WHERE "itemId" = $1`, [v.itemId]);
          const item: BudgetItem = {
            ...itemRes.rows[0],
            overrides: overridesRes.rows,
          };
          if (!budgetFor([item], v.month).length) throw Error("O item não pertence ao mês informado.");
          const expected = item.kind === "INCOME" ? "INCOME" : item.kind === "EXPENSE" ? "EXPENSE" : "TRANSFER";
          if (v.kind !== expected) throw Error("Tipo de movimento incompatível com o planejamento.");
          if (expected === "TRANSFER") {
            const destRes = await client.query(`SELECT * FROM "Account" WHERE id = $1`, [v.destinationId!]);
            if (!destRes.rowCount) throw Error("Conta de destino não encontrada.");
            const dest = destRes.rows[0];
            if (dest.kind !== item.kind) throw Error("Destino incompatível com o aporte planejado.");
          }
        }
        const paymentKey = v.itemId ? `${v.itemId}:${v.month}` : null;
        const newId = randomUUID();
        const insertRes = await client.query(`
          INSERT INTO "Movement" (id, name, kind, amount, date, month, "originId", "destinationId", "itemId", "paymentKey", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          RETURNING *
        `, [newId, v.name, v.kind, v.amount, v.date, v.month, v.originId ?? null, v.destinationId ?? null, v.itemId ?? null, paymentKey]);
        result = insertRes.rows[0];
        break;
      }
      case "movement.void": {
        const { id } = idInput.parse(raw);
        await client.query(`UPDATE "Movement" SET "voidedAt" = NOW(), "paymentKey" = NULL WHERE id = $1`, [id]);
        break;
      }
      case "goal.save": {
        const { id, ...data } = goalSchema.parse(raw);
        if (id) {
          const res = await client.query(`
            UPDATE "FinancialGoal"
            SET name = $1, description = $2, kind = $3, target = $4, initial = $5, "startDate" = $6, deadline = $7, contribution = $8, "accountId" = $9
            WHERE id = $10
            RETURNING *
          `, [data.name, data.description ?? "", data.kind, data.target, data.initial ?? null, data.startDate, data.deadline, data.contribution, data.accountId ?? null, id]);
          result = res.rows[0];
        } else {
          const res = await client.query(`
            INSERT INTO "FinancialGoal" (id, name, description, kind, target, initial, "startDate", deadline, contribution, "accountId")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
          `, [randomUUID(), data.name, data.description ?? "", data.kind, data.target, data.initial ?? null, data.startDate, data.deadline, data.contribution, data.accountId ?? null]);
          result = res.rows[0];
        }
        break;
      }
      case "goal.remove": {
        const { id } = idInput.parse(raw);
        await client.query(`DELETE FROM "FinancialGoal" WHERE id = $1`, [id]);
        break;
      }
      case "scenario.save": {
        const { id, name, parameters } = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), parameters: projectionSchema }).parse(raw);
        if (project(parameters).some(r => d(r.expenses).lt(0) || d(r.investment).lt(0) || d(r.reserve).lt(0) || d(r.income).lt(0))) throw Error("Os eventos produzem valores negativos. Revise as alterações programadas.");
        if (id) {
          const res = await client.query(`
            UPDATE "ProjectionScenario"
            SET name = $1, parameters = $2::jsonb, "updatedAt" = NOW()
            WHERE id = $3
            RETURNING *
          `, [name, JSON.stringify(parameters), id]);
          result = res.rows[0];
        } else {
          const res = await client.query(`
            INSERT INTO "ProjectionScenario" (id, name, parameters, "updatedAt")
            VALUES ($1, $2, $3::jsonb, NOW())
            RETURNING *
          `, [randomUUID(), name, JSON.stringify(parameters)]);
          result = res.rows[0];
        }
        break;
      }
      case "scenario.remove": {
        const { id } = idInput.parse(raw);
        await client.query(`DELETE FROM "ProjectionScenario" WHERE id = $1`, [id]);
        break;
      }
      case "scenario.apply": {
        const { id, from, confirmation } = z.object({ id: z.string(), from: monthSchema, confirmation: z.literal(true) }).parse(raw); void confirmation;
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
        if (from <= today) throw Error("Aplique a partir de um mês futuro para preservar o período atual.");
        const scenRes = await client.query(`SELECT * FROM "ProjectionScenario" WHERE id = $1`, [id]);
        if (!scenRes.rowCount) throw Error("Cenário não encontrado.");
        const scenario = scenRes.rows[0];
        const parameters = projectionSchema.parse(scenario.parameters), rows = project(parameters).filter(r => r.month >= from);
        if (!rows.length) throw Error("O cenário não abrange o mês selecionado.");
        if (rows.some(r => !r.feasible)) throw Error("Resolva os déficits do cenário antes de aplicá-lo.");
        const to = rows.at(-1)!.month;
        const movRes = await client.query(`SELECT COUNT(*)::int as count FROM "Movement" WHERE month >= $1 AND month <= $2 AND "itemId" IS NOT NULL AND "voidedAt" IS NULL`, [from, to]);
        if (movRes.rows[0].count > 0) throw Error("Há movimentos realizados nesse período. O planejamento não foi alterado.");

        const [itemsRes, overridesRes] = await Promise.all([
          client.query(`SELECT * FROM "BudgetItem"`),
          client.query(`SELECT * FROM "BudgetOverride"`),
        ]);
        const overridesByItem = new Map<string, { month: string; amount: string | null; skipped: boolean }[]>();
        for (const row of overridesRes.rows) {
          const list = overridesByItem.get(row.itemId) ?? [];
          list.push({ month: row.month, amount: row.amount, skipped: row.skipped });
          overridesByItem.set(row.itemId, list);
        }
        const items: BudgetItem[] = itemsRes.rows.map(item => ({
          ...item,
          overrides: overridesByItem.get(item.id) ?? [],
        }));

        for (const row of rows) {
          const active = budgetFor(items, row.month);
          for (const item of active) {
            await client.query(`
              INSERT INTO "BudgetOverride" (id, "itemId", month, skipped)
              VALUES ($1, $2, $3, true)
              ON CONFLICT ("itemId", month)
              DO UPDATE SET skipped = true
            `, [randomUUID(), item.id, row.month]);
          }
          for (const [kind, amount, name] of [["INCOME", row.income, "Receitas"], ["EXPENSE", row.expenses, "Despesas"], ["INVESTMENT", row.investment, "Investimento"], ["RESERVE", row.reserve, "Reserva"]]) {
            await client.query(`
              INSERT INTO "BudgetItem" (id, name, kind, amount, "startMonth", "endMonth", recurring, "dueDay", notes)
              VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8)
            `, [randomUUID(), `${name} · ${scenario.name}`, kind, amount, row.month, row.month, kind === "INCOME" ? parameters.salaryDay : null, "Aplicado de cenário agregado. Revise categorias e essencialidade."]);
          }
        }
        break;
      }
      case "rules.save": {
        const rules = rulesSchema.parse(raw);
        await client.query(`UPDATE "FinancialProfile" SET rules = $1::jsonb WHERE id = 'personal'`, [JSON.stringify(rules)]);
        break;
      }
      case "profile.save": {
        const data = z.object({ birthDate: dateSchema.nullable() }).parse(raw);
        await client.query(`UPDATE "FinancialProfile" SET "birthDate" = $1 WHERE id = 'personal'`, [data.birthDate]);
        break;
      }
      default: throw Error("Operação desconhecida.");
    }
    await client.query(`INSERT INTO "AuditEvent" (id, action, data, "createdAt") VALUES ($1, $2, $3::jsonb, NOW())`, [randomUUID(), operation, JSON.stringify(raw)]);
    return json(result);
  });
}

export function readableError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map(i => i.message).join(" ");
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    if (code === "23505") return "Este registro já existe ou o item já foi pago nesse mês.";
    if (code === "40001") return "Outra alteração ocorreu ao mesmo tempo. Tente novamente.";
    if (code === "23503") return "O registro está em uso ou a referência não existe.";
    if (code === "P0002") return "Registro não encontrado. Atualize a página.";
    return "Não foi possível gravar os dados no banco.";
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
