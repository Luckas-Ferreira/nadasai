import { IconName } from '../../shared/ui/icon/icons';
import type { TranslationKey } from '../services/translation.service';

export type ToolId =
  | 'remove-bg'
  | 'crop'
  | 'compress'
  | 'convert'
  | 'resize'
  | 'img-to-pdf'
  | 'edit-pdf'
  | 'merge-pdf'
  | 'compress-pdf'
  | 'split-pdf'
  | 'pdf-to-img'
  | 'organize-pdf'
  | 'protect-pdf'
  | 'sign-pdf'
  | 'watermark-pdf';

/**
 * Per-tool colour. iLoveIMG's identity is that every tool owns a hue; we borrow
 * that, but only for the icon badge and hover ring — the card surface, type and
 * base palette stay slate + blue. Each value maps to a `tone-*` utility and a
 * matching pair of theme-flipping tokens in styles.css; adding a tone means
 * adding it in BOTH places.
 */
export type ToolTone =
  | 'violet'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'sky'
  | 'orange'
  | 'indigo'
  | 'teal'
  | 'fuchsia';

export type ToolCategory = 'image' | 'pdf';

/**
 * A module is a family of tools, and it is the unit the shell navigates by.
 *
 * The rail lists the tools of ONE module — never all of them — because the tool
 * list grows with every module while the viewport does not. At 15 tools the old
 * global rail already ran past the bottom of a 700px window with no scroll, and
 * the fix is not a scrollbar: it is scoping the list to what you are working on.
 * So the length of the rail depends on the size of a module, and adding the
 * fourth or the tenth module costs nothing in that layout.
 *
 * Adding a module is: an id here, an entry in MODULES, the two dictionary keys,
 * and tools carrying that `category`. The rail, the switcher, the palette, the
 * mobile bar and the home grid all read from this.
 */
export type ModuleId = ToolCategory;

export interface ModuleDef {
  readonly id: ModuleId;
  readonly icon: IconName;
  readonly nameKey: TranslationKey;
  readonly descKey: TranslationKey;
  /** Same `tone-*` contract as ToolDef: the value must exist in styles.css. */
  readonly tone: ToolTone;
}

export const MODULES: readonly ModuleDef[] = [
  { id: 'image', icon: 'image', nameKey: 'module.image', descKey: 'module.image_desc', tone: 'sky' },
  { id: 'pdf', icon: 'pdf', nameKey: 'module.pdf', descKey: 'module.pdf_desc', tone: 'rose' },
];

