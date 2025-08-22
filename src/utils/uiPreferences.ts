import { PersonalInfo } from '../db';

// Default UI preferences
export const DEFAULT_UI_PREFERENCES = {
  font_scale: 1.0,
  accent_color: '#ec4899', // Default sakura-500
  font_family: 'system-ui', // Default system font
  font_weight: 'normal' as 'light' | 'normal' | 'medium' | 'semibold',
  line_height: 'normal' as 'tight' | 'normal' | 'relaxed' | 'loose',
  letter_spacing: 'normal' as 'tight' | 'normal' | 'wide',
  // System monitoring
  show_system_monitor: true, // Show system stats in topbar by default
  // Extended theming options
  background_style: 'default' as 'default' | 'warm' | 'cool' | 'minimal' | 'cozy',
  interface_density: 'normal' as 'compact' | 'normal' | 'comfortable',
  border_radius: 'normal' as 'sharp' | 'normal' | 'rounded' | 'soft',
  glassmorphism_strength: 'medium' as 'none' | 'subtle' | 'medium' | 'strong',
  // Enhanced wallpaper settings
  wallpaper_opacity: 0.1,
  wallpaper_blur: 1,
  wallpaper_position: 'center' as 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  wallpaper_size: 'cover' as 'cover' | 'contain' | 'stretch' | 'tile',
  wallpaper_brightness: 1.0,
  wallpaper_contrast: 1.0,
  wallpaper_saturate: 1.0,
};

// Font scale options
export const FONT_SCALE_OPTIONS = [
  { value: 0.75, label: 'Small (75%)', description: 'Compact text for more content' },
  { value: 0.85, label: 'Small+ (85%)', description: 'Slightly smaller text' },
  { value: 1.0, label: 'Normal (100%)', description: 'Default font size' },
  { value: 1.15, label: 'Large (115%)', description: 'Slightly larger text' },
  { value: 1.3, label: 'Large+ (130%)', description: 'Larger text for better readability' },
  { value: 1.5, label: 'Extra Large (150%)', description: 'Maximum font size' },
];

// Font weight options
export const FONT_WEIGHT_OPTIONS = [
  { value: 'light', label: 'Light (300)', description: 'Thin, elegant text' },
  { value: 'normal', label: 'Normal (400)', description: 'Standard weight' },
  { value: 'medium', label: 'Medium (500)', description: 'Slightly bold' },
  { value: 'semibold', label: 'Semibold (600)', description: 'Bold and clear' },
];

// Line height options
export const LINE_HEIGHT_OPTIONS = [
  { value: 'tight', label: 'Tight (1.25)', description: 'Compact line spacing' },
  { value: 'normal', label: 'Normal (1.5)', description: 'Standard line spacing' },
  { value: 'relaxed', label: 'Relaxed (1.75)', description: 'Comfortable reading' },
  { value: 'loose', label: 'Loose (2.0)', description: 'Maximum readability' },
];

// Letter spacing options
export const LETTER_SPACING_OPTIONS = [
  { value: 'tight', label: 'Tight (-0.025em)', description: 'Condensed characters' },
  { value: 'normal', label: 'Normal (0)', description: 'Standard spacing' },
  { value: 'wide', label: 'Wide (0.025em)', description: 'Expanded characters' },
];

// Popular accent color options
export const ACCENT_COLOR_OPTIONS = [
  { value: '#ec4899', label: 'Sakura Pink', description: 'Classic angela pink' },
  { value: '#3b82f6', label: 'Blue', description: 'Professional blue' },
  { value: '#8b5cf6', label: 'Purple', description: 'Royal purple' },
  { value: '#06b6d4', label: 'Cyan', description: 'Ocean cyan' },
  { value: '#10b981', label: 'Green', description: 'Nature green' },
  { value: '#f59e0b', label: 'Amber', description: 'Warm amber' },
  { value: '#ef4444', label: 'Red', description: 'Vibrant red' },
  { value: '#84cc16', label: 'Lime', description: 'Fresh lime' },
];

