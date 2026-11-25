import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/LegalPage";

export const Route = createFileRoute("/privacidade")({
  head: () => legalHead("Privacidade", "Como o PokePlace trata seus dados pessoais, conforme a LGPD."),
  component: () => (
    <LegalPage title="Política de privacidade" intro="Tratamos seus dados conforme a Lei Geral de Proteção de Dados (LGPD)."
      sections={[
        { h: "Dados coletados", p: ["Cadastro (e-mail, nome), endereço de entrega, pedidos, mensagens e, para lojas, documentos de identificação."] },
        { h: "Para que usamos", p: ["Executar compras, entregar pedidos, prevenir fraudes, mediar problemas e cumprir obrigações legais."] },
        { h: "Compartilhamento", p: ["A loja recebe apenas o necessário para enviar o pedido. Documentos de lojas nunca são públicos."] },
        { h: "Seus direitos", p: ["Você pode baixar seus dados e pedir a exclusão da conta na página Minha conta. Alguns registros de pedidos podem ser mantidos pelo prazo legal."] },
      ]} />
  ),
});
