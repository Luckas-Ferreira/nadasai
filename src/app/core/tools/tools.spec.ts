import {
  MAX_NEXT_TOOL_CHIPS,
  MODULES,
  TOOLS,
  moduleById,
  nextToolsFor,
  toolFromUrl,
  toolPath,
  toolsOfModule,
} from './tools';

describe('tools registry', () => {
  /**
   * The shell resolves the rail, the mobile bar and the switcher from a tool's
   * `category`, through `moduleById`, which THROWS on an unknown id. So a tool
   * introduced with a category nobody added to MODULES does not degrade — it takes
   * the whole shell down on that route. This is the guard for that.
   */
  it('every tool belongs to a declared module', () => {
    const declared = new Set(MODULES.map((m) => m.id));
    for (const tool of TOOLS) {
      expect(declared.has(tool.category)).toBe(true, `tool ${tool.id} has no module`);
    }
  });

  it('every declared module has at least one tool', () => {
    // The switcher navigates to a module's FIRST tool; an empty module would make
    // that lookup undefined and produce a link to "/pt/undefined".
    for (const mod of MODULES) {
      expect(toolsOfModule(mod.id).length).toBeGreaterThan(0);
    }
  });

  it('partitions the tools: no tool in two modules, none left out', () => {
    const total = MODULES.reduce((sum, mod) => sum + toolsOfModule(mod.id).length, 0);
    expect(total).toBe(TOOLS.length);
  });

  /**
   * `core/seo/route-map.ts` derives the hreflang map by registering each tool
   * under both spellings. A duplicated path would silently overwrite another
   * tool's entry there, so uniqueness is the invariant that derivation rests on.
   */
  it('has unique paths in both languages', () => {
    const pt = TOOLS.map((t) => t.pathPt);
    const en = TOOLS.map((t) => t.pathEn);
    expect(new Set(pt).size).toBe(pt.length);
    expect(new Set(en).size).toBe(en.length);
    // And no PT path may collide with an EN one, for the same reason.
    expect(new Set([...pt, ...en]).size).toBe(pt.length + en.length);
  });

  it('has unique tool ids', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves a tool from either language, and nothing from the home', () => {
    expect(toolFromUrl('/pt/imagem/cortar')?.id).toBe('crop');
    expect(toolFromUrl('/en/image/crop')?.id).toBe('crop');
    expect(toolFromUrl('/pt/pdf/marca-dagua')?.id).toBe('watermark-pdf');

    expect(toolFromUrl('/pt')).toBeNull();
    expect(toolFromUrl('/en')).toBeNull();
    expect(toolFromUrl('/pt/sobre')).toBeNull();
    expect(toolFromUrl('/pt/faq')).toBeNull();
  });

  it('ignores a trailing slash, a query and a fragment', () => {
    expect(toolFromUrl('/pt/imagem/cortar/')?.id).toBe('crop');
    expect(toolFromUrl('/pt/imagem/cortar?from=home')?.id).toBe('crop');
    expect(toolFromUrl('/pt/imagem/cortar#panel')?.id).toBe('crop');
  });

  /**
   * `img-to-pdf` lives under `imagem/para-pdf` while the PDF module lives under
   * `pdf/…`, so resolution cannot key off the path prefix — it has to match the
   * declared paths. A prefix-based shortcut would file this tool under PDF.
   */
  it('does not infer the module from the path prefix', () => {
    const tool = toolFromUrl('/pt/imagem/para-pdf');
    expect(tool?.id).toBe('img-to-pdf');
    expect(tool?.category).toBe('image');
  });

  it('builds the localized path', () => {
    const crop = TOOLS.find((t) => t.id === 'crop')!;
    expect(toolPath(crop, 'pt')).toBe('imagem/cortar');
    expect(toolPath(crop, 'en')).toBe('image/crop');
  });

  it('throws on an unknown module rather than rendering an empty shell', () => {
    expect(() => moduleById('nope' as never)).toThrowError(/Unknown module/);
  });

  /**
   * Toda a cadeia — os chips da barra de ações, o "Enviar para…" da barra de
   * arquivo e a porta de hidratação de cada ferramenta — sai destes dois campos.
   * Uma ferramenta nova que os esqueça não quebra: ela some da cadeia em
   * silêncio, que é pior. Por isso o teste, e não a confiança no checklist.
   */
  it('every tool declares what it eats and what it hands back', () => {
    for (const tool of TOOLS) {
      expect(Array.isArray(tool.accepts)).withContext(tool.id).toBe(true);
      expect(tool.produces === null || typeof tool.produces === 'string')
        .withContext(tool.id)
        .toBe(true);
      // 'any' é uma entrada, nunca uma saída: nada "produz qualquer coisa".
      expect(tool.produces).withContext(tool.id).not.toBe('any');
    }
  });

  it('offers the tools that accept what the source produced', () => {
    const ids = (kind: Parameters<typeof nextToolsFor>[0], from: Parameters<typeof nextToolsFor>[1]) =>
      nextToolsFor(kind, from).map((t) => t.id);

    // A cadeia que não existia: sair do PDF e voltar para o módulo de imagem.
    expect(ids('image', 'pdf-to-img')).toContain('crop');
    // E a de volta, que a guarda de tipo antiga tornava impossível.
    expect(ids('pdf', 'img-to-pdf')).toContain('merge-pdf');
    // Os destinos universais estão sempre lá.
    expect(ids('audio', 'normalize-audio')).toContain('encrypt-file');
    expect(ids('zip', 'split-pdf')).toEqual(['encrypt-file', 'file-hash']);
  });

  it('never offers a tool itself, and offers nothing for a null kind', () => {
    expect(nextToolsFor('image', 'crop').map((t) => t.id)).not.toContain('crop');
    expect(nextToolsFor(null, 'protect-pdf')).toEqual([]);
  });

  it('puts the source module first, because that is the common case', () => {
    const first = nextToolsFor('pdf', 'compress-pdf')[0];
    expect(first.category).toBe('pdf');
  });

  /**
   * O teste que a suíte e2e escreveu: com a ordem de declaração e um corte em
   * seis, "Converter" caía fora dos chips do redimensionar — vetorizar e
   * extrair-texto passavam na frente porque estão declarados antes. Continuar
   * mexendo na imagem vem antes de transformá-la em outra coisa.
   */
  it('offers the tools that keep the kind before the ones that change it', () => {
    const chips = nextToolsFor('image', 'resize', MAX_NEXT_TOOL_CHIPS).map((t) => t.id);

    expect(chips).toContain('convert');
    expect(chips).toContain('crop');
    expect(chips.indexOf('convert')).toBeLessThan(chips.indexOf('vectorize'));
    expect(chips.indexOf('compress')).toBeLessThan(chips.indexOf('img-to-pdf'));
  });

  /**
   * O strip do remove-exif é byte a byte, e qualquer editor raster daqui em
   * diante decodifica num canvas e reencoda — desfazendo em silêncio a única
   * coisa que a ferramenta faz. Só cifrar e resumir em hash não tocam num pixel.
   */
  it('sends a losslessly stripped image only where it stays lossless', () => {
    expect(nextToolsFor('image', 'remove-exif').map((t) => t.id)).toEqual([
      'encrypt-file',
      'file-hash',
    ]);
  });

  it('honours the chip limit', () => {
    expect(nextToolsFor('image', 'crop', 3).length).toBe(3);
  });
});
