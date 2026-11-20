import { AccentChoice, ThemeChoice } from './theme';

export interface ThemeOption {
  value: ThemeChoice;
  label: string;
  hint: string;
  /** Miniature of the shell: the sidebar and the content pane (null: the accent). */
  sidebar: string | null;
  pane: string;
}

/** The themes, in the order the pickers show them (also used by the account menu). */
export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'dark', label: 'Dark', hint: 'The default', sidebar: '#171d25', pane: '#14191f' },
  { value: 'dim', label: 'Dim', hint: 'Dark, but softer', sidebar: '#2a2f37', pane: '#23272e' },
  { value: 'black', label: 'Black', hint: 'Near black, for dark rooms', sidebar: '#0b0b0d', pane: '#000000' },
  { value: 'deep', label: 'Deep', hint: 'Dark, sidebar in your accent colour', sidebar: null, pane: '#14191f' },
  { value: 'light', label: 'Light', hint: 'Light panels, coloured sidebar', sidebar: null, pane: '#ffffff' },
  { value: 'white', label: 'White', hint: 'All white, sidebar included', sidebar: '#ffffff', pane: '#f6f7f9' },
  { value: 'sepia', label: 'Sepia', hint: 'Warm and easy on the eyes', sidebar: '#f2ebdf', pane: '#fbf7f0' },
  { value: 'contrast', label: 'High contrast', hint: 'Black on white, strong lines', sidebar: '#000000', pane: '#ffffff' },
  { value: 'contrast-dark', label: 'High contrast dark', hint: 'White on black, strong lines', sidebar: '#000000', pane: '#000000' },
  { value: 'system', label: 'System', hint: 'Dark or light, like your device', sidebar: '#171d25', pane: '' },
];

export const ACCENT_OPTIONS: { value: AccentChoice; label: string; color: string }[] = [
  { value: 'blue', label: 'Blue', color: '#0051fe' },
  { value: 'purple', label: 'Purple', color: '#7c3aed' },
  { value: 'green', label: 'Green', color: '#15924a' },
  { value: 'teal', label: 'Teal', color: '#0e8a80' },
  { value: 'orange', label: 'Orange', color: '#e0570f' },
  { value: 'pink', label: 'Pink', color: '#d61f69' },
];
