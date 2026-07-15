import { IconName } from '../../shared/ui/icon/icons';
import type { TranslationKey } from '../services/translation.service';

export type ToolId = 'remove-bg' | 'crop' | 'compress' | 'convert' | 'resize';

/**
 * Per-tool colour. iLoveIMG's identity is that every tool owns a hue; we borrow
 * that, but only for the icon badge and hover ring — the card surface, type and
 * base palette stay slate + blue. Each value maps to a `tone-*` utility and a
 * matching pair of theme-flipping tokens in styles.css; adding a tone means
 * adding it in BOTH places.
 */
export type ToolTone = 'violet' | 'amber' | 'emerald' | 'rose' | 'sky';

export interface ToolDef {
  readonly id: ToolId;
  readonly path: string;
  readonly icon: IconName;
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
    path: 'remove-bg',
    icon: 'remove-bg',
    navKey: 'nav.remove_bg',
    shortKey: 'nav.short.remove_bg',
    titleKey: 'bg.title',
    descKey: 'bg.subtitle',
    suffix: 'nobg',
    tone: 'violet',
  },
  {
    id: 'crop',
    path: 'crop',
    icon: 'crop',
    navKey: 'nav.crop',
    shortKey: 'nav.short.crop',
    titleKey: 'crop.title',
    descKey: 'crop.subtitle',
    suffix: 'crop',
    tone: 'amber',
  },
  {
    id: 'compress',
    path: 'compress',
    icon: 'compress',
    navKey: 'nav.compress',
    shortKey: 'nav.short.compress',
    titleKey: 'compress.title',
    descKey: 'compress.subtitle',
    suffix: 'min',
    tone: 'emerald',
  },
  {
    id: 'resize',
    path: 'resize',
    icon: 'resize',
    navKey: 'nav.resize',
    shortKey: 'nav.short.resize',
    titleKey: 'resize.title',
    descKey: 'resize.subtitle',
    suffix: 'resized',
    tone: 'rose',
  },
  {
    id: 'convert',
    path: 'convert',
    icon: 'convert',
    navKey: 'nav.convert',
    shortKey: 'nav.short.convert',
    titleKey: 'convert.title',
    descKey: 'convert.subtitle',
    suffix: 'converted',
    tone: 'sky',
  },
];

export function toolById(id: ToolId): ToolDef {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}
