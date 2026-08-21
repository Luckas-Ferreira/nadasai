import { unzipSync, zipSync } from 'fflate';
import {
  cleanOfficeMetadata,
  officeKindOf,
  readOfficeMetadata,
} from './metadata';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
<dc:title>Proposta Comercial</dc:title>
<dc:subject>Orçamento</dc:subject>
<dc:creator>Maria Silva</dc:creator>
<cp:keywords>proposta;cliente;2026</cp:keywords>
<cp:lastModifiedBy>joao.pc-de-casa</cp:lastModifiedBy>
<cp:revision>7</cp:revision>
<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-05T10:00:00Z</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">2026-02-11T18:30:00Z</dcterms:modified>
</cp:coreProperties>`;

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Microsoft Office Word</Application>
<Company>Concorrente S.A.</Company>
<Manager>Diretor Anterior</Manager>
<TotalTime>842</TotalTime>
<Template>Normal.dotm</Template>
</Properties>`;

/** Um .docx mínimo, mas com a forma real: dois docProps e um documento. */
function makeDocx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': encoder.encode('<?xml version="1.0"?><Types/>'),
    'docProps/core.xml': encoder.encode(CORE),
    'docProps/app.xml': encoder.encode(APP),
    'word/document.xml': encoder.encode(
      '<?xml version="1.0"?><w:document><w:body><w:p>O conteúdo do documento</w:p></w:body></w:document>',
    ),
    'word/media/image1.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
  });
}

describe('office metadata', () => {
  describe('officeKindOf', () => {
    it('recognises the three formats and nothing else', () => {
      expect(officeKindOf('proposta.docx')).toBe('docx');
      expect(officeKindOf('planilha.XLSX')).toBe('xlsx');
      expect(officeKindOf('slides.pptx')).toBe('pptx');
      expect(officeKindOf('documento.pdf')).toBeNull();
      expect(officeKindOf('documento.doc')).toBeNull();
    });
  });

  describe('readOfficeMetadata', () => {
    it('reads both property files', () => {
      const meta = readOfficeMetadata(makeDocx(), 'docx');

      expect(meta.core.get('dc:creator')).toBe('Maria Silva');
      expect(meta.core.get('cp:lastModifiedBy')).toBe('joao.pc-de-casa');
      expect(meta.core.get('dc:title')).toBe('Proposta Comercial');
      expect(meta.app.get('Company')).toBe('Concorrente S.A.');
      expect(meta.app.get('TotalTime')).toBe('842');
      expect(meta.count).toBeGreaterThan(10);
    });

    it('skips empty fields instead of listing them blank', () => {
      const bytes = zipSync({
        'docProps/core.xml': encoder.encode(
          '<cp:coreProperties><dc:creator></dc:creator><dc:title>Só o título</dc:title></cp:coreProperties>',
        ),
      });

      const meta = readOfficeMetadata(bytes, 'docx');

      expect(meta.core.has('dc:creator')).toBe(false);
      expect(meta.core.get('dc:title')).toBe('Só o título');
    });

    it('answers empty for a zip with no docProps', () => {
      const bytes = zipSync({ 'word/document.xml': encoder.encode('<w:document/>') });

      expect(readOfficeMetadata(bytes, 'docx').count).toBe(0);
    });
  });

  describe('cleanOfficeMetadata', () => {
    it('empties every field it found', () => {
      const { bytes, removed } = cleanOfficeMetadata(makeDocx());

      expect(removed).toBeGreaterThan(10);
      expect(readOfficeMetadata(bytes, 'docx').count).toBe(0);
    });

    /**
     * O teste que separa uma limpeza de uma reescrita: o documento e as mídias
     * têm de sair BYTE A BYTE iguais. Qualquer coisa que decodifique e regrave
     * o conteúdo é um segundo lugar onde o arquivo pode se degradar — é o mesmo
     * argumento que `core/exif/strip.ts` faz sobre o scan do JPEG.
     */
    it('copies every other entry byte for byte', () => {
      const original = unzipSync(makeDocx());
      const cleaned = unzipSync(cleanOfficeMetadata(makeDocx()).bytes);

      expect(Object.keys(cleaned).sort()).toEqual(Object.keys(original).sort());

      for (const path of ['word/document.xml', 'word/media/image1.png', '[Content_Types].xml']) {
        expect(Array.from(cleaned[path]))
          .withContext(`${path} mudou`)
          .toEqual(Array.from(original[path]));
      }
    });

    /**
     * O nome de quem salvou por último é o campo que mais vaza — um currículo
     * enviado a dez empresas carrega o nome do computador de casa. Uma busca
     * pelos BYTES do arquivo inteiro é a asserção certa: se ele sobreviveu em
     * qualquer entrada, aparece aqui.
     */
    it('leaves no trace of the author in the file bytes', () => {
      const { bytes } = cleanOfficeMetadata(makeDocx());
      const inflated = Object.values(unzipSync(bytes))
        .map((part) => decoder.decode(part))
        .join('\n');

      expect(inflated).not.toContain('Maria Silva');
      expect(inflated).not.toContain('joao.pc-de-casa');
      expect(inflated).not.toContain('Concorrente S.A.');
      expect(inflated).not.toContain('Diretor Anterior');
    });

    it('keeps the document content readable', () => {
      const { bytes } = cleanOfficeMetadata(makeDocx());
      const doc = decoder.decode(unzipSync(bytes)['word/document.xml']);

      expect(doc).toContain('O conteúdo do documento');
    });

    /**
     * Esvaziar e não REMOVER: o Office recria os elementos que faltam na
     * próxima gravação, e leitores estritos reclamam de um core.xml sem os
     * elementos obrigatórios do Dublin Core. Vazio não carrega informação e não
     * quebra ninguém.
     */
    it('empties the elements rather than deleting them', () => {
      const { bytes } = cleanOfficeMetadata(makeDocx());
      const core = decoder.decode(unzipSync(bytes)['docProps/core.xml']);

      expect(core).toContain('<dc:creator></dc:creator>');
      expect(core).toContain('cp:coreProperties');
    });

    it('preserves the fields named in keep', () => {
      const { bytes } = cleanOfficeMetadata(makeDocx(), ['dc:title']);
      const meta = readOfficeMetadata(bytes, 'docx');

      expect(meta.core.get('dc:title')).toBe('Proposta Comercial');
      expect(meta.core.has('dc:creator')).toBe(false);
      expect(meta.app.has('Company')).toBe(false);
    });

    it('is idempotent — cleaning a clean file removes nothing', () => {
      const once = cleanOfficeMetadata(makeDocx()).bytes;
      const twice = cleanOfficeMetadata(once);

      expect(twice.removed).toBe(0);
    });
  });
});
