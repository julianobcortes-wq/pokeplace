import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/LegalPage";

export const Route = createFileRoute("/compra-garantida")({
  head: () => legalHead("Compra Garantida", "Como o PokePlace protege compradores e lojas: reserva, mediação de problemas e liberação do pagamento."),
  component: () => (
    <LegalPage title="Compra Garantida PokePlace" draft={false} intro="O dinheiro só chega à loja depois que você recebe a carta. Se algo der errado, a PokePlace media."
      sections={[
        { h: "1. Pague dentro do PokePlace", p: ["Pagamentos e conversas por fora do site não têm proteção. Telefones, e-mails e links externos são ocultados nas mensagens."] },
        { h: "2. Cartas reservadas", p: ["Ao fechar o pedido, as cartas ficam reservadas por 15 minutos para você pagar. Sem pagamento, voltam para a vitrine."] },
        { h: "3. Cancelamento antes do envio", p: ["Enquanto nenhuma carta foi enviada, você pode cancelar o pedido pela página do pedido."] },
        { h: "4. Problema com a entrega", p: ["Não recebeu, chegou diferente do anúncio ou danificada? Abra um problema no pedido em até 30 dias após a entrega. A loja tem 3 dias para responder.", "Sem acordo, qualquer lado pede mediação. A equipe PokePlace analisa as mensagens e decide: reembolso total, parcial ou liberação à loja."] },
        { h: "5. Quando a loja recebe", p: ["O valor fica retido até o comprador confirmar o recebimento e o prazo de segurança terminar, sem problema aberto."] },
        { h: "6. Lojas com curadoria", p: ["Toda loja passa por aprovação. Lojas novas têm limite de anúncios até completar vendas. Denúncias são revisadas pela moderação."] },
      ]} />
  ),
});