// Wallpaper position options
export const WALLPAPER_POSITION_OPTIONS = [
  { value: 'center', label: 'Center', description: 'Centered positioning' },
  { value: 'top', label: 'Top', description: 'Aligned to top' },
  { value: 'bottom', label: 'Bottom', description: 'Aligned to bottom' },
  { value: 'left', label: 'Left', description: 'Aligned to left' },
  { value: 'right', label: 'Right', description: 'Aligned to right' },
  { value: 'top-left', label: 'Top Left', description: 'Top-left corner' },
  { value: 'top-right', label: 'Top Right', description: 'Top-right corner' },
  { value: 'bottom-left', label: 'Bottom Left', description: 'Bottom-left corner' },
  { value: 'bottom-right', label: 'Bottom Right', description: 'Bottom-right corner' },
];

// Wallpaper size options
export const WALLPAPER_SIZE_OPTIONS = [
  { value: 'cover', label: 'Cover', description: 'Scale to cover entire area' },
  { value: 'contain', label: 'Contain', description: 'Scale to fit entirely within area' },
  { value: 'stretch', label: 'Stretch', description: 'Stretch to fill exact dimensions' },
  { value: 'tile', label: 'Tile', description: 'Repeat image as tiles' },
];

// Built-in wallpaper collection
export const BUILTIN_WALLPAPERS = [
  {
    id: 'gradient-purple',
    name: 'Purple Gradient',
    description: 'Soft purple to pink gradient',
    category: 'Gradients',
    preview: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzY2N2VlYSIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzc2NGJhMiIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxOTIwIiBoZWlnaHQ9IjEwODAiIGZpbGw9InVybCgjZykiLz48L3N2Zz4='
  },
  {
    id: 'gradient-blue',
    name: 'Ocean Blue',
    description: 'Deep ocean blue gradient',
    category: 'Gradients',
    preview: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzM2N2I5ZCIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzI1NGU3MCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxOTIwIiBoZWlnaHQ9IjEwODAiIGZpbGw9InVybCgjZykiLz48L3N2Zz4='
  },
  {
    id: 'gradient-green',
    name: 'Forest Green',
    description: 'Natural forest gradient',
    category: 'Gradients',
    preview: 'linear-gradient(135deg, #2d5016 0%, #3e7b27 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzJkNTAxNiIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzNlN2IyNyIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxOTIwIiBoZWlnaHQ9IjEwODAiIGZpbGw9InVybCgjZykiLz48L3N2Zz4='
  },
  {
    id: 'gradient-sunset',
    name: 'Sunset Glow',
    description: 'Warm sunset colors',
    category: 'Gradients',
    preview: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2ZmN2U1ZiIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iI2ZlYjQ3YiIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxOTIwIiBoZWlnaHQ9IjEwODAiIGZpbGw9InVybCgjZykiLz48L3N2Zz4='
  },
  {
    id: 'solid-dark',
    name: 'Deep Space',
    description: 'Dark solid background',
    category: 'Solid Colors',
    preview: '#1f2937',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxOTIwIiBoZWlnaHQ9IjEwODAiIGZpbGw9IiMxZjI5MzciLz48L3N2Zz4='
  },
  {
    id: 'gradient-aurora',
    name: 'Aurora Borealis',
    description: 'Northern lights gradient',
    category: 'Gradients',
    preview: 'linear-gradient(45deg, #00b894 0%, #00cec9 25%, #6c5ce7 75%, #a29bfe 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzAwYjg5NCIvPjxzdG9wIG9mZnNldD0iMjUlIiBzdG9wLWNvbG9yPSIjMDBjZWM5Ii8+PHN0b3Agb2Zmc2V0PSI3NSUiIHN0b3AtY29sb3I9IiM2YzVjZTciLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNhMjliZmUiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+'
  },
  {
    id: 'gradient-fire',
    name: 'Fire Glow',
    description: 'Warm fire gradient',
    category: 'Gradients',
    preview: 'linear-gradient(45deg, #ff4757 0%, #ff6b35 50%, #ffa502 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2ZmNDc1NyIvPjxzdG9wIG9mZnNldD0iNTAlIiBzdG9wLWNvbG9yPSIjZmY2YjM1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZmZhNTAyIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjE5MjAiIGhlaWdodD0iMTA4MCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=='
  },
  {
    id: 'gradient-ice',
    name: 'Ice Crystal',
    description: 'Cool ice gradient',
    category: 'Gradients',
    preview: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 50%, #6c5ce7 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzc0YjlmZiIvPjxzdG9wIG9mZnNldD0iNTAlIiBzdG9wLWNvbG9yPSIjMDk4NGUzIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjNmM1Y2U3Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjE5MjAiIGhlaWdodD0iMTA4MCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=='
  },
  {
    id: 'gradient-cosmic',
    name: 'Cosmic Dust',
    description: 'Deep space gradient',
    category: 'Gradients',
    preview: 'linear-gradient(225deg, #2d3436 0%, #636e72 50%, #74b9ff 100%)',
    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzJkMzQzNiIvPjxzdG9wIG9mZnNldD0iNTAlIiBzdG9wLWNvbG9yPSIjNjM2ZTcyIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjNzRiOWZmIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjE5MjAiIGhlaWdodD0iMTA4MCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=='
  },
];

