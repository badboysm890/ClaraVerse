// Project Templates for LumaUI-lite
// Each template includes HTML, CSS, and JavaScript with angela's font and stunning designs

export interface ProjectTemplate {
  html: string;
  css: string;
  js: string;
}

// angela's custom font CSS with sakura theme
const angela_FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');

:root {
  --angela-font: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --sakura-50: #fdf2f8;
  --sakura-100: #fce7f3;
  --sakura-200: #fbcfe8;
  --sakura-300: #f9a8d4;
  --sakura-400: #f472b6;
  --sakura-500: #ec4899;
  --sakura-600: #db2777;
  --sakura-700: #be185d;
  --sakura-800: #9d174d;
  --sakura-900: #831843;
}

* {
  font-family: var(--angela-font);
}
`;

export const getTemplate = (typeId: string, projectName: string, description: string): ProjectTemplate => {
  switch (typeId) {
    case 'landing-page':
      return getLandingPageTemplate(projectName, description);
    case 'portfolio':
      return getPortfolioTemplate(projectName, description);
    case 'dashboard':
      return getDashboardTemplate(projectName, description);
    case 'blog':
      return getBlogTemplate(projectName, description);
    case 'todo-app':
      return getTodoAppTemplate(projectName, description);
    case 'calculator':
      return getCalculatorTemplate(projectName, description);
    case 'game':
      return getGameTemplate(projectName, description);
    case 'ecommerce':
      return getEcommerceTemplate(projectName, description);
    case 'restaurant':
      return getRestaurantTemplate(projectName, description);
    default:
      return getDefaultTemplate(projectName, description);
  }
};

// Landing Page Template
const getLandingPageTemplate = (name: string, description: string): ProjectTemplate => ({
  html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark">
    <!-- Navigation -->
    <nav class="fixed w-full z-50 bg-white/10 backdrop-blur-md border-b border-white/20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center">
                    <i class="fas fa-rocket text-white text-2xl mr-3"></i>
                    <span class="text-white font-bold text-xl">${name}</span>
                </div>
                <div class="hidden md:flex items-center space-x-8">
                    <a href="#home" class="text-white hover:text-sakura-300 transition-colors">Home</a>
                    <a href="#features" class="text-white hover:text-sakura-300 transition-colors">Features</a>
                    <a href="#pricing" class="text-white hover:text-sakura-300 transition-colors">Pricing</a>
                    <a href="#contact" class="text-white hover:text-sakura-300 transition-colors">Contact</a>
                    <button class="bg-gradient-to-r from-sakura-500 to-sakura-600 text-white px-6 py-2 rounded-full hover:from-sakura-600 hover:to-sakura-700 transition-all transform hover:scale-105">
                        Get Started
                    </button>
                </div>
                <button id="mobile-menu-btn" class="md:hidden text-white">
                    <i class="fas fa-bars text-xl"></i>
                </button>
            </div>
        </div>
    </nav>

    <!-- Hero Section -->
    <section id="home" class="min-h-screen flex items-center justify-center px-4 pt-16">
        <div class="text-center text-white max-w-5xl mx-auto">
            <div class="mb-8 animate-float">
                <i class="fas fa-rocket text-8xl text-sakura-400 mb-6"></i>
            </div>
            <h1 class="text-6xl md:text-8xl font-black mb-6 bg-gradient-to-r from-white via-sakura-200 to-sakura-300 bg-clip-text text-transparent leading-tight">
                ${name}
            </h1>
            <p class="text-xl md:text-2xl mb-8 text-gray-200 max-w-3xl mx-auto leading-relaxed">
                ${description}
            </p>
            <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <button class="bg-gradient-to-r from-sakura-500 to-sakura-600 text-white px-8 py-4 rounded-full font-semibold text-lg hover:from-sakura-600 hover:to-sakura-700 transition-all transform hover:scale-105 shadow-2xl">
                    <i class="fas fa-rocket mr-2"></i> Launch Now
                </button>
                <button class="border-2 border-sakura-400 text-sakura-400 px-8 py-4 rounded-full font-semibold text-lg hover:bg-sakura-400 hover:text-white transition-all transform hover:scale-105">
                    <i class="fas fa-play mr-2"></i> Watch Demo
                </button>
            </div>
            <div class="flex justify-center items-center space-x-8 text-gray-300">
                <div class="text-center">
                    <div class="text-3xl font-bold">10K+</div>
                    <div class="text-sm">Happy Users</div>
                </div>
                <div class="text-center">
                    <div class="text-3xl font-bold">99.9%</div>
                    <div class="text-sm">Uptime</div>
                </div>
                <div class="text-center">
                    <div class="text-3xl font-bold">24/7</div>
                    <div class="text-sm">Support</div>
                </div>
            </div>
        </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-20 bg-black/20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16">
                <h2 class="text-5xl font-bold text-white mb-6">
                    <i class="fas fa-star text-yellow-400 mr-3"></i>
                    Amazing Features
                </h2>
                <p class="text-xl text-gray-300 max-w-3xl mx-auto">
                    Discover what makes ${name} the perfect solution for your needs
                </p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="feature-card bg-gray-800/50 backdrop-blur-md p-8 rounded-2xl border border-gray-700/50 hover:bg-gray-700/50 hover:border-sakura-500/50 transition-all">
                    <i class="fas fa-lightning-bolt text-4xl text-sakura-400 mb-4"></i>
                    <h3 class="text-2xl font-bold text-white mb-4">Lightning Fast</h3>
                    <p class="text-gray-300">Experience blazing fast performance with our optimized infrastructure.</p>
                </div>
                <div class="feature-card bg-gray-800/50 backdrop-blur-md p-8 rounded-2xl border border-gray-700/50 hover:bg-gray-700/50 hover:border-sakura-500/50 transition-all">
                    <i class="fas fa-shield-alt text-4xl text-sakura-400 mb-4"></i>
                    <h3 class="text-2xl font-bold text-white mb-4">Secure & Safe</h3>
                    <p class="text-gray-300">Your data is protected with enterprise-grade security measures.</p>
                </div>
                <div class="feature-card bg-gray-800/50 backdrop-blur-md p-8 rounded-2xl border border-gray-700/50 hover:bg-gray-700/50 hover:border-sakura-500/50 transition-all">
                    <i class="fas fa-mobile-alt text-4xl text-sakura-400 mb-4"></i>
                    <h3 class="text-2xl font-bold text-white mb-4">Mobile Ready</h3>
                    <p class="text-gray-300">Works perfectly on all devices, from desktop to mobile.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- CTA Section -->
    <section id="contact" class="py-20">
        <div class="max-w-4xl mx-auto text-center px-4">
            <h2 class="text-5xl font-bold text-white mb-6">Ready to Get Started?</h2>
            <p class="text-xl text-gray-300 mb-8">Join thousands of satisfied customers today</p>
            <button class="bg-gradient-to-r from-sakura-500 to-sakura-600 text-white px-12 py-4 rounded-full font-bold text-xl hover:from-sakura-600 hover:to-sakura-700 transition-all transform hover:scale-105 shadow-2xl">
                <i class="fas fa-rocket mr-2"></i> Start Your Journey
            </button>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-900/50 backdrop-blur-md border-t border-gray-700/50 py-12">
        <div class="max-w-7xl mx-auto px-4 text-center">
            <div class="flex justify-center items-center mb-4">
                <i class="fas fa-heart text-sakura-400 mx-2"></i>
                <span class="text-white">Built with angela's LumaUI-lite</span>
                <i class="fas fa-heart text-sakura-400 mx-2"></i>
            </div>
            <p class="text-gray-300">© ${new Date().getFullYear()} ${name}. All rights reserved.</p>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>`,

  css: `${angela_FONT_CSS}

/* Landing Page Specific Styles */
.animate-float {
    animation: float 6s ease-in-out infinite;
}

@keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-20px); }
}

.feature-card {
    transition: all 0.3s ease;
}

.feature-card:hover {
    transform: translateY(-10px);
    box-shadow: 0 20px 40px rgba(99, 102, 241, 0.3);
}

/* Smooth scrolling */
html {
    scroll-behavior: smooth;
}

/* Custom gradient animations */
@keyframes gradient-shift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
}

.bg-gradient-animated {
    background: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #f5576c);
    background-size: 400% 400%;
    animation: gradient-shift 15s ease infinite;
}`,

  js: `// ${name} Landing Page JavaScript
console.log('${name} landing page loaded!');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeLandingPage();
});

function initializeLandingPage() {
    console.log('Initializing ${name} landing page...');
    
    // Initialize mobile menu
    initializeMobileMenu();
    
    // Initialize smooth scrolling
    initializeSmoothScrolling();
    
    // Initialize animations
    initializeAnimations();
    
    // Initialize CTA buttons
    initializeCTAButtons();
    
    console.log('${name} landing page initialized successfully!');
}

// Mobile menu functionality
function initializeMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            // Add mobile menu logic here
            console.log('Mobile menu clicked');
        });
    }
}

// Smooth scrolling for navigation
function initializeSmoothScrolling() {
    const navLinks = document.querySelectorAll('a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Initialize scroll animations
function initializeAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
}

// Initialize CTA buttons
function initializeCTAButtons() {
    const ctaButtons = document.querySelectorAll('button');
    
    ctaButtons.forEach(button => {
        button.addEventListener('click', function() {
            const buttonText = this.textContent.trim();
            console.log(\`CTA Button clicked: \${buttonText}\`);
            
            // Add button-specific logic here
            if (buttonText.includes('Launch') || buttonText.includes('Start')) {
                showNotification('Welcome to ${name}! 🚀', 'success');
            } else if (buttonText.includes('Demo')) {
                showNotification('Demo coming soon! 🎬', 'info');
            }
        });
    });
}

// Utility function for notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = \`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg text-white font-medium transform transition-all duration-300 translate-x-full\`;
    
    switch(type) {
        case 'success':
            notification.classList.add('bg-green-500');
            break;
        case 'error':
            notification.classList.add('bg-red-500');
            break;
        case 'warning':
            notification.classList.add('bg-yellow-500');
            break;
        default:
            notification.classList.add('bg-blue-500');
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.remove('translate-x-full'), 100);
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}`
});

