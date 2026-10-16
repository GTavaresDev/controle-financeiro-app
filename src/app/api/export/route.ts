import ExcelJS from "exceljs";
import { getData } from "@/server/store";
import { localRequest } from "@/server/security";
export async function GET(request: Request) {
  if (!localRequest(request)) return new Response("Origem não autorizada", { status: 403 });
  const data = await getData(), wb = new ExcelJS.Workbook();
  const toRecords = (items: unknown[]) => items as unknown as Record<string, unknown>[];
  const tables: Record<string, Record<string, unknown>[]> = {
    "Contas reais": toRecords(data.accounts),
    "Movimentos reais": toRecords(data.movements),
    Planejamento: toRecords(data.items.map(({ overrides, ...item }) => ({ ...item, overrides: JSON.stringify(overrides) }))),
    Categorias: toRecords(data.categories),
    Metas: toRecords(data.goals),
    "Cenários simulados": toRecords(data.scenarios.map(s => ({ id: s.id, name: s.name, parameters: JSON.stringify(s.parameters) }))),
    Regras: toRecords([data.rules]),
  };
  const escape = (value: unknown) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+@\-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const content = Object.entries(tables).map(([name, rows]) => {
      const keys = Object.keys(rows[0] ?? {});
      return `${escape(name)}\r\n${keys.map(escape).join(";")}\r\n${rows.map(row => keys.map(k => escape(row[k])).join(";")).join("\r\n")}`;
    }).join("\r\n\r\n");
    return new Response("\ufeff" + content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="financeiro.csv"', "Cache-Control": "no-store" } });
  }
  const monetary = new Set(["amount", "opening", "target", "initial", "contribution"]);
  for (const [name, rows] of Object.entries(tables)) {
    const sheet = wb.addWorksheet(name), keys = Object.keys(rows[0] ?? { informação: "" });
    sheet.columns = keys.map(key => ({ header: key, key, width: key === "parameters" || key === "overrides" ? 70 : 22 }));
    for (const row of rows) sheet.addRow(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, monetary.has(k) && v !== null ? Number(v) : v])));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF134E4A" } };
    keys.forEach((k, i) => { if (monetary.has(k)) sheet.getColumn(i + 1).numFmt = '"R$" #,##0.00'; });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  const bytes = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="financeiro.xlsx"', "Cache-Control": "no-store" } });
}
