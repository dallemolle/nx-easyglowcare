import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { whatsAppNumber } from "@/lib/br/phone";

import { ClinicContact } from "./clinic-contact";

// Mesma cadeia da página: `locations.phone` → whatsAppNumber → clinicPhone.
const render = (locationPhone: string | null) =>
  renderToStaticMarkup(<ClinicContact clinicPhone={whatsAppNumber(locationPhone)} />);

describe("ClinicContact", () => {
  it("clínica sem telefone: nenhum link nem texto", () => {
    expect(render(null)).toBe("");
  });

  it("clínica com telefone: link do WhatsApp com 55, em nova aba", () => {
    const html = render("11999990000");
    expect(html).toContain("Não reconhece esse número?");
    expect(html).toContain('href="https://wa.me/5511999990000"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain("Fale com a clínica");
  });
});
