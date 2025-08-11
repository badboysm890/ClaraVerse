// Global error handler for unhandled promise rejections and other JS errors
import errorClaraMascot from '../assets/mascot/Error_Clara.png';

export const setupGlobalErrorHandlers = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Show a user-friendly error message
    // showGlobalErrorMessage('An unexpected error occurred. Please refresh the page.');
    
    // Prevent the default browser behavior (logging to console)
    event.preventDefault();
  });
 
  // Handle other JavaScript errors
  window.addEventListener('error', (event) => {
    // Filter out null errors and Monaco-related errors
    if (event.error === null || 
        event.message?.includes('monaco') || 
        event.message?.includes('TypeScript') ||
        event.filename?.includes('monaco')) {
      return; // Ignore these errors
    }
    
    console.error('Global JavaScript error:', event.error);
    
    // Show a user-friendly error message
    // showGlobalErrorMessage('An unexpected error occurred. Please refresh the page.');
  });
};

// Show a global error message overlay with Clara's theme
const showGlobalErrorMessage = (message: string) => {
  // Check if an error overlay already exists
  if (document.getElementById('global-error-overlay')) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'global-error-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(168, 85, 247, 0.1));
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: fadeIn 0.3s ease-out;
  `;

  const errorBox = document.createElement('div');
  errorBox.style.cssText = `
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    padding: 2.5rem;
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-width: 500px;
    margin: 1rem;
    text-align: center;
    border: 2px solid rgba(236, 72, 153, 0.2);
    position: relative;
    animation: slideUp 0.4s ease-out;
  `;

  // Clara's mini avatar with actual image
  const avatar = document.createElement('div');
  avatar.style.cssText = `
    width: 120px;
    height: 120px;
    margin: 0 auto 1.5rem;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const claraImg = document.createElement('img');
  claraImg.src = errorClaraMascot;
  claraImg.alt = 'Clara Error Mascot';
  claraImg.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 8px 25px rgba(236, 72, 153, 0.3));
  `;

  // Add error fallback for image loading
  claraImg.onerror = () => {
    // Log warning if mascot fails to load
    console.warn('Failed to load Clara mascot in global error handler');
  };

  // Alert indicator
  const alertBadge = document.createElement('div');
  alertBadge.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    width: 24px;
    height: 24px;
    background: #ef4444;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    font-weight: bold;
    animation: pulse 2s infinite;
    z-index: 1;
  `;
  alertBadge.innerHTML = '!';

  avatar.appendChild(claraImg);
  avatar.appendChild(alertBadge);

  const title = document.createElement('h2');
  title.style.cssText = `
    margin: 0 0 1rem;
    color: #1f2937;
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #ec4899, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  `;
  title.textContent = 'Clara needs your help!';

  const messageEl = document.createElement('p');
  messageEl.style.cssText = `
    margin: 0 0 2rem;
    color: #6b7280;
    line-height: 1.6;
    font-size: 1rem;
  `;
  messageEl.innerHTML = `
    <span style="font-style: italic;">"Oops! Something unexpected happened while I was working behind the scenes! 😅"</span>
    <br><br>
    <span style="font-size: 0.9rem; color: #9ca3af;">Let's refresh and get back to our adventure together!</span>
  `;

  const button = document.createElement('button');
  button.style.cssText = `
    background: linear-gradient(135deg, #ec4899, #a855f7);
    color: white;
    border: none;
    padding: 1rem 2rem;
    border-radius: 16px;
    font-weight: 600;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.3s ease;
    box-shadow: 0 8px 25px rgba(236, 72, 153, 0.3);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 auto;
  `;
  button.innerHTML = '✨ Clara\'s Magic Refresh';
  
  button.onmouseover = () => {
    button.style.transform = 'translateY(-2px) scale(1.05)';
    button.style.boxShadow = '0 12px 35px rgba(236, 72, 153, 0.4)';
  };
  button.onmouseout = () => {
    button.style.transform = 'translateY(0) scale(1)';
    button.style.boxShadow = '0 8px 25px rgba(236, 72, 153, 0.3)';
  };
  button.onclick = () => {
    // Add a little animation before refresh
    overlay.style.animation = 'fadeOut 0.3s ease-in';
    setTimeout(() => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }, 300);
  };

  // Add some floating particles
  for (let i = 0; i < 3; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: 8px;
      height: 8px;
      background: ${['#fbbf24', '#ec4899', '#a855f7'][i]};
      border-radius: 50%;
      top: ${20 + i * 15}%;
      left: ${10 + i * 25}%;
      animation: float 3s ease-in-out infinite;
      animation-delay: ${i * 0.5}s;
    `;
    errorBox.appendChild(particle);
  }

  errorBox.appendChild(avatar);
  errorBox.appendChild(title);
  errorBox.appendChild(messageEl);
  errorBox.appendChild(button);
  overlay.appendChild(errorBox);

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(30px) scale(0.9);
      }
      to { 
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}; 