// Convert hex to RGB values for CSS custom properties
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Generate color shades from base color
export function generateColorShades(hexColor: string) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return null;

  const { r, g, b } = rgb;

  // Generate lighter and darker shades
  const shades = {
    50: lighten(r, g, b, 0.95),
    100: lighten(r, g, b, 0.85),
    200: lighten(r, g, b, 0.7),
    300: lighten(r, g, b, 0.5),
    400: lighten(r, g, b, 0.3),
    500: `${r} ${g} ${b}`, // Base color
    600: darken(r, g, b, 0.1),
    700: darken(r, g, b, 0.25),
    800: darken(r, g, b, 0.4),
    900: darken(r, g, b, 0.55),
  };

  return shades;
}

function lighten(r: number, g: number, b: number, factor: number): string {
  const newR = Math.round(r + (255 - r) * factor);
  const newG = Math.round(g + (255 - g) * factor);
  const newB = Math.round(b + (255 - b) * factor);
  return `${newR} ${newG} ${newB}`;
}

function darken(r: number, g: number, b: number, factor: number): string {
  const newR = Math.round(r * (1 - factor));
  const newG = Math.round(g * (1 - factor));
  const newB = Math.round(b * (1 - factor));
  return `${newR} ${newG} ${newB}`;
}

// AI-Inspired fonts commonly used by popular AI interfaces
export const SYSTEM_FONTS = [
  // Popular AI Interface Fonts
  { value: 'system-ui', label: 'System Default', description: 'Your system\'s default font', category: 'System' },
  { value: '"Söhne", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif', label: 'Söhne', description: 'ChatGPT\'s signature font family', category: 'AI Interface' },
  { value: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'Inter', description: 'Modern, clean interface font', category: 'AI Interface' },
  { value: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif', label: 'SF Pro Display', description: 'Apple\'s premium display font', category: 'AI Interface' },
  { value: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif', label: 'Segoe UI', description: 'Microsoft\'s modern system font', category: 'AI Interface' },
  { value: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', label: 'Roboto', description: 'Google\'s Material Design font', category: 'AI Interface' },
  
  // Professional & Modern Fonts
  { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: 'Helvetica Neue', description: 'Classic modern sans-serif', category: 'Professional' },
  { value: '"Open Sans", -apple-system, BlinkMacSystemFont, sans-serif', label: 'Open Sans', description: 'Friendly and open character', category: 'Professional' },
  { value: '"Lato", -apple-system, BlinkMacSystemFont, sans-serif', label: 'Lato', description: 'Humanist sans-serif', category: 'Professional' },
  { value: '"Source Sans Pro", -apple-system, BlinkMacSystemFont, sans-serif', label: 'Source Sans Pro', description: 'Adobe\'s clean sans-serif', category: 'Professional' },
  { value: '"Nunito", -apple-system, BlinkMacSystemFont, sans-serif', label: 'Nunito', description: 'Rounded, friendly appearance', category: 'Professional' },
  
  // Reading & Content Fonts
  { value: '"Charter", "Bitstream Charter", "Sitka Text", Cambria, serif', label: 'Charter', description: 'Optimized for reading', category: 'Reading' },
  { value: '"Georgia", "Times New Roman", Times, serif', label: 'Georgia', description: 'Screen-optimized serif', category: 'Reading' },
  { value: '"Crimson Text", Georgia, serif', label: 'Crimson Text', description: 'Book-style serif font', category: 'Reading' },
  { value: '"Merriweather", Georgia, serif', label: 'Merriweather', description: 'Designed for readability', category: 'Reading' },
  
  // Monospace & Code Fonts
  { value: '"SF Mono", Monaco, Inconsolata, "Roboto Mono", monospace', label: 'SF Mono', description: 'Apple\'s monospace font', category: 'Code' },
  { value: '"Fira Code", "SF Mono", Monaco, Consolas, monospace', label: 'Fira Code', description: 'Programming font with ligatures', category: 'Code' },
  { value: '"JetBrains Mono", "SF Mono", Monaco, Consolas, monospace', label: 'JetBrains Mono', description: 'Developer-focused monospace', category: 'Code' },
  { value: '"Source Code Pro", Monaco, Consolas, monospace', label: 'Source Code Pro', description: 'Adobe\'s monospace font', category: 'Code' },
  { value: '"Consolas", "SF Mono", Monaco, monospace', label: 'Consolas', description: 'Microsoft\'s ClearType font', category: 'Code' },
  
  // Classic & Fallback Fonts
  { value: 'Arial, sans-serif', label: 'Arial', description: 'Universal sans-serif', category: 'Classic' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica', description: 'Timeless Swiss design', category: 'Classic' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman', description: 'Traditional serif', category: 'Classic' },
  { value: 'Courier, "Courier New", monospace', label: 'Courier', description: 'Typewriter-style font', category: 'Classic' },
];

