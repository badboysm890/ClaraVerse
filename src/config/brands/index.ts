// This file will now primarily be for type definitions related to brand configurations.
// The actual loading and accessing of brand data will be handled by brandService using the new brand_configurations.json.

export interface BrandThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  successColor?: string;
  warningColor?: string;
  errorColor?: string;
  cssVariableMapping?: Record<string, string>;
}

export interface BrandAssetsConfig {
  logoPath: string;
  faviconPath?: string;
  splashScreenPath?: string;
  brandMarkPath?: string;
}

export interface RegionalPricingDetail {
  basePrice: number;
  currency: string;
}

export interface BrandPricingConfig {
  tierId: string;
  basePrice: number;
  currency: string;
  billingType?: string;
  upgradePrice?: number;
  regionSpecific?: Record<string, RegionalPricingDetail>;
  tiers?: Record<string, number>;
}

export interface BrandFeatureFlags {
  // StudentlyAI
  enableInternationalStudentFeatures?: boolean;
  enableVisaGuidance?: boolean;
  enableCurrencyConverter?: boolean;
  enableMultiLanguageSupport?: boolean;
  // StudentsAI
  enableUKSpecificFeatures?: boolean; // Note: previously enableUkSpecificContent
  enableUCASIntegration?: boolean;
  enableStudentLoansCalculator?: boolean;
  // PupilsAI
  enableParentalControls?: boolean;
  enableSafeguarding?: boolean;
  enableCurriculumAlignment?: boolean;
  enableAgeAppropriateContent?: boolean; // Note: previously enableSchoolSpecificModules
  // GraduatesAI
  enableCareerTools?: boolean; // Note: previously enableGraduateCareerTools
  enableJobSearchIntegration?: boolean;
  enableSalaryNegotiation?: boolean;
  enableNetworkingTools?: boolean;
  // TeachersAI
  enableLessonPlanGeneration?: boolean;
  enableAssessmentTools?: boolean;
  enableCurriculumMapping?: boolean;
  enableParentCommunication?: boolean; // Note: previously enableEducatorResources
  enableClassroomManagement?: boolean;
  // McCaigs
  enableBusinessFeatures?: boolean; // Note: previously enableBusinessAnalytics
  enableEnterpriseIntegrations?: boolean;
  enableAdvancedAnalytics?: boolean; // Already implemented
  enableTeamCollaboration?: boolean;
  enableAPIAccess?: boolean;
  // Common or generic
  maxDeviceLicenses?: number;
  // Old flags that might need mapping or were more specific:
  // enableSchoolSpecificModules?: boolean; // Now enableAgeAppropriateContent or similar
  // enableUkSpecificContent?: boolean; // Now enableUKSpecificFeatures
  // enableGraduateCareerTools?: boolean; // Now enableCareerTools
  // enableEducatorResources?: boolean; // Now specific teacher flags
  // enableBusinessAnalytics?: boolean; // Now enableBusinessFeatures
}

export interface BrandMarketingCopyConfig {
  heroTitle: string;
  heroSubtitle: string;
  valueProposition: string;
}

export interface BrandContentConfig {
  welcomeMessage: string;
  supportEmail: string;
  marketingCopy: BrandMarketingCopyConfig;
}

export interface BrandIntegrationsConfig {
  paymentProviders: string[];
  analyticsId: string;
  supportWidget: string;
  emailProvider: string;
}

export interface BrandComplianceConfig {
  gdprApplicable: boolean;
  ccpaApplicable: boolean;
  dataRetentionDays: number;
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
}

export interface BrandConfig {
  brandName: string;
  tagline: string;
  id: string; // Matches the key in the master config's "brands" object
  domain: string;
  targetMarket: string;
  theme: BrandThemeConfig;
  assets: BrandAssetsConfig;
  pricing: BrandPricingConfig;
  featureFlags: BrandFeatureFlags;
  content: BrandContentConfig;
  integrations: BrandIntegrationsConfig;
  compliance: BrandComplianceConfig;
  // Optional: Add metadata and settings from the new schema if they are part of individual brand structure
  // metadata?: { description: string; targetAudience: string; website: string; };
  // settings?: { defaultLanguage: string; region: string; contentSafetyLevel?: string; };
}

export interface MasterBrandConfig {
  version: string; // Schema version from the root of brand_configurations.json
  lastUpdated: string; // From the root of brand_configurations.json
  brands: Record<string, BrandConfig>; // All individual brand configurations
  defaultBrandId: string; // Default brand ID from the root
  globalSettings?: { // Optional, as it's at the root of brand_configurations.json
    globalCdnUrl?: string;
    apiEndpoints?: {
      userAuth?: string;
      billing?: string;
    };
  };
}


/*
// Old interfaces and exports - commented out or to be removed

import studentlyaiConfig from './studentlyai.json';
// ... other old imports

export interface BrandTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  sakura50: string;
  // ... other sakura colors
  sakura900: string;
}

// Old BrandFeatureFlags was here
// Old BrandConfig was here (with fewer fields)


export const brands: Record<string, BrandConfig> = {
  studentlyai: studentlyaiConfig as BrandConfig,
  // ... other brands
};

export const defaultBrandId = 'studentlyai';

export const getBrandConfig = (brandId: string): BrandConfig | undefined => {
  return brands[brandId];
};
*/
