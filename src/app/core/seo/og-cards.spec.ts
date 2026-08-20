import { TOOLS } from '../tools/tools';

/**
 * Todo tool tem card de compartilhamento?
 *
 * `public/og/` é a última lista do repositório mantida ao lado de uma fonte
 * derivável — e, ao contrário do sitemap e do llms.txt, ela NÃO pode ser gerada
 * no `prebuild`: o gerador roda o Chromium para compor tipografia de verdade, e
 * o deploy do Cloudflare Pages faz `npm ci && npm run build` num runner onde
 * baixar um navegador seriam minutos de build e uma forma nova de quebrar a
 * publicação. Os PNGs são commitados e `npm run og` é manual, por decisão
 * registrada no próprio script.
 *
 * O preço dessa decisão é que uma ferramenta nova nasce sem card e ninguém
 * percebe: a página fica com o card padrão, que é degradação silenciosa e não
 * falha. Este spec é o que transforma "ninguém percebe" em "o teste falha e diz
 * o comando" — o mesmo papel que `sitemap.spec.ts` cumpre para o arquivo que
 * ele confere.
 *
 * O alvo de Karma serve `public/` como assets, então basta buscar o arquivo.
 */
describe('cards de compartilhamento (public/og)', () => {
  it('has one card per tool per language', async () => {
    const missing: string[] = [];

    for (const tool of TOOLS) {
      for (const lang of ['pt', 'en']) {
        const response = await fetch(`/og/${tool.id}-${lang}.png`);
        if (!response.ok) missing.push(`${tool.id}-${lang}.png`);
      }
    }

    expect(missing)
      .withContext(`faltando em public/og — rode: npm run og\n${missing.join('\n')}`)
      .toEqual([]);
  });

  it('has the defaults every non-tool page falls back to', async () => {
    for (const file of ['default-pt.png', 'default-en.png', 'logo-512.png']) {
      const response = await fetch(`/og/${file}`);
      expect(response.ok).withContext(file).toBe(true);
    }
  });

  /**
   * Os ícones do PWA saem do mesmo gerador, e a ausência deles é ainda mais
   * silenciosa: sem PNG de 192 e 512 o Chrome no Android simplesmente não
   * oferece a instalação, sem erro em lugar nenhum.
   */
  it('has the PNG icons the manifest declares', async () => {
    for (const file of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      const response = await fetch(`/${file}`);
      expect(response.ok).withContext(`${file} — rode: npm run og`).toBe(true);
    }
  });
});
