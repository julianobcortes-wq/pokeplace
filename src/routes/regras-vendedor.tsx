import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/LegalPage";

export const Route = createFileRoute("/regras-vendedor")({
  head: () => legalHead("Regras para lojas", "Obrigações, prazos, comissão e repasses das lojas no PokePlace."),
  component: () => (
    <LegalPage title="Regras para lojas" intro="Para vender no PokePlace a loja precisa ser aprovada pela curadoria e seguir estas regras."
      sections={[
        { h: "Anúncios", p: ["Descreva condição, idioma, acabamento e graduação com honestidade. Fotos reais são recomendadas.", "Lojas novas têm limite de anúncios ativos até completar 5 vendas."] },
        { h: "Envio", p: ["Poste no prazo informado no seu perfil de frete e informe o rastreio. Embale a carta com proteção."] },
        { h: "Problemas", p: ["Responda problemas abertos em até 3 dias. Sem resposta, a mediação pode decidir a favor do comprador."] },
        { h: "Repasses", p: ["O valor da venda, menos a comissão, fica disponível após a confirmação de recebimento e o prazo de segurança. O saque é feito por Pix."] },
        { h: "Suspensão", p: ["Fraudes, cartas falsas, pedido de pagamento por fora ou muitos problemas procedentes levam à suspensão da loja."] },
      ]} />
  ),
});
