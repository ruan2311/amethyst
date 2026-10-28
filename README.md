# Amethyst

Karaokê para Windows: organiza seus vídeos de karaokê em uma biblioteca, dá nota pelo microfone e mostra tudo na TV enquanto você controla pelo notebook.

Encontrou algum problema? Abra uma *issue* e anexe o arquivo `%APPDATA%\Amethyst\amethyst.log`.

## Baixar e usar

1. Baixe o **`Amethyst-win64.zip`** na página de [Releases](../../releases/latest).
2. Extraia o zip em qualquer pasta e abra o **`Amethyst.exe`**.
   Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo** (o programa ainda não tem assinatura digital).
3. Escolha a pasta onde ficam seus vídeos de karaokê.

O passo a passo completo está no `LEIA-ME.txt` dentro do zip.

## O que ele faz

- **Biblioteca** a partir dos seus vídeos (mp4, mkv, webm…), separada por **artistas**, **gêneros** e coleções (favoritas, mais cantadas, recentes).
  Nomeie os arquivos como `Artista - Música.mp4`. Subpastas com nome de gênero (`Sertanejo`, `MPB`…) viram o gênero, e o resto pode ser buscado automaticamente no MusicBrainz.
- **Fila** com o nome de quem vai cantar.
- **Nota pelo microfone**: detecta o tom da voz em tempo real e mede afinação, presença e estabilidade. Sem microfone, há o modo sorteio.
- **Modo sem detecção**: a TV mostra a barra de tom de karaokê seguindo a melodia real do vídeo (analisada pelo próprio app) e, faltando 1 minuto, uma barrinha discreta no notebook pergunta a nota. Se ninguém escolher, sai uma nota acima de 80.
- **Videoclipes com letra**: vídeos marcados como videoclipe (dentro de uma pasta `Clipes` ou com "videoclipe", "clipe oficial" ou "official video" no nome do arquivo) mostram a letra ao lado na TV, com a linha cantada em destaque. A letra vem do [LRCLIB](https://lrclib.net) pelo nome da música, de um arquivo `.lrc` com o mesmo nome do vídeo, ou é colada no editor; dá para ajustar o tempo e sincronizar apertando Espaço. Se o tipo estiver em "Automático" e a música já tiver uma letra salva, ela aparece também.
- **Tela da TV**: com a TV ligada como tela estendida (Win + P → Estender), a TV mostra a apresentação de quem vai cantar, o vídeo, a nota ao vivo, o resultado e a fila. O notebook fica com os controles.
- **Aba YouTube** para músicas que não estão na biblioteca (o site normal dentro do app, nada é baixado), com opção de mandar o vídeo para a TV.

## Limitações conhecidas

- AVI, WMV e alguns MKV antigos não abrem (aparecem com o aviso "formato?").
- Vídeos com áudio AC3/DTS podem tocar sem som.
- Caixas de som perto do microfone atrapalham a nota; ajuste a sensibilidade em Configurações.

## Para desenvolvedores

Feito em [Electron](https://www.electronjs.org/) com JavaScript puro, sem etapa de build da interface.

```bash
npm install
npm start                                   # roda em modo de desenvolvimento
node build/package-win.js dist/Amethyst      # monta a versão Windows (x64), funciona também no Linux/WSL
```

- `src/main.js` — janelas, servidor local de vídeos (`media://`), tela da TV
- `src/library.js` — varredura das pastas e banco da biblioteca (`library.json`)
- `src/renderer/` — interface do notebook (`index.html`, `app.js`), da TV (`tv.html`, `tv.js`), pontuação (`scoring.js`), barra de tom (`bars.js`), análise da melodia (`melody-worker.js`) e letras (`lyrics.js`)

Para testar sem clicar: `Amethyst.exe --selftest=C:\pasta` (com vídeos em `C:\pasta\videos`) passa por todas as telas, salva prints e grava o log.

## Licença

MIT — veja [LICENSE](LICENSE). A fonte Outfit é distribuída sob a SIL Open Font License (`src/renderer/fonts/OFL.txt`).