export interface ToolDef {
  readonly id: ToolId;
  readonly pathPt: string;
  readonly pathEn: string;
  readonly icon: IconName;
  readonly category: ToolCategory;
  readonly navKey: TranslationKey;
  /** One-word label for tight surfaces (the mobile tab bar), where navKey wraps. */
  readonly shortKey: TranslationKey;
  readonly titleKey: TranslationKey;
  readonly descKey: TranslationKey;
  /** Appended to the filename when this tool produces a result. */
  readonly suffix: string;
  /** Drives the `tone-<value>` utility on the icon badge and hover ring. */
  readonly tone: ToolTone;
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'remove-bg',
    pathPt: 'imagem/remover-fundo',
    pathEn: 'image/remove-bg',
    icon: 'remove-bg',
    category: 'image',
    navKey: 'nav.remove_bg',
    shortKey: 'nav.short.remove_bg',
    titleKey: 'bg.title',
    descKey: 'bg.subtitle',
    suffix: 'nobg',
    tone: 'violet',
  },
  {
    id: 'crop',
    pathPt: 'imagem/cortar',
    pathEn: 'image/crop',
    icon: 'crop',
    category: 'image',
    navKey: 'nav.crop',
    shortKey: 'nav.short.crop',
    titleKey: 'crop.title',
    descKey: 'crop.subtitle',
    suffix: 'crop',
    tone: 'amber',
  },
  {
    id: 'compress',
    pathPt: 'imagem/comprimir',
    pathEn: 'image/compress',
    icon: 'compress',
    category: 'image',
    navKey: 'nav.compress',
    shortKey: 'nav.short.compress',
    titleKey: 'compress.title',
    descKey: 'compress.subtitle',
    suffix: 'min',
    tone: 'emerald',
  },
  {
    id: 'resize',
    pathPt: 'imagem/redimensionar',
    pathEn: 'image/resize',
    icon: 'resize',
    category: 'image',
    navKey: 'nav.resize',
    shortKey: 'nav.short.resize',
    titleKey: 'resize.title',
    descKey: 'resize.subtitle',
    suffix: 'resized',
    tone: 'rose',
  },
  {
    id: 'convert',
    pathPt: 'imagem/converter',
    pathEn: 'image/convert',
    icon: 'convert',
    category: 'image',
    navKey: 'nav.convert',
    shortKey: 'nav.short.convert',
    titleKey: 'convert.title',
    descKey: 'convert.subtitle',
    suffix: 'converted',
    tone: 'sky',
  },
  {
    id: 'img-to-pdf',
    pathPt: 'imagem/para-pdf',
    pathEn: 'image/to-pdf',
    icon: 'images',
    category: 'image',
    navKey: 'nav.img_to_pdf',
    shortKey: 'nav.short.img_to_pdf',
    titleKey: 'imgpdf.title',
    descKey: 'imgpdf.subtitle',
    suffix: 'pdf',
    tone: 'indigo',
  },
  {
    id: 'edit-pdf',
    pathPt: 'pdf/editar',
    pathEn: 'pdf/edit',
    icon: 'pdf',
    category: 'pdf',
    navKey: 'nav.pdf',
    shortKey: 'nav.short.pdf',
    titleKey: 'pdf.title',
    descKey: 'pdf.subtitle',
    suffix: 'edited',
    tone: 'orange',
  },
  {
    id: 'merge-pdf',
    pathPt: 'pdf/juntar',
    pathEn: 'pdf/merge',
    icon: 'merge',
    category: 'pdf',
    navKey: 'nav.merge_pdf',
    shortKey: 'nav.short.merge_pdf',
    titleKey: 'mergepdf.title',
    descKey: 'mergepdf.subtitle',
    suffix: 'merged',
    tone: 'teal',
  },
  {
    id: 'compress-pdf',
    pathPt: 'pdf/comprimir',
    pathEn: 'pdf/compress',
    icon: 'compress',
    category: 'pdf',
    navKey: 'nav.compress_pdf',
    shortKey: 'nav.short.compress_pdf',
    titleKey: 'cpdf.title',
    descKey: 'cpdf.subtitle',
    suffix: 'min',
    tone: 'fuchsia',
  },
  {
    id: 'split-pdf',
    pathPt: 'pdf/dividir',
    pathEn: 'pdf/split',
    icon: 'split',
    category: 'pdf',
    navKey: 'nav.split_pdf',
    shortKey: 'nav.short.split_pdf',
    titleKey: 'splitpdf.title',
    descKey: 'splitpdf.subtitle',
    suffix: 'split',
    tone: 'rose',
  },
  {
    id: 'pdf-to-img',
    pathPt: 'pdf/para-imagem',
    pathEn: 'pdf/to-image',
    icon: 'image',
    category: 'pdf',
    navKey: 'nav.pdf_to_img',
    shortKey: 'nav.short.pdf_to_img',
    titleKey: 'pdf2img.title',
    descKey: 'pdf2img.subtitle',
    suffix: 'img',
    tone: 'amber',
  },
  {
    id: 'organize-pdf',
    pathPt: 'pdf/organizar',
    pathEn: 'pdf/organize',
    icon: 'doc',
    category: 'pdf',
    navKey: 'nav.organize_pdf',
    shortKey: 'nav.short.organize_pdf',
    titleKey: 'orgpdf.title',
    descKey: 'orgpdf.subtitle',
    suffix: 'organized',
    tone: 'emerald',
  },
  {
    id: 'protect-pdf',
    pathPt: 'pdf/proteger',
    pathEn: 'pdf/protect',
    icon: 'lock',
    category: 'pdf',
    navKey: 'nav.protect_pdf',
    shortKey: 'nav.short.protect_pdf',
    titleKey: 'protpdf.title',
    descKey: 'protpdf.subtitle',
    suffix: 'protected',
    tone: 'indigo',
  },
  {
    id: 'sign-pdf',
    pathPt: 'pdf/assinar',
    pathEn: 'pdf/sign',
    icon: 'brush',
    category: 'pdf',
    navKey: 'nav.sign_pdf',
    shortKey: 'nav.short.sign_pdf',
    titleKey: 'signpdf.title',
    descKey: 'signpdf.subtitle',
    suffix: 'signed',
    tone: 'emerald',
  },
  {
    id: 'watermark-pdf',
    pathPt: 'pdf/marca-dagua',
    pathEn: 'pdf/watermark',
    icon: 'image',
    category: 'pdf',
    navKey: 'nav.watermark_pdf',
    shortKey: 'nav.short.watermark_pdf',
    titleKey: 'wmpdf.title',
    descKey: 'wmpdf.subtitle',
    suffix: 'watermarked',
    tone: 'sky',
  },
];

export function toolById(id: ToolId): ToolDef {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

export function moduleById(id: ModuleId): ModuleDef {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown module: ${id}`);
  return found;
}

/** The tools of one module, in declaration order — which is the order the rail shows. */
export function toolsOfModule(id: ModuleId): readonly ToolDef[] {
  return TOOLS.filter((t) => t.category === id);
}

/**
 * The localized path of a tool, without the language prefix.
 *
 * Every template used to inline `lang === 'en' ? tool.pathEn : tool.pathPt`, so
 * each new nav surface repeated the conditional and any of them could drift.
 */
export function toolPath(tool: ToolDef, lang: 'pt' | 'en'): string {
  return lang === 'en' ? tool.pathEn : tool.pathPt;
}

/**
 * Resolves a router URL back to the tool it belongs to, matching either language.
 *
 * Matching the *path* rather than tracking navigation by hand is what keeps this
 * honest across the legacy redirects: `/remove-bg` and `/imagem/remover-fundo`
 * both land on `/pt/imagem/remover-fundo`, and only the final URL is consulted.
 */
export function toolFromUrl(url: string): ToolDef | null {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return (
    TOOLS.find((t) => path.endsWith(`/${t.pathPt}`) || path.endsWith(`/${t.pathEn}`)) ?? null
  );
}
