// src/components/AdvancedAnalyticsPage.tsx
import React from 'react';
import brandService from '../services/brandService';
import { BarChartBig } from 'lucide-react';

const AdvancedAnalyticsPage: React.FC = () => {
  const brandName = brandService.getCurrentBrandConfig()?.brandName || 'Our Brand';
  return (
    <div className="p-6 sm:p-8 animate-fadeIn">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <BarChartBig className="w-8 h-8 text-sakura-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Advanced Analytics for {brandName}
          </h1>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 sm:p-8">
          <p className="text-gray-700 dark:text-gray-300">
            This is a placeholder page for Advanced Analytics.
            This feature is specifically enabled for the '{brandName}' brand via feature flags.
          </p>
        </div>
      </div>
    </div>
  );
};
export default AdvancedAnalyticsPage;