// Comprehensive visual presets inspired by popular AI interfaces
export const FONT_PRESETS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT Style',
    description: 'Clean and modern like OpenAI\'s ChatGPT',
    icon: '🤖',
    settings: {
      font_family: '"Söhne", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
      font_scale: 1.0,
      line_height: 'relaxed' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'normal' as const,
      accent_color: '#10a37f', // ChatGPT's signature green
      background_style: 'default' as const,
      interface_density: 'normal' as const,
      border_radius: 'normal' as const,
      glassmorphism_strength: 'subtle' as const
    }
  },
  {
    id: 'claude',
    name: 'Claude Style', 
    description: 'Elegant and readable like Anthropic\'s Claude',
    icon: '🎭',
    settings: {
      font_family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      font_scale: 1.0,
      line_height: 'relaxed' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'normal' as const,
      accent_color: '#cc785c', // Claude's warm orange-brown
      background_style: 'warm' as const,
      interface_density: 'comfortable' as const,
      border_radius: 'rounded' as const,
      glassmorphism_strength: 'medium' as const
    }
  },
  {
    id: 'gemini',
    name: 'Gemini Style',
    description: 'Google\'s clean and professional look',
    icon: '💎',
    settings: {
      font_family: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      font_scale: 1.0,
      line_height: 'normal' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'normal' as const,
      accent_color: '#4285f4', // Google Blue
      background_style: 'cool' as const,
      interface_density: 'normal' as const,
      border_radius: 'normal' as const,
      glassmorphism_strength: 'subtle' as const
    }
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot Style',
    description: 'Developer-friendly interface',
    icon: '🧑‍💻',
    settings: {
      font_family: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
      font_scale: 0.95,
      line_height: 'normal' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'medium' as const,
      accent_color: '#7c3aed', // GitHub Copilot Purple
      background_style: 'minimal' as const,
      interface_density: 'compact' as const,
      border_radius: 'sharp' as const,
      glassmorphism_strength: 'none' as const
    }
  },
  {
    id: 'notion',
    name: 'Notion Style',
    description: 'Clean workspace aesthetic',
    icon: '📝',
    settings: {
      font_family: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      font_scale: 1.0,
      line_height: 'relaxed' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'normal' as const,
      accent_color: '#2f1b69', // Notion's dark purple
      background_style: 'minimal' as const,
      interface_density: 'comfortable' as const,
      border_radius: 'normal' as const,
      glassmorphism_strength: 'subtle' as const
    }
  },
  {
    id: 'perplexity',
    name: 'Perplexity Style',
    description: 'Search-focused AI interface',
    icon: '🔍',
    settings: {
      font_family: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      font_scale: 0.95,
      line_height: 'normal' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'medium' as const,
      accent_color: '#0ea5e9', // Perplexity's sky blue
      background_style: 'cool' as const,
      interface_density: 'compact' as const,
      border_radius: 'rounded' as const,
      glassmorphism_strength: 'medium' as const
    }
  },
  {
    id: 'readwise',
    name: 'Reading Optimized',
    description: 'Perfect for long conversations',
    icon: '📚',
    settings: {
      font_family: '"Charter", "Bitstream Charter", "Sitka Text", Cambria, serif',
      font_scale: 1.1,
      line_height: 'loose' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'normal' as const,
      accent_color: '#f59e0b', // Warm amber for reading comfort
      background_style: 'cozy' as const,
      interface_density: 'comfortable' as const,
      border_radius: 'soft' as const,
      glassmorphism_strength: 'strong' as const
    }
  },
  {
    id: 'minimal',
    name: 'Minimal Clean',
    description: 'Ultra-clean minimalist style',
    icon: '⚪',
    settings: {
      font_family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      font_scale: 0.95,
      line_height: 'tight' as const,
      letter_spacing: 'tight' as const,
      font_weight: 'light' as const,
      accent_color: '#6b7280', // Minimal gray
      background_style: 'minimal' as const,
      interface_density: 'compact' as const,
      border_radius: 'sharp' as const,
      glassmorphism_strength: 'none' as const
    }
  },
  {
    id: 'accessibility',
    name: 'High Readability',
    description: 'Optimized for accessibility',
    icon: '♿',
    settings: {
      font_family: '"Open Sans", -apple-system, BlinkMacSystemFont, sans-serif',
      font_scale: 1.2,
      line_height: 'loose' as const,
      letter_spacing: 'wide' as const,
      font_weight: 'medium' as const,
      accent_color: '#059669', // High contrast green
      background_style: 'default' as const,
      interface_density: 'comfortable' as const,
      border_radius: 'rounded' as const,
      glassmorphism_strength: 'subtle' as const
    }
  },
  {
    id: 'discord',
    name: 'Discord Style',
    description: 'Gaming and community focused',
    icon: '🎮',
    settings: {
      font_family: '"Whitney", "Helvetica Neue", Helvetica, Arial, sans-serif',
      font_scale: 1.0,
      line_height: 'normal' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'medium' as const,
      accent_color: '#5865f2', // Discord Blurple
      background_style: 'cool' as const,
      interface_density: 'normal' as const,
      border_radius: 'rounded' as const,
      glassmorphism_strength: 'medium' as const
    }
  },
  {
    id: 'linear',
    name: 'Linear Style',
    description: 'Clean and efficient design',
    icon: '📐',
    settings: {
      font_family: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      font_scale: 0.95,
      line_height: 'tight' as const,
      letter_spacing: 'tight' as const,
      font_weight: 'medium' as const,
      accent_color: '#6366f1', // Linear's indigo
      background_style: 'minimal' as const,
      interface_density: 'compact' as const,
      border_radius: 'normal' as const,
      glassmorphism_strength: 'subtle' as const
    }
  },
  {
    id: 'apple',
    name: 'Apple Style',
    description: 'Premium and polished interface',
    icon: '🍎',
    settings: {
      font_family: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
      font_scale: 1.0,
      line_height: 'normal' as const,
      letter_spacing: 'normal' as const,
      font_weight: 'normal' as const,
      accent_color: '#007aff', // Apple Blue
      background_style: 'default' as const,
      interface_density: 'normal' as const,
      border_radius: 'soft' as const,
      glassmorphism_strength: 'strong' as const
    }
  }
];

