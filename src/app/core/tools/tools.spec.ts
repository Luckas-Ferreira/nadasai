import { MODULES, TOOLS, moduleById, toolFromUrl, toolPath, toolsOfModule } from './tools';

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
});
