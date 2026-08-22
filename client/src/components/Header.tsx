export function Header(): JSX.Element {
  return (
    <header>
      <p className="eyebrow">Araújo Madeiras · Lista de corte</p>
      <h1>Gerador de lista para o CorteCloud</h1>
      <p className="subtitle">
        Cole a mensagem com as medidas (WhatsApp, bloco de notas, etc), confira as peças identificadas
        e copie pronto para colar no Cortecloud.
      </p>
      <div className="ruler" />
    </header>
  );
}
