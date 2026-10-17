export type Money = string;
export type ItemKind = "INCOME" | "EXPENSE" | "INVESTMENT" | "RESERVE";
export type AccountKind = "CASH" | "INVESTMENT" | "RESERVE";
export interface Category { id: string; name: string }
export interface BudgetItem {
  id: string; name: string; kind: ItemKind; amount: Money; startMonth: string;
  endMonth: string | null; recurring: boolean; dueDay: number | null;
  fixed: boolean; essential: boolean | null; notes: string; categoryId: string | null;
  sourceKey?: string | null;
  overrides: { month: string; amount: Money | null; skipped: boolean }[];
}
export interface Account { id: string; name: string; kind: AccountKind; opening: Money | null; openingDate: string | null }
export interface Movement {
  id: string; name: string; kind: "INCOME" | "EXPENSE" | "TRANSFER" | "YIELD";
  amount: Money; date: string; month: string; originId: string | null;
  destinationId: string | null; itemId: string | null; voidedAt: string | null;
}
export interface Goal {
  id: string; name: string; description: string; kind: string; target: Money;
  initial: Money | null; startDate: string; deadline: string; contribution: Money;
  accountId: string | null;
}
export interface ScheduledEvent {
  month: string; field: "salary" | "expenses" | "investment" | "reserve";
  amount: Money; mode: "SET" | "ADD"; endMonth?: string;
}
export interface ProjectionInput {
  startMonth: string; months: number; salary: Money; expenses: Money;
  investment: Money; reserve: Money; initialInvestment: Money; initialReserve: Money;
  initialCash: Money; annualRate: string; reserveAnnualRate: string;
  taxRate: string; salaryGrowth: string; expenseInflation: string;
  annualContributionIncrease: Money; timing: "START" | "END";
  salaryDay: number; salaryOffset: number; events: ScheduledEvent[];
  extras: { date: string; amount: Money; name: string }[];
  prioritizeReserve?: boolean;
  reserveMonths?: number;
  reserveTarget?: Money;
  includeBaseline?: boolean;
}
export interface ProjectionRow {
  month: string; income: Money; expenses: Money; investment: Money; reserve: Money;
  free: Money; cash: Money; invested: Money; reserveBalance: Money; principal: Money;
  gains: Money; tax: Money; gross: Money; net: Money; feasible: boolean;
}
export interface Scenario { id: string; name: string; parameters: ProjectionInput }
export interface FinancialRules {
  minInvestmentPercent: string; maxExpensePercent: string; reserveMonths: number;
  prioritizeReserve: boolean; savingsTarget: Money; autoDistribution: boolean;
  investmentShare: string;
}
export const defaultRules: FinancialRules = {
  minInvestmentPercent: "0", maxExpensePercent: "100", reserveMonths: 6,
  prioritizeReserve: true, savingsTarget: "0", autoDistribution: false, investmentShare: "50",
};
export interface AppData {
  accounts: Account[]; categories: Category[]; items: BudgetItem[]; movements: Movement[];
  goals: Goal[]; scenarios: Scenario[]; rules: FinancialRules; birthDate: string | null;
  imports: { id: string; filename: string; createdAt: string }[];
}
