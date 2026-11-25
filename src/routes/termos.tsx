import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/LegalPage";

export const Route = createFileRoute("/termos")({
  head: () => legalHead("Termos de uso", "Regras de uso do marketplace PokePlace para compradores e lojas."),
  component: () => (
    <LegalPage title="Termos de uso" intro="Ao usar o PokePlace você concorda com estas regras."
      sections={[
        { h: "O que é o PokePlace", p: ["Um marketplace que conecta compradores a lojas independentes de cartas Pokémon. As vendas são feitas pelas lojas; o PokePlace intermedia pagamento, mensagens e mediação."] },
        { h: "Conta", p: ["Você é responsável pelos dados e pela segurança da sua conta. Contas usadas para fraude podem ser suspensas."] },
        { h: "Compras", p: ["O preço, a condição e o idioma da carta são informados pela loja. Siga as regras da Compra Garantida para ter proteção."] },
        { h: "Proibido", p: ["Cartas falsificadas sem identificação, pagamento por fora da plataforma, avaliações falsas, ofensas e qualquer atividade ilegal."] },
        { h: "Comissão", p: ["O PokePlace cobra das lojas uma comissão sobre cada venda, informada no painel da loja."] },
        { h: "Limitação", p: ["Preços com selo “Dados demonstrativos” são ilustrativos e não são ofertas de venda."] },
      ]} />
  ),
});
