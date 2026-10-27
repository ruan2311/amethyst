# Amethyst

Karaokê para Windows feito em Electron com JavaScript puro, sem etapa de build da interface. Os projetos do Ruan têm nomes de pedras e gemas (Onix = launcher de TV, Amethyst, Opala = bot de WhatsApp). A estrutura do código está descrita no README.

## Sincronia (celular + PC)
- Este projeto é editado no celular (Termux) e no PC (WSL + VS Code).
- Ao abrir a sessão, um hook em `.claude/settings.json` roda `git pull --ff-only`. Se falhar (as cópias divergiram), avise o usuário em português simples antes de mexer em qualquer arquivo.
- Ao terminar uma tarefa que gerou commits, rode `git push` na hora, sem perguntar.

## Versões
- A versão fica no `package.json` e aparece no título do release e na tag (`vX.Y.Z`).
- Monte com `node build/package-win.js dist/Amethyst` (funciona no Linux/WSL) e publique no GitHub (`ruan2311/amethyst`) como `Amethyst-win64.zip`, em um release novo para cada versão.
- Atualize o README quando o comportamento mudar.

## Como trabalhar com o usuário
- Tudo que o usuário vê vai em **português do Brasil**, inclusive as notas curtas entre ferramentas.
- Explique em linguagem simples, sem jargão.
- Confira antes de afirmar (código, README, releases); nunca chute.
- Prints para o usuário vão em `/sdcard/Download/Imagens para o claude`.
