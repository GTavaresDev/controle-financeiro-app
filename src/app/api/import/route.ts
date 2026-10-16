import { revalidatePath } from "next/cache";
import { commitWorkbook, previewWorkbook } from "@/server/excel";
import { readableError } from "@/server/store";
import { localRequest } from "@/server/security";
export async function POST(request: Request) {
  if (!localRequest(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) throw Error("Arquivo muito grande.");
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) throw Error("Selecione um arquivo .xlsx.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (form.get("commit") === "true") {
      const result = await commitWorkbook(bytes, file.name, String(form.get("startMonth")));
      revalidatePath("/", "layout"); return Response.json(result);
    }
    return Response.json(await previewWorkbook(bytes, file.name));
  } catch (error) { return Response.json({ error: readableError(error) }, { status: 400 }); }
}