// Detect available system fonts
export async function detectSystemFonts(): Promise<{ value: string; label: string; description: string; category: string }[]> {
  const fonts = [...SYSTEM_FONTS];
  
  // Test for additional popular fonts
  const testFonts = [
    { family: 'Open Sans', description: 'Popular web font' },
    { family: 'Lato', description: 'Humanist sans-serif' },
    { family: 'Montserrat', description: 'Geometric sans-serif' },
    { family: 'Source Sans Pro', description: 'Adobe\'s sans-serif' },
    { family: 'Poppins', description: 'Modern geometric font' },
    { family: 'Nunito', description: 'Rounded sans-serif' },
    { family: 'Raleway', description: 'Elegant display font' },
  ];

  // Check font availability using font loading API
  if ('fonts' in document) {
    for (const testFont of testFonts) {
      try {
        const available = await document.fonts.check(`12px "${testFont.family}"`);
        if (available) {
          fonts.push({
            value: `${testFont.family}, system-ui, sans-serif`,
            label: testFont.family,
            description: testFont.description,
            category: 'Web Fonts'
          });
        }
      } catch (error) {
        // Font check failed, skip this font
        console.debug(`Font check failed for ${testFont.family}:`, error);
      }
    }
  }

  return fonts;
}

// Apply UI preferences to the document
export function applyUIPreferences(personalInfo: PersonalInfo | null) {
  const uiPrefs = personalInfo?.ui_preferences || DEFAULT_UI_PREFERENCES;
  const root = document.documentElement;

  // Apply font scaling
  root.style.setProperty('--font-scale', uiPrefs.font_scale.toString());

  // Apply font family
  root.style.setProperty('--font-family', uiPrefs.font_family || DEFAULT_UI_PREFERENCES.font_family);

  // Apply accent color
  const colorShades = generateColorShades(uiPrefs.accent_color);
  if (colorShades) {
    // Set sakura color variables to the chosen accent color
    Object.entries(colorShades).forEach(([shade, rgb]) => {
      root.style.setProperty(`--sakura-${shade}`, rgb);
    });
  }
}

