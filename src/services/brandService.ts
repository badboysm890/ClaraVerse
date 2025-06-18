import {
  MasterBrandConfig,
  BrandConfig,
  BrandThemeConfig,
  BrandAssetsConfig,
  BrandPricingConfig,
  RegionalPricingDetail,
  BrandFeatureFlags,
  BrandContentConfig,
  BrandMarketingCopyConfig,
  BrandIntegrationsConfig,
  BrandComplianceConfig
} from '../config/brands/index.ts'; // Adjusted path if your types are directly in index.ts
import masterConfigData from '../config/brand_configurations.json';

const masterConfig = masterConfigData as MasterBrandConfig;

// Ensure window.electron is typed correctly if not already
declare global {
  interface Window {
    electron?: {
      getActiveBrandId: () => Promise<string>;
      setActiveBrandId: (brandId: string) => void;
      // Add other electron methods here if/when you expose them
    };
  }
}

class BrandService {
  private activeBrandId: string = masterConfig.defaultBrandId; // Use default from master config
  private currentBrandConfig: BrandConfig | null = null;

  constructor() {
    // Synchronous part of initialization: set initial activeBrandId
    // and try to load initial config. Full async init is in init().
    this.activeBrandId = masterConfig.defaultBrandId;
    this.currentBrandConfig = masterConfig.brands[this.activeBrandId] || null;

    if (!this.currentBrandConfig) {
      console.error(
        `Default brand configuration for ID '${this.activeBrandId}' not found at construction. This should not happen if brand_configurations.json is valid.`
      );
    }
  }

  private async loadInitialConfig() {
    let brandIdToLoad = masterConfig.defaultBrandId;
    try {
      if (window.electron && typeof window.electron.getActiveBrandId === 'function') {
        const brandIdFromMain = await window.electron.getActiveBrandId();
        if (brandIdFromMain && masterConfig.brands[brandIdFromMain]) {
          brandIdToLoad = brandIdFromMain;
        } else if (brandIdFromMain) {
          console.warn(`Brand ID '${brandIdFromMain}' from main process not found in masterConfig. Falling back to default.`);
        }
      } else {
        console.warn('window.electron.getActiveBrandId is not available, using default brand ID from masterConfig.');
      }
    } catch (error) {
      console.warn('Failed to get active brand ID from main process, using default:', error);
    }

    this.activeBrandId = brandIdToLoad;
    this.currentBrandConfig = masterConfig.brands[this.activeBrandId] || null;

    if (!this.currentBrandConfig) {
      console.error(`Brand configuration for ID '${this.activeBrandId}' not found. This is unexpected.`);
      // Attempt to fall back to masterConfig.defaultBrandId if activeBrandId was somehow different and invalid
      if (this.activeBrandId !== masterConfig.defaultBrandId) {
          this.activeBrandId = masterConfig.defaultBrandId;
          this.currentBrandConfig = masterConfig.brands[this.activeBrandId] || null;
          if (!this.currentBrandConfig) {
              console.error(`CRITICAL: Default brand '${masterConfig.defaultBrandId}' also not found in masterConfig.`);
          }
      }
    }
  }

  public async init() {
    await this.loadInitialConfig();
  }

  public getCurrentBrandId(): string {
    return this.activeBrandId;
  }

  public getCurrentBrandConfig(): BrandConfig | null {
    return this.currentBrandConfig;
  }

  public getCurrentBrandTheme(): BrandThemeConfig | null {
    return this.currentBrandConfig?.theme || null;
  }

  public getCurrentBrandLogoPath(): string | undefined {
    return this.currentBrandConfig?.assets?.logoPath;
  }

  public getCurrentBrandPricingTierId(): string | undefined {
    return this.currentBrandConfig?.pricing?.tierId;
  }

  public getFeatureFlag(flagName: keyof BrandFeatureFlags): any {
    // Return type is any because flags can be boolean or number (e.g. maxDeviceLicenses)
    const flagValue = this.currentBrandConfig?.featureFlags?.[flagName];
    if (flagValue === undefined) {
      return false; // Default for boolean flags if not present
    }
    return flagValue;
  }

  public async setActiveBrandId(brandId: string): Promise<void> {
    if (window.electron?.setActiveBrandId) {
      const newBrandConfig = masterConfig.brands[brandId];
      if (newBrandConfig) {
        window.electron.setActiveBrandId(brandId);
        this.activeBrandId = brandId;
        this.currentBrandConfig = newBrandConfig;
      } else {
        console.error(`Brand configuration for ID '${brandId}' not found. Cannot set active brand.`);
        // Optionally, revert to default or keep current if preferred
        // For now, we don't change the brand if the new one is invalid
        // but we should ensure the main process is also not set to an invalid ID
        // window.electron.setActiveBrandId(this.activeBrandId); // Re-set to current valid one
      }
    } else {
      console.warn('setActiveBrandId is not available on window.electron. Brand ID not changed.');
    }
  }

  // New Getter Methods
  public getBrandName(): string | undefined {
    return this.currentBrandConfig?.brandName;
  }

  public getTagline(): string | undefined {
    return this.currentBrandConfig?.tagline;
  }

  public getBrandAsset(assetName: keyof BrandAssetsConfig): string | undefined {
    return this.currentBrandConfig?.assets?.[assetName];
  }

  public getBrandContent(): BrandContentConfig | null {
    return this.currentBrandConfig?.content || null;
  }

  public getWelcomeMessage(): string | undefined {
    return this.currentBrandConfig?.content?.welcomeMessage;
  }

  public getSupportEmail(): string | undefined {
    return this.currentBrandConfig?.content?.supportEmail;
  }

  public getMarketingCopy(): BrandMarketingCopyConfig | undefined {
    return this.currentBrandConfig?.content?.marketingCopy;
  }

  public getFullPricingConfig(): BrandPricingConfig | null {
    return this.currentBrandConfig?.pricing || null;
  }

  public getRegionalPricingInfo(regionCode: string): RegionalPricingDetail | undefined {
    const pricingConfig = this.currentBrandConfig?.pricing;
    if (!pricingConfig) return undefined;
    const regional = pricingConfig.regionSpecific?.[regionCode.toUpperCase()];
    if (regional) return regional;
    // Fallback to base price if region-specific is not found
    return { basePrice: pricingConfig.basePrice, currency: pricingConfig.currency };
  }

  public getComplianceInfo(): BrandComplianceConfig | null {
    return this.currentBrandConfig?.compliance || null;
  }

  public getPrivacyPolicyUrl(): string | undefined {
    return this.currentBrandConfig?.compliance?.privacyPolicyUrl;
  }

  public getIntegrationInfo(): BrandIntegrationsConfig | null {
    return this.currentBrandConfig?.integrations || null;
  }

  public getPaymentProviders(): string[] | undefined {
    return this.currentBrandConfig?.integrations?.paymentProviders;
  }
}

const brandService = new BrandService();

export const initializeBrandService = async () => {
 await brandService.init();
};

export default brandService;
