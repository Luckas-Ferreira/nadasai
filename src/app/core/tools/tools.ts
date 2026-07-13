import { IconName } from '../../shared/ui/icon/icons';
import type { TranslationKey } from '../services/translation.service';

export type ToolId = 'remove-bg' | 'crop' | 'compress' | 'convert' | 'resize';

export interface ToolDef {
  readonly id: ToolId;
  readonly path: string;
  readonly icon: IconName;
  readonly navKey: TranslationKey;
  readonly titleKey: TranslationKey;
  readonly descKey: TranslationKey;
  /** Appended to the filename when this tool produces a result. */
  readonly suffix: string;
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'remove-bg',
    path: 'remove-bg',
    icon: 'remove-bg',
    navKey: 'nav.remove_bg',
    titleKey: 'bg.title',
    descKey: 'bg.subtitle',
    suffix: 'nobg',
  },
  {
    id: 'crop',
    path: 'crop',
    icon: 'crop',
    navKey: 'nav.crop',
    titleKey: 'crop.title',
    descKey: 'crop.subtitle',
    suffix: 'crop',
  },
  {
    id: 'compress',
    path: 'compress',
    icon: 'compress',
    navKey: 'nav.compress',
    titleKey: 'compress.title',
    descKey: 'compress.subtitle',
    suffix: 'min',
  },
  {
    id: 'resize',
    path: 'resize',
    icon: 'resize',
    navKey: 'nav.resize',
    titleKey: 'resize.title',
    descKey: 'resize.subtitle',
    suffix: 'resized',
  },
  {
    id: 'convert',
    path: 'convert',
    icon: 'convert',
    navKey: 'nav.convert',
    titleKey: 'convert.title',
    descKey: 'convert.subtitle',
    suffix: 'converted',
  },
];

export function toolById(id: ToolId): ToolDef {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}