// Initialize UI preferences on app start
export function initializeUIPreferences() {
  // Set up CSS custom properties for font scaling
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --font-scale: 1;
      --base-font-size: 1rem;
      --scaled-font-size: calc(var(--base-font-size) * var(--font-scale));
    }
    
    /* Apply font scaling to all text elements */
    body {
      font-size: var(--scaled-font-size);
    }
    
    /* Scale specific text sizes proportionally */
    .text-xs { font-size: calc(0.75rem * var(--font-scale)); }
    .text-sm { font-size: calc(0.875rem * var(--font-scale)); }
    .text-base { font-size: calc(1rem * var(--font-scale)); }
    .text-lg { font-size: calc(1.125rem * var(--font-scale)); }
    .text-xl { font-size: calc(1.25rem * var(--font-scale)); }
    .text-2xl { font-size: calc(1.5rem * var(--font-scale)); }
    .text-3xl { font-size: calc(1.875rem * var(--font-scale)); }
    .text-4xl { font-size: calc(2.25rem * var(--font-scale)); }
    .text-5xl { font-size: calc(3rem * var(--font-scale)); }
    
    /* Update Tailwind color classes to use custom properties */
    .text-sakura-500 { color: rgb(var(--sakura-500) / var(--tw-text-opacity, 1)); }
    .bg-sakura-500 { background-color: rgb(var(--sakura-500) / var(--tw-bg-opacity, 1)); }
    .border-sakura-500 { border-color: rgb(var(--sakura-500) / var(--tw-border-opacity, 1)); }
    .text-sakura-400 { color: rgb(var(--sakura-400) / var(--tw-text-opacity, 1)); }
    .bg-sakura-400 { background-color: rgb(var(--sakura-400) / var(--tw-bg-opacity, 1)); }
    .border-sakura-400 { border-color: rgb(var(--sakura-400) / var(--tw-border-opacity, 1)); }
    .text-sakura-600 { color: rgb(var(--sakura-600) / var(--tw-text-opacity, 1)); }
    .bg-sakura-600 { background-color: rgb(var(--sakura-600) / var(--tw-bg-opacity, 1)); }
    .border-sakura-600 { border-color: rgb(var(--sakura-600) / var(--tw-border-opacity, 1)); }
    .text-sakura-300 { color: rgb(var(--sakura-300) / var(--tw-text-opacity, 1)); }
    .bg-sakura-300 { background-color: rgb(var(--sakura-300) / var(--tw-bg-opacity, 1)); }
    .border-sakura-300 { border-color: rgb(var(--sakura-300) / var(--tw-border-opacity, 1)); }
    .text-sakura-700 { color: rgb(var(--sakura-700) / var(--tw-text-opacity, 1)); }
    .bg-sakura-700 { background-color: rgb(var(--sakura-700) / var(--tw-bg-opacity, 1)); }
    .border-sakura-700 { border-color: rgb(var(--sakura-700) / var(--tw-border-opacity, 1)); }
    .text-sakura-100 { color: rgb(var(--sakura-100) / var(--tw-text-opacity, 1)); }
    .bg-sakura-100 { background-color: rgb(var(--sakura-100) / var(--tw-bg-opacity, 1)); }
    .border-sakura-100 { border-color: rgb(var(--sakura-100) / var(--tw-border-opacity, 1)); }
    .text-sakura-50 { color: rgb(var(--sakura-50) / var(--tw-text-opacity, 1)); }
    .bg-sakura-50 { background-color: rgb(var(--sakura-50) / var(--tw-bg-opacity, 1)); }
    .border-sakura-50 { border-color: rgb(var(--sakura-50) / var(--tw-border-opacity, 1)); }
    .text-sakura-800 { color: rgb(var(--sakura-800) / var(--tw-text-opacity, 1)); }
    .bg-sakura-800 { background-color: rgb(var(--sakura-800) / var(--tw-bg-opacity, 1)); }
    .border-sakura-800 { border-color: rgb(var(--sakura-800) / var(--tw-border-opacity, 1)); }
    .text-sakura-900 { color: rgb(var(--sakura-900) / var(--tw-text-opacity, 1)); }
    .bg-sakura-900 { background-color: rgb(var(--sakura-900) / var(--tw-bg-opacity, 1)); }
    .border-sakura-900 { border-color: rgb(var(--sakura-900) / var(--tw-border-opacity, 1)); }
    .text-sakura-200 { color: rgb(var(--sakura-200) / var(--tw-text-opacity, 1)); }
    .bg-sakura-200 { background-color: rgb(var(--sakura-200) / var(--tw-bg-opacity, 1)); }
    .border-sakura-200 { border-color: rgb(var(--sakura-200) / var(--tw-border-opacity, 1)); }
    
    /* Hover and focus states */
    .hover\\:bg-sakura-600:hover { background-color: rgb(var(--sakura-600) / var(--tw-bg-opacity, 1)); }
    .hover\\:bg-sakura-100:hover { background-color: rgb(var(--sakura-100) / var(--tw-bg-opacity, 1)); }
    .hover\\:border-sakura-300:hover { border-color: rgb(var(--sakura-300) / var(--tw-border-opacity, 1)); }
    .focus\\:border-sakura-300:focus { border-color: rgb(var(--sakura-300) / var(--tw-border-opacity, 1)); }
    .focus\\:ring-sakura-300:focus { --tw-ring-color: rgb(var(--sakura-300) / var(--tw-ring-opacity, 1)); }
    .focus\\:ring-sakura-500:focus { --tw-ring-color: rgb(var(--sakura-500) / var(--tw-ring-opacity, 1)); }
    
    /* Dark mode variants */
    .dark .dark\\:bg-sakura-900\\/20 { background-color: rgb(var(--sakura-900) / 0.2); }
    .dark .dark\\:text-sakura-400 { color: rgb(var(--sakura-400) / var(--tw-text-opacity, 1)); }
    .dark .dark\\:text-sakura-300 { color: rgb(var(--sakura-300) / var(--tw-text-opacity, 1)); }
    
    /* Peer states */
    .peer-checked\\:bg-sakura-500 { background-color: rgb(var(--sakura-500) / var(--tw-bg-opacity, 1)); }
    .peer-checked\\:bg-sakura-600 { background-color: rgb(var(--sakura-600) / var(--tw-bg-opacity, 1)); }
  `;
  
  document.head.appendChild(style);
}
