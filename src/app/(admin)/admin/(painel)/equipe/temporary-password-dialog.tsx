"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Mostra a senha provisória uma única vez. Quem usa mantém a senha só em estado local e a
 * zera em `onClose`: nada fica guardado depois que o diálogo fecha.
 */
export function TemporaryPasswordDialog({
  password,
  title,
  onClose,
}: {
  password: string | null;
  title: string;
  onClose: () => void;
}) {
  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Senha copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie a senha manualmente.");
    }
  }

  return (
    <Dialog open={password !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Só o botão "Fechar" fecha: um toque fora ou Escape perderiam a senha, mostrada uma vez. */}
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Anote agora: ela não será mostrada de novo.</DialogDescription>
        </DialogHeader>
        <p
          data-testid="temporary-password"
          className="rounded-md bg-muted px-3 py-2 text-center font-mono text-lg tracking-wide break-all select-all"
        >
          {password}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={copy}>
            Copiar
          </Button>
          <DialogClose asChild>
            <Button type="button">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
