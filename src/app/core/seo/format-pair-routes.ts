import type { Type } from '@angular/core';
import type { Routes } from '@angular/router';
import { FORMAT_PAIRS } from './format-pairs';

/**
 * As rotas dos pares de formato, DERIVADAS do registro em vez de escritas.
 *
 * `app.routes.ts` é uma lista literal longa de propósito — o comentário lá diz
 * por quê: são URLs indexadas, e ver cada uma escrita é o que impede uma delas
 * de mudar sem ninguém notar. Este arquivo é a exceção, e a razão é a mesma que
 * criou o `route-map.ts`: 24 entradas quase idênticas, escritas à mão, são o
 * mesmo checklist manual que já falhou em 7 de 28 ferramentas. Aqui não há o
 * que esquecer, porque não há onde escrever.
 *
 * O que a rota carrega:
 *
 *   - `component`, a MESMA da ferramenta pai. A página de par não é uma
 *     ferramenta nova; é a de converter, apontada. É isso que faz "programática"
 *     não ser sinônimo de "duplicada em código".
 *   - `data.pairId`, que o componente lê para pré-selecionar o formato de
 *     destino — chegar em /png-para-jpg com JPEG já marcado é a metade do valor
 *     da página.
 *   - `title` e `metaDescription` do próprio par, porque um título repetido em
 *     24 URLs é a falha que o `21-prerender` existe para pegar.
 */
export function formatPairRoutes(lang: 'pt' | 'en'): Routes {
  return FORMAT_PAIRS.map((pair) => {
    const content = pair[lang];

    return {
      path: lang === 'pt' ? pair.pathPt : pair.pathEn,
      title: content.title,
      loadComponent: () => loadToolComponent(pair.tool),
      data: {
        pairId: pair.id,
        metaDescription: content.description,
      },
    };
  });
}

/**
 * O `import()` precisa ser literal para o bundler enxergar o chunk, então isto
 * é um switch e não um mapa montado a partir de string. Só as ferramentas que
 * um par pode apontar estão aqui: acrescentar um par para outra ferramenta
 * quebra no `default` em vez de carregar a errada em silêncio.
 */
function loadToolComponent(tool: string): Promise<Type<unknown>> {
  switch (tool) {
    case 'convert':
      return import('../../features/convert/convert.component').then((m) => m.ConvertComponent);
    case 'convert-audio':
      return import('../../features/convert-audio/convert-audio.component').then(
        (m) => m.ConvertAudioComponent,
      );
    default:
      throw new Error(`[format-pairs] sem componente para a ferramenta "${tool}"`);
  }
}
