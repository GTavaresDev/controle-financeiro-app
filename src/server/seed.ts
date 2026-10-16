import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { commitWorkbook } from "./excel";
import { initialize } from "./store";

async function run() {
  console.log("Inicializando perfil financeiro e contas...");
  await initialize();

  const filePath = resolve(process.cwd(), "docs/controle-financeiro-projecao-2027.xlsx");
  console.log("Lendo arquivo Excel:", filePath);
  const buffer = await readFile(filePath);
  const bytes = new Uint8Array(buffer);

  console.log("Importando dados do Excel para o PostgreSQL (mês de início: 2026-10)...");
  const result = await commitWorkbook(bytes, "controle-financeiro-projecao-2027.xlsx", "2026-10");
  console.log("Resultado da importação:", result);
}

run()
  .then(() => {
    console.log("Seed concluído com sucesso!");
    process.exit(0);
  })
  .catch(err => {
    console.error("Erro durante o seed:", err);
    process.exit(1);
  });
