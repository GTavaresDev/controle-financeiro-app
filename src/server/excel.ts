import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { initialize, json } from "./store";
import { d, money, sum, addMonths } from "@/domain/finance";
import { monthSchema } from "@/domain/validation";
import type { ProjectionInput } from "@/domain/types";

export interface ImportPreview {
  hash: string; filename: string; alreadyImported: boolean;
  income: string; investment: string; reserve: string; totalExpenses: string;
  expenses: { name: string; amount: string; cell: string }[];
  target: string; opening2026: string; opening2027: string; reserve2027: string;
  cells: { sheet: string; cell: string; value: string; formula: string | null }[];
  warnings: string[]; differences: { name: string; previous: string | null; next: string }[];
}
export async function parseWorkbook(bytes: Uint8Array, filename: string): Promise<ImportPreview> {
  if (bytes.byteLength > 5 * 1024 * 1024) throw Error("Use um arquivo de até 5 MB.");
  const zip = await JSZip.loadAsync(bytes);
  for (const [name, file] of Object.entries(zip.files)) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const content = await file.async("string");
      if (content.includes("<x:") || content.includes("xmlns:x=")) {
        zip.file(name, content.replace(/<x:/g, "<").replace(/<\/x:/g, "</").replace(/xmlns:x=/g, "xmlns="));
      }
    }
  }
  const cleanBuf = await zip.generateAsync({ type: "nodebuffer" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(cleanBuf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  for (const name of ["Dashboard", "Orçamento mensal", "Meta 2026", "Projeção 2027"]) if (!wb.getWorksheet(name)) throw Error(`Aba obrigatória ausente: ${name}.`);
  const numeric = (sheet: string, address: string) => {
    const cell = wb.getWorksheet(sheet)!.getCell(address), raw = cell.value;
    const value = raw && typeof raw === "object" && "formula" in raw ? raw.result : raw;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw Error(`Valor numérico ausente ou inválido em ${sheet}!${address}. Abra e recalcule o Excel antes de importar.`);
    return money(value);
  };
  const income = numeric("Orçamento mensal", "B5"), investment = numeric("Orçamento mensal", "B6"), reserve = numeric("Orçamento mensal", "B7");
  const expenses = Array.from({ length: 6 }, (_, i) => ({ name: wb.getWorksheet("Orçamento mensal")!.getCell(`A${i + 11}`).text.trim(), amount: numeric("Orçamento mensal", `B${i + 11}`), cell: `B${i + 11}` }));
  if (expenses.some(e => !e.name)) throw Error("Há uma despesa sem nome no intervalo A11:A16.");
  const cells: ImportPreview["cells"] = [];
  for (const sheet of wb.worksheets) sheet.eachRow(row => row.eachCell(cell => {
    const v = cell.value;
    const formula = (v && typeof v === "object" && "formula" in v && typeof v.formula === "string") ? v.formula : null;
    cells.push({ sheet: sheet.name, cell: cell.address, value: cell.text, formula });
  }));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const warnings = [
    "Os valores serão importados como planejamento. Nenhum pagamento ou saldo real será criado.",
    "Os saldos reais, vencimentos e essencialidade precisam ser informados na interface.",
    "A reserva inicial de 2027 é uma hipótese da planilha, não um saldo real confirmado.",
    "O saldo anterior a outubro será congelado no valor calculado do arquivo, evitando que alterações de aporte reescrevam o passado.",
    "A projeção original considera 12 salários, juros zero, sem reajustes e sem décimo terceiro.",
  ];
  const totalExpenses = money(sum(expenses.map(e => e.amount)));
  if (!d(numeric("Orçamento mensal", "B18")).eq(totalExpenses)) warnings.push("O total salvo no Excel diverge da soma das despesas. O aplicativo utilizará a soma dos valores de entrada.");
  return { hash, filename, alreadyImported: false, income, investment, reserve, expenses, totalExpenses,
    target: numeric("Meta 2026", "B5"), opening2026: numeric("Meta 2026", "B13"),
    opening2027: numeric("Projeção 2027", "B10"), reserve2027: numeric("Projeção 2027", "B11"), cells, warnings, differences: [] };
}
export function importItems(p: ImportPreview) {
  return [{ sourceKey: "excel:salary", name: "Salário", kind: "INCOME", amount: p.income },
    { sourceKey: "excel:investment", name: "Investimento mensal", kind: "INVESTMENT", amount: p.investment },
    { sourceKey: "excel:reserve", name: "Reserva de emergência", kind: "RESERVE", amount: p.reserve },
    ...p.expenses.map(e => ({ sourceKey: `excel:expense:${e.cell}`, name: e.name, kind: "EXPENSE", amount: e.amount }))];
}
export function originalScenario(p: ImportPreview, year: 2026 | 2027): ProjectionInput {
  return { startMonth: year === 2026 ? "2026-10" : "2027-01", months: year === 2026 ? 3 : 12,
    salary: p.income, expenses: p.totalExpenses, investment: p.investment, reserve: p.reserve,
    initialInvestment: year === 2026 ? p.opening2026 : p.opening2027, initialReserve: year === 2026 ? "0" : p.reserve2027,
    initialCash: "0", annualRate: "0", reserveAnnualRate: "0", taxRate: "0", salaryGrowth: "0", expenseInflation: "0",
    annualContributionIncrease: "0", timing: "END", salaryDay: 31, salaryOffset: 0, events: [], extras: [] };
}
export async function previewWorkbook(bytes: Uint8Array, filename: string) {
  const p = await parseWorkbook(bytes, filename);
  const [batch, items] = await Promise.all([db.importBatch.findUnique({ where: { hash: p.hash } }), db.budgetItem.findMany({ where: { sourceKey: { not: null } } })]);
  p.alreadyImported = !!batch;
  p.differences = importItems(p).map(item => ({ name: item.name, previous: items.find(i => i.sourceKey === item.sourceKey)?.amount.toFixed(2) ?? null, next: item.amount }));
  return p;
}
export async function commitWorkbook(bytes: Uint8Array, filename: string, startMonth: string) {
  monthSchema.parse(startMonth);
  const p = await parseWorkbook(bytes, filename);
  await initialize();
  return db.$transaction(async tx => {
    if (await tx.importBatch.findUnique({ where: { hash: p.hash } })) return { imported: false, message: "Este arquivo já foi importado. Nenhum registro foi duplicado." };
    for (const item of importItems(p)) {
      const current = await tx.budgetItem.findUnique({ where: { sourceKey: item.sourceKey } });
      const category = item.kind === "EXPENSE" ? await tx.category.upsert({ where: { name: item.name }, create: { name: item.name }, update: {} }) : null;
      const data = { ...item, startMonth, recurring: true, categoryId: category?.id ?? null };
      if (current) {
        if (startMonth < current.startMonth) throw Error("A reimportação deve começar no mesmo mês ou depois do planejamento existente.");
        if (await tx.movement.count({ where: { itemId: current.id, month: { gte: startMonth }, voidedAt: null } })) throw Error("Há pagamentos no período da reimportação. Escolha um mês posterior.");
        if (startMonth > current.startMonth) {
          await tx.budgetItem.update({ where: { id: current.id }, data: { endMonth: addMonths(startMonth, -1), sourceKey: null } });
          await tx.budgetItem.create({ data });
        } else await tx.budgetItem.update({ where: { id: current.id }, data });
      } else await tx.budgetItem.create({ data });
    }
    const investmentAccount = await tx.account.findUniqueOrThrow({ where: { kind: "INVESTMENT" } });
    const goal = { name: "Meta de investimento 2026", kind: "INVESTMENT", description: "Meta original da planilha. O saldo atual depende da conta de investimentos.", target: p.target, contribution: p.investment, startDate: "2026-10-01", deadline: "2026-12-31", accountId: investmentAccount.id };
    await tx.financialGoal.upsert({ where: { sourceKey: "excel:goal:2026" }, create: { ...goal, sourceKey: "excel:goal:2026" }, update: { target: p.target, contribution: p.investment } });
    for (const year of [2026, 2027] as const) {
      const parameters = json<Prisma.InputJsonValue>(originalScenario(p, year));
      await tx.projectionScenario.upsert({ where: { sourceKey: `excel:scenario:${year}` }, create: { sourceKey: `excel:scenario:${year}`, name: `Base Excel ${year}`, parameters }, update: { parameters } });
    }
    await tx.importBatch.create({ data: { hash: p.hash, filename: p.filename, data: json<Prisma.InputJsonValue>(p) } });
    await tx.auditEvent.create({ data: { action: "excel.import", data: { hash: p.hash, startMonth } } });
    return { imported: true, message: "Planejamento importado. Informe os saldos reais para completar seu painel." };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
