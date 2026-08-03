import { TOOLS } from '../tools/tools';
import { alternatesFor, cleanPathOf } from './route-map';

describe('route map', () => {
  it('resolves every tool from BOTH spellings', () => {
    // The bug this replaces: 7 of 28 tools were absent, so their pages
    // advertised alternates pointing at URLs that do not exist.
    for (const tool of TOOLS) {
      expect(alternatesFor(tool.pathPt)).withContext(`pt: ${tool.pathPt}`).not.toBeNull();
      expect(alternatesFor(tool.pathEn)).withContext(`en: ${tool.pathEn}`).not.toBeNull();
    }
  });

  it('gives both spellings the SAME object, so the pair cannot desync', () => {
    for (const tool of TOOLS) {
      expect(alternatesFor(tool.pathPt)).toBe(alternatesFor(tool.pathEn));
    }
  });

  it('points each alternate at the other language, prefixed correctly', () => {
    for (const tool of TOOLS) {
      const pair = alternatesFor(tool.pathPt)!;
      expect(pair.pt).toBe(`/pt/${tool.pathPt}`);
      expect(pair.en).toBe(`/en/${tool.pathEn}`);
    }
  });

  it('covers the tools that were missing before', () => {
    const regressions = [
      'privacidade/remover-exif',
      'privacy/remove-exif',
      'privacidade/criptografar-arquivo',
      'privacy/encrypt-file',
      'audio/comprimir',
      'audio/compress',
    ];
    for (const path of regressions) {
      const pair = alternatesFor(path);
      expect(pair).withContext(path).not.toBeNull();
      expect(pair!.pt.startsWith('/pt/')).toBe(true);
      expect(pair!.en.startsWith('/en/')).toBe(true);
    }
  });

  it('keeps the privacy POLICY page distinct from the privacy MODULE', () => {
    // 'privacidade' is the legal page; 'privacidade/...' are tools. Exact-key
    // lookup keeps them apart, but the collision is easy to reintroduce.
    expect(alternatesFor('privacidade')).toEqual({ pt: '/pt/privacidade', en: '/en/privacy' });
    expect(alternatesFor('privacidade')).not.toBe(alternatesFor('privacidade/remover-exif'));
  });

  it('maps the home page and the static pages', () => {
    expect(alternatesFor('')).toEqual({ pt: '/pt', en: '/en' });
    expect(alternatesFor('sobre')).toEqual({ pt: '/pt/sobre', en: '/en/about' });
    expect(alternatesFor('about')).toEqual({ pt: '/pt/sobre', en: '/en/about' });
    expect(alternatesFor('faq')).toEqual({ pt: '/pt/faq', en: '/en/faq' });
  });

  it('returns null for an unknown path instead of inventing one', () => {
    expect(alternatesFor('nope/not-a-route')).toBeNull();
  });
});

describe('cleanPathOf', () => {
  it('strips the language prefix', () => {
    expect(cleanPathOf('/pt/imagem/cortar')).toBe('imagem/cortar');
    expect(cleanPathOf('/en/image/crop')).toBe('image/crop');
  });

  it('handles the bare language roots', () => {
    expect(cleanPathOf('/pt')).toBe('');
    expect(cleanPathOf('/pt/')).toBe('');
  });

  it('drops query strings, fragments and trailing slashes', () => {
    expect(cleanPathOf('/pt/imagem/cortar?a=1')).toBe('imagem/cortar');
    expect(cleanPathOf('/pt/imagem/cortar#x')).toBe('imagem/cortar');
    expect(cleanPathOf('/pt/imagem/cortar/')).toBe('imagem/cortar');
  });

  it('round-trips every tool path through the map', () => {
    for (const tool of TOOLS) {
      expect(alternatesFor(cleanPathOf(`/pt/${tool.pathPt}`))).not.toBeNull();
      expect(alternatesFor(cleanPathOf(`/en/${tool.pathEn}`))).not.toBeNull();
    }
  });
});
