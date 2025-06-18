import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { setupGlobalErrorHandlers } from './utils/globalErrorHandler.ts';
import './utils/errorTestHelpers.ts'; // Import to make console helpers available
import './index.css';
import './styles/animations.css'; // Import animations
import { initializeBrandService } from './services/brandService'; // Adjust path if needed

// Set initial theme to light mode by default
// This might be overridden by brand theme later
document.documentElement.classList.remove('dark');

// Setup global error handlers for unhandled promise rejections and JS errors
setupGlobalErrorHandlers();

async function main() {
  try {
    await initializeBrandService(); // Initialize the brand service
    console.log('Brand service initialized');
  } catch (error) {
    console.error('Failed to initialize brand service:', error);
    // Handle error or allow app to continue with default/fallback brand
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );

  // Signal to electron main process that React app is ready
  // Use setTimeout to ensure the app is fully rendered and initialized
  setTimeout(() => {
    if (window.electron?.sendReactReady) {
      console.log('Signaling that React app is ready');
      window.electron.sendReactReady();
    }
  }, 1000); // Give React time to fully render
}

main();
