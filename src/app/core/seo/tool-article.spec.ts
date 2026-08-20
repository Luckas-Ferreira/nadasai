import { TOOL_ARTICLE, type ArticleSection } from './tool-article';
import { TOOLS, type ToolId } from '../tools/tools';

/**
 * O que estes testes travam é a decadência, não a cobertura.
 *
 * Uma entrada nova pode não existir — o componente simplesmente não renderiza a
 * seção, e é assim que as 36 páginas ganham texto ao longo do tempo em vez de
 * todas de uma vez com texto ruim. O que NÃO pode acontecer é uma entrada pela
 * metade: PT com quatro seções e EN com duas, ou uma seção com trezentos
 * caracteres de recheio que passa como se fosse conteúdo. As duas coisas são
 * invisíveis na tela em que você está trabalhando e visíveis para quem indexa.
 *
 * O piso de 400 palavras por língua é o mínimo que, somado ao FAQ, tira a página
 * da faixa em que a auditoria a mediu (223 palavras visíveis).
 */

const MIN_WORDS = 400;

function words(sections: readonly ArticleSection[]): number {
  const text = sections
    .flatMap((s) => [s.h, ...s.p, ...(s.steps ?? [])])
    .join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}

function entries(): ReadonlyArray<readonly [ToolId, NonNullable<(typeof TOOL_ARTICLE)[ToolId]>]> {
  return Object.entries(TOOL_ARTICLE)
    .filter((pair): pair is [ToolId, NonNullable<(typeof TOOL_ARTICLE)[ToolId]>] => !!pair[1])
    .map(([id, article]) => [id as ToolId, article] as const);
}

describe('TOOL_ARTICLE', () => {
  /**
   * A cobertura ficou COMPLETA, e por isso virou teste.
   *
   * Enquanto o texto existia só para as ferramentas de maior busca, exigir todas
   * seria transformar uma decisão editorial em erro de build. Agora que as 36
   * têm entrada, o que precisa ser impedido é o contrário: uma ferramenta nova
   * nascer sem texto e a página dela voltar às 223 palavras que a auditoria
   * mediu — o componente simplesmente não renderiza a seção, e nada na tela
   * denuncia a falta.
   */
  it('covers every tool', () => {
    const covered = new Set(entries().map(([id]) => id));
    const missing = TOOLS.filter((t) => !covered.has(t.id)).map((t) => t.id);

    expect(missing)
      .withContext(`sem texto longo em tool-article.ts: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('only names tools that exist', () => {
    const known = new Set(TOOLS.map((t) => t.id));
    for (const [id] of entries()) expect(known.has(id)).withContext(id).toBe(true);
  });

  it('has the same section count in both languages', () => {
    for (const [id, article] of entries()) {
      expect(article.pt.length).withContext(`${id} pt`).toBeGreaterThan(0);
      expect(article.pt.length).withContext(`${id} section count`).toBe(article.en.length);
    }
  });

  it('has no empty heading, paragraph or step', () => {
    for (const [id, article] of entries()) {
      for (const [lang, sections] of [
        ['pt', article.pt],
        ['en', article.en],
      ] as const) {
        for (const section of sections) {
          expect(section.h.trim().length).withContext(`${id}/${lang} heading`).toBeGreaterThan(0);
          expect(section.p.length + (section.steps?.length ?? 0))
            .withContext(`${id}/${lang}: "${section.h}"`)
            .toBeGreaterThan(0);
          for (const paragraph of section.p) {
            expect(paragraph.trim().length).withContext(`${id}/${lang}`).toBeGreaterThan(40);
          }
          for (const step of section.steps ?? []) {
            expect(step.trim().length).withContext(`${id}/${lang} step`).toBeGreaterThan(10);
          }
        }
      }
    }
  });

  it('carries enough text to be worth rendering, in both languages', () => {
    for (const [id, article] of entries()) {
      expect(words(article.pt)).withContext(`${id} pt`).toBeGreaterThanOrEqual(MIN_WORDS);
      expect(words(article.en)).withContext(`${id} en`).toBeGreaterThanOrEqual(MIN_WORDS);
    }
  });

  /**
   * Duas línguas do MESMO texto não podem divergir em tamanho a ponto de uma
   * delas ser outra coisa. A auditoria mediu exatamente isso no FAQ: o inglês
   * saiu ~20% mais curto em todas as 36 ferramentas, porque foi escrito como
   * resumo da versão em português em vez de como o mesmo conteúdo.
   */
  it('keeps the two languages within 25% of each other', () => {
    for (const [id, article] of entries()) {
      const pt = words(article.pt);
      const en = words(article.en);
      const ratio = Math.min(pt, en) / Math.max(pt, en);
      expect(ratio).withContext(`${id}: pt=${pt} en=${en}`).toBeGreaterThan(0.75);
    }
  });
});
