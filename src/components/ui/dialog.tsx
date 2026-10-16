"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({ title, description, open, onClose, children }: { title: string; description?: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="modal-overlay" /><DialogPrimitive.Content className="modal-content">
    <div className="modal-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Description>{description ?? "Revise os dados antes de salvar."}</DialogPrimitive.Description></div><DialogPrimitive.Close aria-label="Fechar" className="icon-button"><X size={20} /></DialogPrimitive.Close></div>
    {children}
  </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
