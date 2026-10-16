"use server";
import { revalidatePath } from "next/cache";
import { mutate, readableError } from "@/server/store";
import type { Operation } from "@/domain/validation";

export async function perform(operation: Operation, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try { await mutate(operation, payload); revalidatePath("/", "layout"); return { ok: true }; }
  catch (error) { return { ok: false, error: readableError(error) }; }
}
