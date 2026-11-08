import type { TrayType } from '#lib/stores/project.svelte.js';

export interface TrayTypeOption {
  value: Exclude<TrayType, 'card'>;
  label: string;
  description: string;
}

// Entries of the "Add tray / box / loose tray" popovers (one list for all three)
export const TRAY_TYPE_OPTIONS: TrayTypeOption[] = [
  { value: 'counter', label: 'Counters', description: 'Stacks of geometric tokens' },
  { value: 'cardDraw', label: 'Card draw', description: 'Single stack of cards, draw from top' },
  { value: 'cardDivider', label: 'Card divider', description: 'Divided stacks of cards, divided by walls' },
  { value: 'cardWell', label: 'Card well', description: 'Flat stacks of cards' },
  { value: 'cup', label: 'Cup tray', description: 'Bowl-shaped cups for dice and tokens' },
  { value: 'standee', label: 'Standees', description: 'Slotted tray for vertical standees' },
  { value: 'tile', label: 'Tiles', description: 'Slotted bars for flat tiles and cards' }
];
