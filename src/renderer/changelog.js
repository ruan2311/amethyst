// Novidades (Configurações → Novidades). A versão mais nova primeiro; *texto* vira negrito.
// Cada item: [tipo, texto], com tipo 'new' (Novo), 'fix' (Correção: ajuste no que já existia) ou 'bug' (Bug corrigido).
(function () {
  const TAGS = Object.freeze({ new: 'Novo', fix: 'Correção', bug: 'Bug' });
  const LOG = [
    { version: '1.7.0', date: 'outubro de 2026', items: [
      ['new', '*Atualização automática:* o Amethyst procura versões novas no GitHub ao abrir e a cada 6 horas, baixa em segundo plano e confere se o arquivo é o original. Quando estiver pronta, aparece *Atualização pronta* no menu: um clique e ele fecha, atualiza e abre de novo sozinho.'],
      ['new', 'Em *Configurações → Atualizações*: procurar agora, acompanhar o download e ligar ou desligar o download automático. Instalar é sempre com você.']
    ] },
    { version: '1.6.0', date: 'outubro de 2026', items: [
      ['new', '*Novidades:* esta tela, em Configurações, com o que mudou em cada versão. O Amethyst também avisa quando é atualizado.']
    ] },
    { version: '1.5.2', date: 'outubro de 2026', items: [
      ['new', '*Botão Barra na aba YouTube:* liga ou desliga a pontuação ao vivo na TV para vídeos que já vêm com a letra. A nota final continua aparecendo, e a escolha fica guardada para os próximos vídeos.']
    ] },
    { version: '1.5.1', date: 'outubro de 2026', items: [
      ['bug', 'Ao começar a pontuar um vídeo do YouTube no notebook, o vídeo da biblioteca não continua mais tocando na TV.'],
      ['bug', 'A barra e a nota ao vivo do YouTube param na pausa, no anúncio e no fim do vídeo.'],
      ['fix', 'A melodia da barra de tom no YouTube ficou mais calma: notas mais longas, passos menores e pausas entre as frases.']
    ] },
    { version: '1.5.0', date: 'outubro de 2026', items: [
      ['new', '*Letra embaixo na TV, estilo karaokê:* o videoclipe fica em tela cheia e a letra aparece numa faixa por cima do pé do vídeo. A linha da vez enche de cor enquanto é cantada, e a próxima vem menor logo abaixo.'],
      ['new', 'Em *Configurações → Letra dos videoclipes na TV*, escolha entre *embaixo* (o padrão) e *ao lado do vídeo*. Troca na hora.']
    ] },
    { version: '1.4.1', date: 'outubro de 2026', items: [
      ['fix', 'Com a letra ao lado, o videoclipe ficou maior na TV, e a linha cantada, mais destacada.'],
      ['fix', 'A faixa de tom e a nota ao vivo ficam do lado do vídeo, sem cobrir a letra.']
    ] },
    { version: '1.4.0', date: 'outubro de 2026', items: [
      ['new', '*Barra de tom estilo Just Dance:* cada nota ganha *X*, *OK*, *BOM!*, *ÓTIMO!* ou *PERFEITO!*, com fases boas e ruins ao longo da música (antes quase tudo dava PERFEITO).'],
      ['fix', 'A voz na barra segue a avaliação: em cima da nota no PERFEITO, fora do tom no X. O notebook e a TV mostram a mesma avaliação.'],
      ['bug', 'Na TV, a faixa de tom não cobre mais a letra dos videoclipes.']
    ] },
    { version: '1.3.0', date: 'outubro de 2026', items: [
      ['new', '*Letra encaixada no clipe:* a letra baixada se ajusta sozinha quando o clipe tem uma introdução antes da música.'],
      ['new', '*Botão Letra* no Palco (ou tecla *L*): liga e desliga a letra, e a escolha fica guardada na música.'],
      ['new', '*YouTube:* *Pôr na fila* o vídeo aberto, nota automática no fim do vídeo, recomeçar na TV e títulos limpos (artista e música) no histórico.'],
      ['bug', 'Na TV, um vídeo novo do YouTube substitui o anterior em vez de deixá-lo tocando escondido.']
    ] },
    { version: '1.2.0', date: 'outubro de 2026', items: [
      ['new', '*Comemoração animada na nota:* com 70 ou mais, aurora, cristais de ametista, ondas e brilhos no notebook e na TV, mais forte com 85 e 95. Roda liso até em PC sem placa de vídeo.'],
      ['new', 'Vídeos com *videoclipe*, *clipe oficial* ou *official video* no nome do arquivo viram videoclipe sozinhos.'],
      ['fix', 'Com o tipo em Automático, uma letra já salva aparece também nos vídeos de karaokê.']
    ] },
    { version: '1.1.0', date: 'outubro de 2026', items: [
      ['new', '*Modo sem detecção:* a TV mostra a nota e a barra de tom como num karaokê. Faltando 1 minuto, uma barrinha no notebook pergunta a nota (até quebrada, como 87,5). Se ninguém escolher, sai uma nota acima de 80.'],
      ['new', '*Barra de tom no ritmo da música:* o Amethyst analisa o áudio do vídeo e as barrinhas seguem as notas de verdade.'],
      ['new', '*Videoclipes com letra* na TV: do LRCLIB, de um arquivo .lrc ou colada no editor, com ajuste de tempo e sincronização apertando Espaço.'],
      ['new', 'Logotipo *AMETHYST By Ruan*, ícone novo e o desenho de uma pessoa cantando na biblioteca.'],
      ['fix', 'O tipo de pontuação saiu do Palco e fica só em Configurações.']
    ] },
    { version: '1.0.0', date: 'outubro de 2026', items: [
      ['new', 'Primeira versão estável do Amethyst.']
    ] },
    { version: '0.1.0 beta', date: 'outubro de 2026', items: [
      ['new', 'Primeira versão: biblioteca dos seus vídeos por artistas, gêneros, favoritas, mais cantadas e recentes.'],
      ['new', 'Gêneros automáticos, pelo nome da pasta ou pelo MusicBrainz.'],
      ['new', 'Fila com o nome de quem vai cantar e nota pelo microfone (afinação, presença e estabilidade) ou por sorteio.'],
      ['new', 'Tela da TV para os convidados, com o notebook como controle, e aba do YouTube.']
    ] }
  ];
  window.AmethystChangelog = { TAGS, LOG };
})();
