// src/components/PricingPage.tsx
import React from 'react';
import brandService from '../services/brandService'; // Adjust path as needed
import { DollarSign, Info } from 'lucide-react'; // Or other relevant icons

const PricingPage: React.FC = () => {
  const brandName = brandService.getBrandName() || 'Our Brand';
  const pricingConfig = brandService.getFullPricingConfig();
  const usPrice = brandService.getRegionalPricingInfo('US');

  return (
    <div className="p-6 sm:p-8 animate-fadeIn">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <DollarSign className="w-8 h-8 text-sakura-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {brandName} Pricing
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <Info className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
              Pricing Information
            </h2>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            This is a placeholder for the detailed pricing plans for <span className="font-semibold">{brandName}</span>.
          </p>

          {pricingConfig ? (
            <>
              <p className="text-gray-600 dark:text-gray-400 mb-1">
                Current Pricing Tier ID: <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded text-sm">{pricingConfig.tierId}</span>
              </p>
              <p className="text-gray-600 dark:text-gray-400 mb-1">
                Base Price: <span className="font-semibold">{pricingConfig.basePrice} {pricingConfig.currency}</span>
              </p>
              {pricingConfig.billingType && (
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  Billing Type: <span className="capitalize">{pricingConfig.billingType}</span>
                </p>
              )}
              {pricingConfig.upgradePrice !== undefined && (
                 <p className="text-gray-600 dark:text-gray-400 mb-1">
                   Upgrade Price: <span className="font-semibold">{pricingConfig.upgradePrice} {pricingConfig.currency}</span>
                 </p>
              )}
              {usPrice && (
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  US Regional Price: <span className="font-semibold">{usPrice.basePrice} {usPrice.currency}</span>
                </p>
              )}

              {brandService.getCurrentBrandId() === 'mccaigs' && pricingConfig.tiers && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">McCaigs Specific Tiers:</h3>
                  <ul className="list-disc pl-5 text-gray-600 dark:text-gray-400">
                    {Object.entries(pricingConfig.tiers).map(([tierName, tierPrice]) => (
                      <li key={tierName}><span className="font-semibold capitalize">{tierName}:</span> {tierPrice} {pricingConfig.currency}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Pricing details are not currently available.
            </p>
          )}

          <p className="text-gray-500 dark:text-gray-500 text-sm mt-4">
            A fully featured pricing page will be implemented here in a future update, outlining specific tiers, features, and costs.
          </p>
        </div>

        {/* Example of how existing feature flags could be used here later */}
        {brandService.getFeatureFlag('enableUkSpecificContent') && (
          <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-300 text-sm">
            <p>Note: UK specific pricing considerations might apply.</p>
          </div>
        )}

        {/* New Feature Flag Example */}
        {brandService.getFeatureFlag('enableVisaGuidance') && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            <p>Visa guidance resources are available for this plan!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PricingPage;
