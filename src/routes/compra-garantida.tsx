import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/LegalPage";

export const Route = createFileRoute("/compra-garantida")({
  head: () => legalHead("Compra Garantida", "Como o PokePlace protege compradores e lojas: reserva, arrependimento 7 dias CDC, mediação, confirmação automática e liberação do pagamento."),
  component: () => (
    <LegalPage title="Compra Garantida PokePlace" draft={false} intro="O dinheiro só chega à loja depois que você recebe a carta. Se algo der errado — ou se você exercer o direito de arrependimento — o PokePlace protege a operação."
      sections={[
        { h: "1. Pague dentro do PokePlace", p: ["Pagamentos e conversas por fora do site não têm proteção. Telefones, e-mails e links externos são ocultados nas mensagens."] },
        { h: "2. Cartas reservadas", p: ["Ao fechar o pedido, as cartas ficam reservadas por 15 minutos para você pagar. Sem pagamento, voltam para a vitrine."] },
        { h: "3. Cancelamento antes do envio", p: ["Enquanto nenhuma carta foi enviada, você pode cancelar o pedido pela página do pedido."] },
        { h: "4. Direito de arrependimento (7 dias — CDC Art. 49) e devolução rastreada", p: ["Você tem até 7 dias corridos após a entrega para solicitar devolução por arrependimento diretamente na página do pedido.", "Ao devolver uma carta em disputa ou arrependimento, informe a transportadora e o código de rastreio no chamado para acelerar a liberação do reembolso."] },
        { h: "5. Problema com a entrega e mediação", p: ["Não recebeu, chegou diferente do anúncio ou danificada? Abra um problema no pedido em até 30 dias após a entrega. A loja tem 3 dias para responder.", "Sem acordo, qualquer lado pede mediação. A equipe PokePlace analisa as mensagens e o rastreio e decide: reembolso total, parcial ou liberação à loja."] },
        { h: "6. Confirmação de entrega e repasse à loja", p: ["O valor fica retido até você confirmar o recebimento e o prazo de segurança terminar, sem problema aberto.", "Caso não haja problema aberto em até 14 dias após a postagem, o sistema pode confirmar a entrega automaticamente para não travar o repasse da loja."] },
        { h: "7. Termômetro, avaliação mútua e Ranking", p: ["Toda loja é avaliada em um Termômetro público de 5 cores (envios no prazo, reclamações, cancelamentos e nota) e pode conquistar medalhas PokeLíder.", "Compradores também podem ser avaliados pelas lojas e escolher, de forma opcional (LGPD), exibir seu apelido público no Ranking de Colecionadores."] },
      ]} />
  ),
});
