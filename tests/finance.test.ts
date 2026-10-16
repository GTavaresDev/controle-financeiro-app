import { describe, it, expect } from "vitest";
import {
  cashFlow,
  project,
  accountBalance,
  monthlyRate,
  d,
  money
} from "@/domain/finance";
import type { Account, Movement, ProjectionInput } from "@/domain/types";
import { brl } from "@/lib/utils";

describe("Motor Financeiro e Cálculos de Domínio", () => {
  it("deve reconciliar o orçamento mensal: 1.621 - 663 - 482 - 476 = 0", () => {
    const items = [
      { kind: "INCOME" as const, amount: "1621.00" },
      { kind: "EXPENSE" as const, amount: "663.00" },
      { kind: "INVESTMENT" as const, amount: "482.00" },
      { kind: "RESERVE" as const, amount: "476.00" },
    ];

    const flow = cashFlow(items);

    expect(flow.income).toBe("1621.00");
    expect(flow.expenses).toBe("663.00");
    expect(flow.investment).toBe("482.00");
    expect(flow.reserve).toBe("476.00");
    expect(flow.capacity).toBe("958.00"); // 1621 - 663
    expect(flow.free).toBe("0.00"); // 1621 - 663 - 482 - 476
    expect(flow.deficit).toBe(false);
  });

  it("deve reproduzir com exatidão o cenário original de 2027 da planilha", () => {
    // Premissas originais de 2027:
    // Saldo inicial de investimentos em 31/12/2026: R$ 5.453,89 (Meta 2026)
    // Reserva inicial em 31/12/2026: R$ 0,00
    // Aporte mensal de investimentos: R$ 482,00 x 12 = R$ 5.784,00
    // Aporte mensal de reserva: R$ 476,00 x 12 = R$ 5.712,00
    // Total investimentos fim de 2027: 5.453,89 + 5.784,00 = 11.237,89
    // Total reserva fim de 2027: 0 + 5.712,00 = 5.712,00
    // Patrimônio total projetado para 31/12/2027: 11.237,89 + 5.712,00 = 16.949,89
    const params: ProjectionInput = {
      startMonth: "2027-01",
      months: 12,
      salary: "1621.00",
      expenses: "663.00",
      investment: "482.00",
      reserve: "476.00",
      initialInvestment: "5453.89",
      initialReserve: "0.00",
      initialCash: "0.00",
      annualRate: "0",
      reserveAnnualRate: "0",
      taxRate: "0",
      salaryGrowth: "0",
      expenseInflation: "0",
      annualContributionIncrease: "0",
      timing: "END",
      salaryDay: 31,
      salaryOffset: 0,
      events: [],
      extras: [],
    };

    const rows = project(params);
    expect(rows.length).toBe(12);

    const finalRow = rows[11];
    expect(finalRow.month).toBe("2027-12");
    expect(finalRow.invested).toBe("11237.89");
    expect(finalRow.reserveBalance).toBe("5712.00");
    expect(finalRow.net).toBe("16949.89");
    expect(finalRow.feasible).toBe(true);
  });

  it("deve retornar null ('Pendente de informação') quando a conta não possui saldo de abertura cadastrado", () => {
    const unconfirmedAccount: Account = {
      id: "invest-1",
      name: "Investimentos",
      kind: "INVESTMENT",
      opening: null,
      openingDate: null,
    };

    const balance = accountBalance(unconfirmedAccount, [], "2026-10-16");
    expect(balance).toBeNull();
    expect(brl(balance)).toBe("Pendente de informação");
  });

  it("deve calcular transferências entre contas sem duplicar patrimônio total", () => {
    const cashAcc: Account = {
      id: "cash-1",
      name: "Conta Corrente",
      kind: "CASH",
      opening: "1000.00",
      openingDate: "2026-10-01",
    };

    const investAcc: Account = {
      id: "invest-1",
      name: "Investimentos",
      kind: "INVESTMENT",
      opening: "5000.00",
      openingDate: "2026-10-01",
    };

    // Transferência (aporte) de 500 reais da conta corrente para investimentos
    const transfer: Movement = {
      id: "mov-1",
      name: "Aporte Mensal",
      kind: "TRANSFER",
      amount: "500.00",
      date: "2026-10-10",
      month: "2026-10",
      originId: "cash-1",
      destinationId: "invest-1",
      itemId: null,
      voidedAt: null,
    };

    const cashBal = accountBalance(cashAcc, [transfer], "2026-10-16");
    const investBal = accountBalance(investAcc, [transfer], "2026-10-16");

    expect(cashBal).toBe("500.00"); // 1000 - 500
    expect(investBal).toBe("5500.00"); // 5000 + 500

    // O patrimônio consolidado permanece 6000.00 (sem criação mágica de dinheiro)
    const total = d(cashBal!).plus(investBal!).toFixed(2);
    expect(total).toBe("6000.00");
  });

  it("deve converter taxa anual efetiva usando a fórmula (1 + i)^(1/12) - 1", () => {
    // 12% a.a. => (1.12)^(1/12) - 1 ≈ 0.00948879 (0.9489% a.m.)
    const rateMonthly = monthlyRate("12");
    const expected = d(1.12).pow(d(1).div(12)).minus(1);
    expect(rateMonthly.toFixed(8)).toBe(expected.toFixed(8));
  });
});
