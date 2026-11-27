import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/LegalPage";

export const Route = createFileRoute("/regras-vendedor")({
  head: () => legalHead("Regras para lojas", "Termômetro de reputação, medalhas PokeLíder, SLA de postagem, strikes automáticos e repasses das lojas no PokePlace."),
  component: () => (
    <LegalPage title="Regras para lojas" intro="Para vender no PokePlace a loja precisa ser aprovada pela curadoria e manter indicadores saudáveis no Termômetro de Reputação."
      sections={[
        { h: "Anúncios e anti-autocompra", p: ["Descreva condição, idioma, acabamento e graduação com honestidade. Fotos reais são recomendadas.", "Lojas novas têm limite de anúncios ativos até completar 5 vendas reais.", "É proibido comprar da própria loja ou manipular vendas para inflar reputação — o sistema bloqueia autocompras automaticamente."] },
        { h: "SLA de postagem e envio", p: ["Cada pedido pago gera um prazo automático de postagem (ship_by) baseado nos dias úteis informados no seu perfil de frete (padrão: 2 dias úteis).", "Poste dentro do prazo com transportadora e código de rastreio. A taxa de envios no prazo compõe diretamente o seu Termômetro.", "Embale cartas com sleeve, toploader/proteção rígida e proteção contra umidade."] },
        { h: "Termômetro de Reputação e Medalhas PokeLíder", p: ["O Termômetro (5 faixas: Crítica, Atenção, Regular, Muito boa e Excelente) é calculado automaticamente em vendas reais considerando 4 pilares: nota dos compradores, % de envios no prazo, % de reclamações e % de cancelamentos, além do tempo médio de resposta nas perguntas.", "Lojas no verde escuro (reclamações < 2%, cancelamentos < 2%, envios no prazo ≥ 95%, nota ≥ 4,7) conquistam medalhas públicas no Ranking: PokeLíder (25+ vendas), PokeLíder Gold (75+ vendas) e PokeLíder Platinum (250+ vendas)."] },
        { h: "Problemas, arrependimento (7 dias CDC) e avaliação mútua", p: ["Responda problemas abertos ou solicitações de arrependimento (Art. 49 do CDC, válidas até 7 dias após a entrega) em até 3 dias. Sem resposta, a mediação pode decidir a favor do comprador.", "Após a entrega de uma venda paga, a loja também pode avaliar o comprador (1 a 5 estrelas), fortalecendo a confiança mútua da comunidade."] },
        { h: "Repasses e confirmação automática pós-prazo", p: ["O valor da venda, menos a comissão, fica disponível após a confirmação de recebimento e o prazo de segurança. Se o comprador esquecer de confirmar e não houver problema aberto após 14 dias da postagem, a entrega é confirmada automaticamente.", "O saque é solicitado por Pix no painel Minha Loja."] },
        { h: "Strikes automáticos e suspensão", p: ["A partir de 5 vendas, taxas de reclamação ou cancelamento acima de 5% acionam restrição automática que impede ativar novos anúncios até revisão da equipe PokePlace.", "Fraudes, cartas falsas, pedido de pagamento por fora ou reincidência levam à suspensão ou bloqueio definitivo da loja."] },
      ]} />
  ),
});