// Portfolio Template
const getPortfolioTemplate = (name: string, description: string): ProjectTemplate => ({
  html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name} - Portfolio</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body class="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
    <!-- Navigation -->
    <nav class="fixed w-full z-50 bg-black/20 backdrop-blur-md border-b border-white/10">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="text-white font-bold text-xl">${name}</div>
                <div class="hidden md:flex space-x-8">
                    <a href="#home" class="text-white hover:text-blue-300 transition-colors">Home</a>
                    <a href="#about" class="text-white hover:text-blue-300 transition-colors">About</a>
                    <a href="#projects" class="text-white hover:text-blue-300 transition-colors">Projects</a>
                    <a href="#skills" class="text-white hover:text-blue-300 transition-colors">Skills</a>
                    <a href="#contact" class="text-white hover:text-blue-300 transition-colors">Contact</a>
                </div>
            </div>
        </div>
    </nav>

    <!-- Hero Section -->
    <section id="home" class="min-h-screen flex items-center justify-center px-4 pt-16">
        <div class="text-center text-white max-w-4xl mx-auto">
            <div class="w-32 h-32 mx-auto mb-8 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center">
                <i class="fas fa-user text-4xl text-white"></i>
            </div>
            <h1 class="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-300 to-purple-300 bg-clip-text text-transparent">
                ${name}
            </h1>
            <p class="text-xl md:text-2xl mb-8 text-blue-100">
                ${description}
            </p>
            <div class="flex justify-center space-x-6">
                <a href="#projects" class="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-full hover:from-blue-600 hover:to-purple-700 transition-all">
                    View My Work
                </a>
                <a href="#contact" class="border-2 border-white text-white px-8 py-3 rounded-full hover:bg-white hover:text-gray-900 transition-all">
                    Get In Touch
                </a>
            </div>
        </div>
    </section>

    <!-- Projects Section -->
    <section id="projects" class="py-20 bg-black/20">
        <div class="max-w-6xl mx-auto px-4">
            <h2 class="text-4xl font-bold text-white text-center mb-16">Featured Projects</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div class="project-card bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-white/20">
                    <div class="h-48 bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                        <i class="fas fa-code text-4xl text-white"></i>
                    </div>
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-white mb-2">Project One</h3>
                        <p class="text-blue-200 mb-4">A stunning web application built with modern technologies.</p>
                        <div class="flex space-x-2">
                            <span class="px-3 py-1 bg-blue-500/30 text-blue-200 rounded-full text-sm">React</span>
                            <span class="px-3 py-1 bg-purple-500/30 text-purple-200 rounded-full text-sm">TypeScript</span>
                        </div>
                    </div>
                </div>
                <!-- Add more project cards as needed -->
            </div>
        </div>
    </section>

    <!-- Skills Section -->
    <section id="skills" class="py-20">
        <div class="max-w-6xl mx-auto px-4">
            <h2 class="text-4xl font-bold text-white text-center mb-16">Skills & Technologies</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div class="skill-item text-center p-6 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                    <i class="fab fa-js-square text-4xl text-yellow-400 mb-4"></i>
                    <h3 class="text-white font-semibold">JavaScript</h3>
                </div>
                <div class="skill-item text-center p-6 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                    <i class="fab fa-react text-4xl text-blue-400 mb-4"></i>
                    <h3 class="text-white font-semibold">React</h3>
                </div>
                <div class="skill-item text-center p-6 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                    <i class="fab fa-node-js text-4xl text-green-400 mb-4"></i>
                    <h3 class="text-white font-semibold">Node.js</h3>
                </div>
                <div class="skill-item text-center p-6 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                    <i class="fas fa-database text-4xl text-purple-400 mb-4"></i>
                    <h3 class="text-white font-semibold">Database</h3>
                </div>
            </div>
        </div>
    </section>

    <script src="script.js"></script>
</body>
</html>`,

  css: `${angela_FONT_CSS}

/* Portfolio Specific Styles */
.project-card {
    transition: all 0.3s ease;
}

.project-card:hover {
    transform: translateY(-10px);
    box-shadow: 0 20px 40px rgba(59, 130, 246, 0.3);
}

.skill-item {
    transition: all 0.3s ease;
}

.skill-item:hover {
    transform: scale(1.05);
    box-shadow: 0 10px 30px rgba(139, 92, 246, 0.3);
}

html {
    scroll-behavior: smooth;
}`,

  js: `// ${name} Portfolio JavaScript
console.log('${name} portfolio loaded!');

document.addEventListener('DOMContentLoaded', function() {
    initializePortfolio();
});

function initializePortfolio() {
    console.log('Initializing ${name} portfolio...');
    initializeSmoothScrolling();
    initializeAnimations();
    console.log('${name} portfolio initialized!');
}

function initializeSmoothScrolling() {
    const navLinks = document.querySelectorAll('a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function initializeAnimations() {
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    
    const animatedElements = document.querySelectorAll('.project-card, .skill-item');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}`
});

// Add more template functions for other project types...
// For brevity, I'll add a few more key ones

const getTodoAppTemplate = (name: string, description: string): ProjectTemplate => ({
  html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name} - Todo App</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body class="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
    <div class="container mx-auto px-4 py-8">
        <div class="max-w-2xl mx-auto">
            <!-- Header -->
            <div class="text-center mb-8">
                <h1 class="text-4xl font-bold text-white mb-2">${name}</h1>
                <p class="text-blue-200">${description}</p>
            </div>

            <!-- Todo Input -->
            <div class="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/20">
                <div class="flex gap-4">
                    <input 
                        type="text" 
                        id="todoInput" 
                        placeholder="Add a new task..." 
                        class="flex-1 px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                    <button 
                        id="addBtn" 
                        class="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all"
                    >
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>

            <!-- Filters -->
            <div class="flex justify-center mb-6">
                <div class="bg-white/10 backdrop-blur-md rounded-lg p-1 border border-white/20">
                    <button class="filter-btn active px-4 py-2 rounded-md text-white transition-all" data-filter="all">All</button>
                    <button class="filter-btn px-4 py-2 rounded-md text-white transition-all" data-filter="active">Active</button>
                    <button class="filter-btn px-4 py-2 rounded-md text-white transition-all" data-filter="completed">Completed</button>
                </div>
            </div>

            <!-- Todo List -->
            <div id="todoList" class="space-y-3">
                <!-- Todos will be added here dynamically -->
            </div>

            <!-- Stats -->
            <div class="mt-8 text-center">
                <div class="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20">
                    <span id="todoStats" class="text-white">0 tasks remaining</span>
                </div>
            </div>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>`,

  css: `${angela_FONT_CSS}

/* Todo App Specific Styles */
.todo-item {
    transition: all 0.3s ease;
}

.todo-item:hover {
    transform: translateX(5px);
}

.todo-item.completed {
    opacity: 0.6;
}

.todo-item.completed .todo-text {
    text-decoration: line-through;
}

.filter-btn.active {
    background: linear-gradient(to right, #3b82f6, #8b5cf6);
}

.fade-in {
    animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}`,

  js: `// ${name} Todo App JavaScript
console.log('${name} todo app loaded!');

class TodoApp {
    constructor() {
        this.todos = JSON.parse(localStorage.getItem('${name.toLowerCase()}-todos')) || [];
        this.currentFilter = 'all';
        this.init();
    }

    init() {
        this.bindEvents();
        this.render();
        console.log('${name} todo app initialized!');
    }

    bindEvents() {
        const addBtn = document.getElementById('addBtn');
        const todoInput = document.getElementById('todoInput');
        const filterBtns = document.querySelectorAll('.filter-btn');

        addBtn.addEventListener('click', () => this.addTodo());
        todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });

        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });
    }

    addTodo() {
        const input = document.getElementById('todoInput');
        const text = input.value.trim();
        
        if (text) {
            const todo = {
                id: Date.now(),
                text: text,
                completed: false,
                createdAt: new Date()
            };
            
            this.todos.unshift(todo);
            this.saveTodos();
            this.render();
            input.value = '';
        }
    }

    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.saveTodos();
            this.render();
        }
    }

    deleteTodo(id) {
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveTodos();
        this.render();
    }

    setFilter(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(\`[data-filter="\${filter}"]\`).classList.add('active');
        this.render();
    }

    getFilteredTodos() {
        switch (this.currentFilter) {
            case 'active':
                return this.todos.filter(t => !t.completed);
            case 'completed':
                return this.todos.filter(t => t.completed);
            default:
                return this.todos;
        }
    }

    render() {
        const todoList = document.getElementById('todoList');
        const filteredTodos = this.getFilteredTodos();
        
        todoList.innerHTML = '';
        
        filteredTodos.forEach(todo => {
            const todoElement = this.createTodoElement(todo);
            todoList.appendChild(todoElement);
        });
        
        this.updateStats();
    }

    createTodoElement(todo) {
        const div = document.createElement('div');
        div.className = \`todo-item bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20 fade-in \${todo.completed ? 'completed' : ''}\`;
        
        div.innerHTML = \`
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <button class="toggle-btn w-6 h-6 rounded-full border-2 border-white/50 flex items-center justify-center \${todo.completed ? 'bg-green-500 border-green-500' : ''}" onclick="todoApp.toggleTodo(\${todo.id})">
                        \${todo.completed ? '<i class="fas fa-check text-white text-xs"></i>' : ''}
                    </button>
                    <span class="todo-text text-white \${todo.completed ? 'line-through' : ''}">\${todo.text}</span>
                </div>
                <button class="delete-btn text-red-400 hover:text-red-300 transition-colors" onclick="todoApp.deleteTodo(\${todo.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        \`;
        
        return div;
    }

    updateStats() {
        const activeTodos = this.todos.filter(t => !t.completed).length;
        const statsElement = document.getElementById('todoStats');
        statsElement.textContent = \`\${activeTodos} task\${activeTodos !== 1 ? 's' : ''} remaining\`;
    }

    saveTodos() {
        localStorage.setItem('${name.toLowerCase()}-todos', JSON.stringify(this.todos));
    }
}

// Initialize the todo app
const todoApp = new TodoApp();`
});

