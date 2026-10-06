/**
 * "Não reconhece esse número? Fale com a clínica", com link para o WhatsApp do local ativo.
 * Sem telefone na clínica (`clinicPhone` nulo), não mostra nada.
 */
export function ClinicContact({ clinicPhone }: { clinicPhone: string | null }) {
  if (!clinicPhone) return null;

  return (
    <p className="mt-2 text-muted-foreground">
      Não reconhece esse número?{" "}
      <a
        href={`https://wa.me/${clinicPhone}`}
        target="_blank"
        rel="noopener"
        className="text-foreground underline underline-offset-4"
      >
        Fale com a clínica
      </a>
    </p>
  );
}
