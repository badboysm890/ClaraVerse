import { useEffect, useState } from 'react';
import brandService from '../services/brandService';
import { BrandThemeConfig } from '../config/brands'; // Updated import

export function useBrandTheme() {
  const [currentTheme, setCurrentTheme] = useState<BrandThemeConfig | null>(null);

  useEffect(() => {
    const applyTheme = () => {
      const theme = brandService.getCurrentBrandTheme(); // This now returns BrandThemeConfig | null
      if (theme) {
        setCurrentTheme(theme);

        // Direct mapping for primaryColor, secondaryColor, etc.
        const directColorMappings: (keyof BrandThemeConfig)[] = [
          'primaryColor', 'secondaryColor', 'accentColor',
          'backgroundColor', 'textColor', 'successColor',
          'warningColor', 'errorColor'
        ];

        for (const key of directColorMappings) {
          const colorValue = theme[key];
          if (colorValue) {
            // e.g., primaryColor -> --primary-color
            const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            document.documentElement.style.setProperty(cssVarName, colorValue);
          }
        }

        // Handle cssVariableMapping for specific overrides (e.g., Sakura variables)
        if (theme.cssVariableMapping) {
          for (const [cssVar, themeKeyAlias] of Object.entries(theme.cssVariableMapping)) {
            // The themeKeyAlias should be a key of BrandThemeConfig, like "primaryColor"
            // It's not a direct color value.
            const actualThemeKey = themeKeyAlias as keyof BrandThemeConfig;
            const colorValue = theme[actualThemeKey] as string | undefined;
            if (colorValue) {
              document.documentElement.style.setProperty(cssVar, colorValue);
            } else {
              console.warn(`Theme key '${actualThemeKey}' used in cssVariableMapping for '${cssVar}' not found or has no value in theme:`, theme);
            }
          }
        }

        // Fallback for original sakura variables if not covered by cssVariableMapping
        // This part might be redundant if cssVariableMapping is comprehensive
        // or if the design moves away from hardcoded sakura names.
        // For now, let's assume cssVariableMapping is the source of truth for specific vars.
        // If direct sakura values (sakura50, sakura500 etc.) were part of BrandThemeConfig, we would iterate them here.
        // Since they are not, we rely on cssVariableMapping.
        // Example: if brand_configurations.json had:
        // "theme": { "primaryColor": "#DF679F", ..., "cssVariableMapping": { "--sakura-500": "primaryColor" } }
        // The above code handles this.
        // If it had "theme": { "sakura500": "#DF679F" } then we'd need:
        // if (theme.sakura500) document.documentElement.style.setProperty('--sakura500', theme.sakura500);

      }
    };

    applyTheme();

    // TODO: Consider adding a listener for brand changes if brandService implements an event emitter.
    // This would allow dynamic theme updates without a page reload if the brand changes during a session.
    // const handleBrandChange = () => applyTheme();
    // brandService.on('brandChanged', handleBrandChange);
    // return () => brandService.off('brandChanged', handleBrandChange);

  }, []); // Runs once on mount

  return currentTheme;
}
