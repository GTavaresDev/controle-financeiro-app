"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  WalletCards,
  Target,
  LineChart,
  Settings,
  Download,
  Coins
} from "lucide-react";
import type { AppData } from "@/domain/types";
import { today } from "@/lib/utils";
import { Modal } from "./ui/dialog";
import { Dashboard } from "./dashboard";
import { Budget } from "./budget";
import { Goals } from "./goals";
import { Projections } from "./projections";
import { AccountsForm, Categories, ImportForm, RulesForm } from "./settings";

type TabKey = "dashboard" | "budget" | "goals" | "projections" | "settings";

export function AppShell({ data }: { data: AppData }) {
  // If we have items with startMonth, default to the current month or the first item's month
  const defaultMonth = today().slice(0, 7);
  const [month, setMonth] = useState(defaultMonth);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [importModal, setImportModal] = useState(false);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 18L9.5 12.5L13.5 16.5L20 8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 8H20V13" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="4" cy="18" r="1.5" fill="white" />
            </svg>
          </div>
          <div>
            <h1>Controle Financeiro</h1>
            <span>Planejamento Pessoal</span>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Navegação Principal">
          <button className={`nav-tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>
            <span className="flex-row items-center gap-2"><LayoutDashboard size={15} /> Dashboard</span>
          </button>
          <button className={`nav-tab ${tab === "budget" ? "active" : ""}`} onClick={() => setTab("budget")}>
            <span className="flex-row items-center gap-2"><WalletCards size={15} /> Orçamento Mensal</span>
          </button>
          <button
            className={`nav-tab ${tab === "goals" ? "active" : ""}`}
            onClick={() => setTab("goals")}
          >
            <span className="flex-row items-center gap-2">
              <Target size={15} /> Metas
            </span>
          </button>
          <button className={`nav-tab ${tab === "projections" ? "active" : ""}`} onClick={() => setTab("projections")}>
            <span className="flex-row items-center gap-2"><LineChart size={15} /> Projeção Anual</span>
          </button>
          <button className={`nav-tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            <span className="flex-row items-center gap-2"><Settings size={15} /> Ajustes</span>
          </button>
        </nav>
      </aside>

      <div className="app-body">
        <header className="app-header">
          <div className="header-inner">
            <label className="month-selector" title="Mês de competência de visualização">
              <span>Mês:</span>
              <input
                type="month"
                value={month}
                onChange={e => e.target.value && setMonth(e.target.value)}
              />
            </label>

            <a
              href="/api/export"
              download="financeiro.xlsx"
              className="header-export button button-outline button-sm"
              title="Exportar planilha Excel completa"
            >
              <Download size={14} /> Excel
            </a>
          </div>
        </header>

        <main className="main-content">
        {tab === "dashboard" && <Dashboard data={data} month={month} onNavigate={t => setTab(t as TabKey)} />}
        {tab === "budget" && <Budget data={data} month={month} />}
        {tab === "goals" && <Goals data={data} month={month} />}
        {tab === "projections" && <Projections data={data} month={month} />}
        {tab === "settings" && (
          <div className="stack-lg">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CONTAS BANCÁRIAS</span>
                  <h2>Saldos Reais de Abertura</h2>
                  <p>Informe os saldos iniciais confirmados para ativar os indicadores patrimoniais reais.</p>
                </div>
              </div>
              <AccountsForm data={data} />
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">IMPORTAÇÃO DA PLANILHA</span>
                  <h2>Importar Dados do Excel</h2>
                  <p>Carregue sua planilha de planejamento e metas para atualizar ou inicializar os dados.</p>
                </div>
              </div>
              <ImportForm onClose={() => setImportModal(false)} />
            </div>

            <div className="grid-2-cols">
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">PREFERÊNCIAS</span>
                    <h2>Regras Financeiras</h2>
                    <p>Limites percentuais de despesas e alocação de reserva.</p>
                  </div>
                </div>
                <RulesForm data={data} />
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">ORGANIZAÇÃO</span>
                    <h2>Categorias de Despesa</h2>
                    <p>Gerencie e reclassifique suas categorias de orçamento.</p>
                  </div>
                </div>
                <Categories data={data} />
              </div>
            </div>
          </div>
        )}
        </main>
      </div>

      <Modal title="Importar Planilha" open={importModal} onClose={() => setImportModal(false)}>
        <ImportForm onClose={() => setImportModal(false)} />
      </Modal>
    </div>
  );
}
