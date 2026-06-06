// Shared shape for the rich menu import (ZIP / AI JSON). The same payload is
// produced from an Excel sheet (flat → grouped), a ZIP (menu.json + images),
// or an AI scrape (design + categories + image URLs).

export interface ImportOption {
  name: string;
  price?: number;
}

export interface ImportOptionGroup {
  name: string;
  description?: string;
  required?: boolean;
  multiple?: boolean; // true = choose many, false = choose one
  options: ImportOption[]; // each option's price is an extra cost (0 if free)
}

export interface ImportProduct {
  name: string;
  description?: string | null;
  price?: number | null;
  compareAtPrice?: number | null;
  available?: boolean;
  hidden?: boolean; // not shown on the public menu
  tags?: string[];
  image?: string | null; // ZIP filename, external URL, or an already-hosted URL
  optionGroups?: ImportOptionGroup[]; // dynamic multiselects
  variants?: ImportOption[]; // legacy
  modifiers?: ImportOption[]; // legacy priced extras
  removables?: string[]; // legacy free "remove" options
  prepTime?: string | null;
  calories?: number | null;
}

export interface ImportCategory {
  name: string;
  icon?: string | null;
  products: ImportProduct[];
}

// Theme fields an import may set (colors / fonts / branding).
export interface ImportDesign {
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  text_color?: string;
  text_secondary_color?: string;
  card_color?: string;
  border_color?: string;
  separator_color?: string;
  button_color?: string;
  button_text_color?: string;
  tab_bar_color?: string;
  tab_selected_color?: string;
  tab_unselected_color?: string;
  tab_font_color?: string;
  font_family?: string;
  slogan?: string;
  background_image?: string | null; // filename or URL
}

// Theme columns settable from an import (single source of truth for the server).
export const IMPORT_DESIGN_KEYS = [
  'primary_color', 'secondary_color', 'background_color', 'text_color', 'text_secondary_color',
  'card_color', 'border_color', 'separator_color', 'button_color', 'button_text_color',
  'tab_bar_color', 'tab_selected_color', 'tab_unselected_color', 'tab_font_color',
  'font_family', 'slogan',
] as const;

export interface FullImportPayload {
  design?: ImportDesign;
  categories: ImportCategory[];
}

export interface ImportPreview {
  newCategories: number;
  newProducts: number;
  updatedProducts: number;
  missingProducts: number;
  missingCategories: number;
  hasDesign: boolean;
}
