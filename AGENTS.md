# Regras do Projeto

Consulte também as regras em [.agents/rules/response-behavior.md](file:///Users/gabrieltavares/apps/controle-financeiro-app/.agents/rules/response-behavior.md).

## Diretrizes de Comportamento e Resposta

1. **Apenas Responder (Não Implementar Automaticamente):**
   - Ao receber problemas, erros, dúvidas ou tarefas, apenas analise e responda no chat.
   - Não altere ou crie arquivos de código a menos que o usuário solicite explicitamente usando expressões como *"faça você mesmo"*, *"chat faça você mesmo"*, *"implemente você mesmo"*.

2. **Planos Passo a Passo (Plans):**
   - Ao receber solicitações de plano ou "implementar um plan", elabore e responda com o passo a passo completo diretamente no chat, sem codar nem alterar nenhum arquivo no projeto.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
