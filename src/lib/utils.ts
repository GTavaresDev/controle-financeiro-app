import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const brl = (v: string | number | null | undefined) => v === null || v === undefined ? "Pendente de informação" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
export const monthLabel = (v: string) => new Date(v + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