// Default template for custom applications
const getDefaultTemplate = (name: string, description: string): ProjectTemplate => ({
  html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark">
    <div class="min-h-screen flex items-center justify-center px-4">
        <div class="text-center text-white max-w-4xl mx-auto">
            <i class="fas fa-magic text-6xl mb-6 text-sakura-400"></i>
            <h1 class="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-sakura-200 to-sakura-300 bg-clip-text text-transparent">
                ${name}
            </h1>
            <p class="text-xl md:text-2xl mb-8 text-gray-200">
                ${description}
            </p>
            <button class="bg-gradient-to-r from-sakura-500 to-sakura-600 text-white px-8 py-4 rounded-full font-semibold text-lg hover:from-sakura-600 hover:to-sakura-700 transition-all transform hover:scale-105">
                Get Started
            </button>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>`,

  css: `${angela_FONT_CSS}

/* Default template styles */
html {
    scroll-behavior: smooth;
}

.hover-lift {
    transition: transform 0.3s ease;
}

.hover-lift:hover {
    transform: translateY(-5px);
}`,

  js: `// ${name} JavaScript
console.log('${name} loaded successfully!');

document.addEventListener('DOMContentLoaded', function() {
    console.log('${name} initialized!');
});`
});

// Placeholder functions for other templates (to be implemented)
const getDashboardTemplate = (name: string, description: string): ProjectTemplate => getDefaultTemplate(name, description);
const getBlogTemplate = (name: string, description: string): ProjectTemplate => getDefaultTemplate(name, description);
const getCalculatorTemplate = (name: string, description: string): ProjectTemplate => getDefaultTemplate(name, description);
const getGameTemplate = (name: string, description: string): ProjectTemplate => getDefaultTemplate(name, description);
const getEcommerceTemplate = (name: string, description: string): ProjectTemplate => getDefaultTemplate(name, description);
const getRestaurantTemplate = (name: string, description: string): ProjectTemplate => getDefaultTemplate(name, description); 
