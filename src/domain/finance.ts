import Decimal from "decimal.js";
import type { Account, BudgetItem, FinancialRules, Movement, ProjectionInput, ProjectionRow } from "./types";

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export const d = (v: Decimal.Value = 0) => new Decimal(v);
export const money = (v: Decimal.Value) => d(v).toFixed(2);
export const sum = (values: Decimal.Value[]) => values.reduce<Decimal>((a, v) => a.plus(v), d(0));
export const percent = (value: Decimal.Value, total: Decimal.Value) => d(total).isZero() ? null : d(value).div(total).mul(100).toFixed(2);
export function addMonths(month: string, count: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function dateInMonth(month: string, day: number) {
  return `${month}-${String(Math.min(day, Number(monthEnd(month).slice(-2)))).padStart(2, "0")}`;
}
export function monthDistance(start: string, end: string) {
  const [a, b] = start.split("-").map(Number), [c, e] = end.split("-").map(Number);
  return (c - a) * 12 + e - b;
}
export function budgetFor(items: BudgetItem[], month: string) {
  return items.flatMap(item => {
    if (month < item.startMonth || (item.endMonth && month > item.endMonth) || (!item.recurring && month !== item.startMonth)) return [];
    const override = item.overrides.find(o => o.month === month);
    return override?.skipped ? [] : [{ ...item, amount: override?.amount ?? item.amount }];
  });
}
export function cashFlow(items: Pick<BudgetItem, "amount" | "kind">[]) {
  const total = (kind: string) => sum(items.filter(i => i.kind === kind).map(i => i.amount));
  const income = total("INCOME"), expenses = total("EXPENSE"), investment = total("INVESTMENT"), reserve = total("RESERVE");
  return { income: money(income), expenses: money(expenses), investment: money(investment), reserve: money(reserve),
    capacity: money(income.minus(expenses)), free: money(income.minus(expenses).minus(investment).minus(reserve)),
    expensePercent: percent(expenses, income), investmentPercent: percent(investment, income),
    savings: money(income.minus(expenses)), deficit: income.lt(expenses.plus(investment).plus(reserve)) };
}
export function accountBalance(account: Account, movements: Movement[], date: string): string | null {
  if (account.opening === null || !account.openingDate || date < account.openingDate) return null;
  return money(movements.filter(m => !m.voidedAt && m.date >= account.openingDate! && m.date <= date).reduce((balance, m) =>
    balance.plus(m.destinationId === account.id ? m.amount : 0).minus(m.originId === account.id ? m.amount : 0), d(account.opening)));
}
export function actualFlow(movements: Movement[], from: string, to: string) {
  const rows = movements.filter(m => !m.voidedAt && m.date >= from && m.date <= to);
  const income = sum(rows.filter(m => m.kind === "INCOME").map(m => m.amount));
  const expenses = sum(rows.filter(m => m.kind === "EXPENSE").map(m => m.amount));
  return { income: money(income), expenses: money(expenses), savings: money(income.minus(expenses)) };
}
export const monthlyRate = (annualPercent: string) => d(1).plus(d(annualPercent).div(100)).pow(d(1).div(12)).minus(1);

export function project(input: ProjectionInput): ProjectionRow[] {
  const rate = monthlyRate(input.annualRate), reserveRate = monthlyRate(input.reserveAnnualRate);
  let invested = d(input.initialInvestment), reserveBalance = d(input.initialReserve), cash = d(input.initialCash);
  let investmentPrincipal = invested, reservePrincipal = reserveBalance;
  const rows: ProjectionRow[] = [];

  if (input.includeBaseline) {
    const gross = invested.plus(reserveBalance).plus(cash);
    const principal = investmentPrincipal.plus(reservePrincipal);
    rows.push({
      month: input.startMonth,
      income: "0.00",
      expenses: "0.00",
      investment: "0.00",
      reserve: "0.00",
      free: "0.00",
      cash: money(cash),
      invested: money(invested),
      reserveBalance: money(reserveBalance),
      principal: money(principal),
      gains: "0.00",
      tax: "0.00",
      gross: money(gross),
      net: money(gross),
      feasible: true
    });
  }

  const startIndex = input.includeBaseline ? 1 : 0;
  const totalIterations = input.includeBaseline ? input.months + 1 : input.months;

  for (let n = startIndex; n < totalIterations; n++) {
    const month = addMonths(input.startMonth, n);
    const years = Number(month.slice(0, 4)) - Number(input.startMonth.slice(0, 4));
    const values = {
      salary: d(input.salary).mul(d(1).plus(d(input.salaryGrowth).div(100)).pow(years)),
      expenses: d(input.expenses).mul(d(1).plus(d(input.expenseInflation).div(100)).pow(years)),
      investment: d(input.investment).plus(d(input.annualContributionIncrease).mul(years)), reserve: d(input.reserve),
    };
    const applyEvents = (eventMonth: string, target: typeof values) => {
      for (const e of [...input.events].sort((a, b) => a.month.localeCompare(b.month))) {
        if (e.month <= eventMonth && (!e.endMonth || e.endMonth >= eventMonth)) target[e.field] = e.mode === "SET" ? d(e.amount) : target[e.field].plus(e.amount);
      }
    };
    applyEvents(month, values);
    let salary = values.salary;
    if (input.salaryOffset) {
      const earningMonth = addMonths(month, -input.salaryOffset);
      if (earningMonth < input.startMonth) salary = d(0);
      else {
        const earningYears = Number(earningMonth.slice(0, 4)) - Number(input.startMonth.slice(0, 4));
        const prior = { ...values, salary: d(input.salary).mul(d(1).plus(d(input.salaryGrowth).div(100)).pow(earningYears)) };
        applyEvents(earningMonth, prior); salary = prior.salary;
      }
    }
    const income = salary.plus(sum(input.extras.filter(e => e.date.slice(0, 7) === month).map(e => e.amount)));

    let contribution: Decimal;
    let reserveContribution: Decimal;
    if (input.prioritizeReserve) {
      const targetReserve = input.reserveTarget ? d(input.reserveTarget) : d(values.expenses).mul(input.reserveMonths ?? 6);
      const gap = Decimal.max(0, targetReserve.minus(reserveBalance));
      const totalSavings = values.investment.plus(values.reserve);
      if (gap.gt(0)) {
        reserveContribution = Decimal.min(totalSavings, gap).toDecimalPlaces(2);
        contribution = totalSavings.minus(reserveContribution).toDecimalPlaces(2);
      } else {
        reserveContribution = d(0).toDecimalPlaces(2);
        contribution = totalSavings.toDecimalPlaces(2);
      }
    } else {
      contribution = values.investment.toDecimalPlaces(2);
      reserveContribution = values.reserve.toDecimalPlaces(2);
    }

    investmentPrincipal = investmentPrincipal.plus(contribution); reservePrincipal = reservePrincipal.plus(reserveContribution);
    invested = input.timing === "START" ? invested.plus(contribution).mul(rate.plus(1)) : invested.mul(rate.plus(1)).plus(contribution);
    reserveBalance = input.timing === "START" ? reserveBalance.plus(reserveContribution).mul(reserveRate.plus(1)) : reserveBalance.mul(reserveRate.plus(1)).plus(reserveContribution);
    const free = income.minus(values.expenses).minus(contribution).minus(reserveContribution);
    const beginningCash = cash;
    cash = cash.plus(free);
    const tax = Decimal.max(0, invested.minus(investmentPrincipal)).plus(Decimal.max(0, reserveBalance.minus(reservePrincipal))).mul(d(input.taxRate).div(100));
    const gross = invested.plus(reserveBalance).plus(cash), principal = investmentPrincipal.plus(reservePrincipal);
    const startFunded = input.timing === "END" || beginningCash.gte(values.expenses.plus(contribution).plus(reserveContribution)) || (input.salaryDay === 1 && beginningCash.plus(income).gte(values.expenses.plus(contribution).plus(reserveContribution)));
    rows.push({ month, income: money(income), expenses: money(values.expenses), investment: money(contribution), reserve: money(reserveContribution),
      free: money(free), cash: money(cash), invested: money(invested), reserveBalance: money(reserveBalance), principal: money(principal),
      gains: money(invested.plus(reserveBalance).minus(principal)), tax: money(tax), gross: money(gross), net: money(gross.minus(tax)), feasible: cash.gte(0) && startFunded });
  }
  return rows;
}
export function requiredContribution(target: string, initial: string, months: number, annualRate = "0", timing: "START" | "END" = "END") {
  if (d(initial).gte(target)) return "0.00";
  if (months <= 0) return null;
  const r = monthlyRate(annualRate);
  if (r.isZero()) return d(target).minus(initial).div(months).toDecimalPlaces(2, Decimal.ROUND_UP).toFixed(2);
  const factor = r.plus(1).pow(months);
  const annuity = factor.minus(1).div(r).mul(timing === "START" ? r.plus(1) : 1);
  return Decimal.max(0, d(target).minus(d(initial).mul(factor)).div(annuity)).toDecimalPlaces(2, Decimal.ROUND_UP).toFixed(2);
}
export function solveGoal(target: string, input: ProjectionInput) {
  const final = (p: ProjectionInput) => project(p).at(-1)?.invested ?? p.initialInvestment;
  if (d(input.initialInvestment).gte(target)) return { contribution: "0.00", months: 0, reason: null };
  let low = d(0), high = Decimal.max(target, 1);
  for (let i = 0; i < 70 && high.minus(low).gt("0.005"); i++) {
    const mid = low.plus(high).div(2);
    if (d(final({ ...input, investment: mid.toFixed(8) })).gte(target)) high = mid; else low = mid;
  }
  const contribution = high.toDecimalPlaces(2, Decimal.ROUND_UP).toFixed(2);
  const path = project({ ...input, months: 1200 });
  const reached = path.findIndex(row => d(row.invested).gte(target));
  return { contribution: d(final({ ...input, investment: contribution })).gte(target) ? contribution : null,
    months: reached < 0 ? null : reached + 1, reason: reached < 0 ? "Meta não alcançada no horizonte de 100 anos com estes parâmetros." : null };
}
export function reverseScenarios(required: string, salary: string, expenses: string, reserve: string, reducible: string) {
  const available = d(salary).minus(expenses).minus(reserve), gap = Decimal.max(0, d(required).minus(available));
  const cut = Decimal.min(gap, reducible), balancedCut = Decimal.min(gap.div(2), reducible);
  return { available: money(available), gap: money(gap), cut: money(cut), cutFeasible: cut.gte(gap),
    minimumIncome: money(d(expenses).plus(reserve).plus(required)), extraIncome: money(gap),
    balancedCut: money(balancedCut), balancedIncome: money(gap.minus(balancedCut)) };
}
export function reserveCoverage(balance: string | null, items: BudgetItem[]) {
  const expenses = items.filter(i => i.kind === "EXPENSE");
  if (balance === null || expenses.some(i => i.essential === null)) return null;
  const essential = sum(expenses.filter(i => i.essential).map(i => i.amount));
  return essential.isZero() ? null : d(balance).div(essential).toFixed(1);
}
export function distributeSurplus(amount: string, reserveBalance: string | null, items: BudgetItem[], rules: FinancialRules) {
  const available = Decimal.max(0, amount);
  if (rules.prioritizeReserve && reserveBalance === null) return null;
  if (rules.prioritizeReserve && items.some(i => i.kind === "EXPENSE" && i.essential === null)) return null;
  const target = sum(items.filter(i => i.kind === "EXPENSE" && i.essential).map(i => i.amount)).mul(rules.reserveMonths);
  const reserve = rules.prioritizeReserve && d(reserveBalance ?? 0).lt(target)
    ? Decimal.min(available, target.minus(reserveBalance ?? 0))
    : available.mul(d(100).minus(rules.investmentShare)).div(100);
  return { reserve: money(reserve), investment: money(available.minus(reserve)) };
}
export function insights(items: BudgetItem[], rules: FinancialRules, coverage: string | null) {
  const flow = cashFlow(items), messages: string[] = [];
  if (flow.deficit) messages.push(`Orçamento deficitário: faltam R$ ${d(flow.free).abs().toFixed(2)} para cobrir despesas e aportes.`);
  if (flow.expensePercent !== null) messages.push(`As despesas representam ${flow.expensePercent}% da renda${d(flow.expensePercent).gt(rules.maxExpensePercent) ? ", acima do limite definido" : ""}.`);
  if (flow.investmentPercent !== null && d(flow.investmentPercent).lt(rules.minInvestmentPercent)) messages.push("O investimento planejado está abaixo do percentual mínimo configurado.");
  if (coverage !== null && d(coverage).lt(rules.reserveMonths)) messages.push(`Sua reserva cobre ${coverage} meses essenciais; o objetivo é ${rules.reserveMonths}.`);
  if (d(flow.savings).lt(rules.savingsTarget)) messages.push("A economia mensal está abaixo da meta configurada.");
  return messages.slice(0, 4);
}
