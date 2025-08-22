// AI Template Generator Service for LumaUI-lite
// Uses structured response calling to generate custom HTML templates

export interface AIGeneratedTemplate {
  pages: {
    filename: string;
    title: string;
    content: string;
    description: string;
  }[];
  explanation: string;
}

export interface AIGenerationRequest {
  projectName: string;
  description: string;
  features: string[];
  provider: string;
  model: string;
  instructions?: string;
}

// JSON Schema for structured response
const TEMPLATE_GENERATION_SCHEMA = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      description: "Array of HTML pages for the application",
      items: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Filename for the page (e.g., 'index.html', 'about.html', 'contact.html')"
          },
          title: {
            type: "string",
            description: "Page title for the <title> tag and navigation"
          },
          content: {
            type: "string",
            description: "Complete HTML document with angela's font, Tailwind CSS, Font Awesome, inline CSS, and inline JavaScript"
          },
          description: {
            type: "string",
            description: "Brief description of what this page contains and its purpose"
          }
        },
        required: ["filename", "title", "content", "description"],
        additionalProperties: false
      },
      minItems: 1,
      maxItems: 10
    },
    explanation: {
      type: "string",
      description: "Brief explanation of the generated template, its structure, and how the pages work together"
    }
  },
  required: ["pages", "explanation"],
  additionalProperties: false
};

export class AITemplateGenerator {
  private apiKey: string | null = null;
  private baseUrl: string = '';

  constructor() {
    // Initialize with stored API keys or default values
    this.loadApiConfiguration();
  }

  private loadApiConfiguration() {
    // Load API configuration from localStorage or environment
    const storedConfig = localStorage.getItem('lumaui-ai-config');
    if (storedConfig) {
      try {
        const config = JSON.parse(storedConfig);
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl;
      } catch (error) {
        console.warn('Failed to load AI configuration:', error);
      }
    }
  }

  private getApiEndpoint(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'anthropic':
        return 'https://api.anthropic.com/v1/messages';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1/chat/completions';
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private createSystemPrompt(): string {
    return `You are angela's AI Template Generator, an expert web developer specializing in creating stunning, production-ready web applications that rival the best modern websites.

🎯 CORE MISSION: Create applications that are visually stunning, highly functional, and production-ready from day one.

📋 MANDATORY REQUIREMENTS:

**STYLING & DESIGN:**
- ALWAYS use Tailwind CSS CDN: https://cdn.tailwindcss.com
- ALWAYS include Font Awesome 6.4.0 CDN: https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css
- Use angela's Quicksand font family: https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap
- Implement angela's sakura pink theme with dark mode design (gray-900, gray-800 backgrounds)
- Use sakura color palette: sakura-400, sakura-500, sakura-600 for accents and CTAs
- Create glassmorphic effects with backdrop-blur and subtle transparency
- Add smooth animations, hover effects, and micro-interactions

**RESPONSIVE DESIGN:**
- Mobile-first approach - design for mobile, then scale up
- Test breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px)
- Ensure perfect functionality on phones, tablets, and desktops
- Use responsive typography (text-sm on mobile, text-lg on desktop)
- Implement responsive navigation (hamburger menu for mobile)
- Optimize touch targets for mobile (min 44px tap areas)

**ACCESSIBILITY & UX:**
- Semantic HTML5 structure (header, nav, main, section, article, footer)
- Proper heading hierarchy (h1 → h2 → h3)
- Alt text for all images, aria-labels for interactive elements
- Keyboard navigation support (focus states, tab order)
- High contrast ratios (WCAG AA compliant)
- Loading states, error handling, and user feedback
- Smooth scrolling and intuitive navigation

**TECHNICAL EXCELLENCE:**
- Clean, semantic HTML5 with proper DOCTYPE and meta tags
- Inline CSS within <style> tags for custom animations and angela's design system
- Modern JavaScript (ES6+) within <script> tags with proper error handling
- Performance optimized (lazy loading, efficient animations)
- Cross-browser compatibility
- SEO-friendly structure with meta tags
- Everything in a single, self-contained HTML file

**FUNCTIONALITY & FEATURES:**
- Interactive elements with hover states and animations
- Form validation and user feedback
- Smooth scrolling navigation
- Mobile-responsive hamburger menu
- Loading animations and micro-interactions
- Error handling with user-friendly messages
- Local storage for user preferences when applicable

**DESIGN PATTERNS:**
- Hero sections with compelling CTAs
- Feature showcases with icons and descriptions
- Testimonials or social proof sections
- Contact forms with validation
- Footer with social links and information
- Card-based layouts with hover effects
- Progressive disclosure for complex information

**QUALITY STANDARDS:**
- Production-ready code that could be deployed immediately
- Clean, commented code that's easy to maintain
- Consistent spacing and typography throughout
- Professional color schemes and visual hierarchy
- Fast loading and smooth performance
- No broken layouts or functionality gaps

Generate applications that users will be impressed by and want to use immediately. Every detail should be polished and professional.`;
  }

  private createUserPrompt(request: AIGenerationRequest): string {
    const featuresText = request.features.length > 0 
      ? `\n\n🎯 **REQUIRED FEATURES:**\n${request.features.map(f => `- ${f}`).join('\n')}`
      : '';

    const instructionsText = request.instructions 
      ? `\n\n📝 **ADDITIONAL INSTRUCTIONS:**\n${request.instructions}`
      : '';

    return `Create a production-ready web application that exceeds modern standards:

🏷️ **PROJECT DETAILS:**
- Name: ${request.projectName}
- Description: ${request.description}${featuresText}${instructionsText}

🚀 **DELIVERABLE REQUIREMENTS:**

**MUST INCLUDE:**
1. **Multiple HTML5 Pages** - Generate appropriate pages for the application (index.html + additional pages as needed)
2. **Consistent Navigation** - Working navigation menu that links between all pages
3. **Tailwind CSS Integration** - Full CDN implementation with custom utility classes on every page
4. **Font Awesome Icons** - Strategic use of icons throughout the interface
5. **angela's Design System** - Quicksand font, sakura theme, dark mode, glassmorphic effects
6. **Responsive Layout** - Perfect on mobile (320px+), tablet (768px+), and desktop (1024px+)
7. **Interactive JavaScript** - Modern ES6+ with smooth animations, form validation, and user feedback
8. **Accessibility Features** - WCAG AA compliance, keyboard navigation, screen reader support
9. **Performance Optimization** - Fast loading, efficient animations, optimized images

**DESIGN EXCELLENCE:**
- Hero section with compelling value proposition and clear CTAs
- Feature sections with icons, descriptions, and benefits
- Professional color scheme using angela's sakura palette
- Smooth hover effects and micro-interactions
- Mobile-first responsive navigation with hamburger menu
- Footer with social links and contact information
- Loading states and error handling
- Consistent spacing and typography hierarchy

**TECHNICAL STANDARDS:**
- Clean, commented, maintainable code
- Cross-browser compatibility (Chrome, Firefox, Safari, Edge)
- SEO-friendly structure with proper headings and meta tags
- Fast performance with optimized CSS and JavaScript
- No external dependencies beyond CDNs
- Multi-page architecture with proper navigation between pages

**MULTI-PAGE STRUCTURE:**
- Generate multiple HTML pages as needed for the application
- Always include an index.html as the main landing page
- Create additional pages based on the application requirements (about.html, contact.html, services.html, etc.)
- Ensure consistent navigation across all pages
- Each page should be a complete, standalone HTML document
- Include proper internal linking between pages
- Maintain consistent styling and branding across all pages

**QUALITY BENCHMARK:**
Create an application that looks and feels like it was built by a professional development team. Users should be immediately impressed by the design quality, functionality, and attention to detail. This should be something you'd be proud to showcase in a portfolio.

**PAGE STRUCTURE GUIDANCE:**
- For simple applications (landing pages, portfolios): Generate 2-4 pages (index.html, about.html, contact.html)
- For complex applications (e-commerce, dashboards): Generate 4-8 pages as needed
- For business websites: Generate pages like index.html, services.html, about.html, contact.html
- For portfolios: Generate index.html, portfolio.html, about.html, contact.html
- For blogs: Generate index.html, blog.html, about.html, contact.html
- Always ensure navigation links work between all pages
- Each page should have consistent header/footer and navigation

Generate a complete, polished, production-ready multi-page web application with appropriate pages for the application type.`;
  }

  async generateTemplate(request: AIGenerationRequest): Promise<AIGeneratedTemplate> {
    try {
      console.log('🤖 Generating AI template with:', request);

      // Check if API key is available
      if (!this.apiKey) {
        throw new Error('AI API key not configured. Please set up your API credentials.');
      }

      const endpoint = this.getApiEndpoint(request.provider);
      const systemPrompt = this.createSystemPrompt();
      const userPrompt = this.createUserPrompt(request);

      // Prepare request payload based on provider
      let requestPayload: any;
      let headers: any = {
        'Content-Type': 'application/json'
      };

      if (request.provider === 'openai' || request.provider === 'openrouter') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        
        requestPayload = {
          model: request.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'template_generation',
              strict: true,
              schema: TEMPLATE_GENERATION_SCHEMA
            }
          },
          temperature: 0.7
          // max_tokens: 30000
        };

        if (request.provider === 'openrouter') {
          requestPayload.headers = {
            'HTTP-Referer': window.location.origin,
            'X-Title': 'angela LumaUI-lite'
          };
        }
      } else if (request.provider === 'anthropic') {
        headers['x-api-key'] = this.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        
        requestPayload = {
          model: request.model,
          max_tokens: 30000,
          messages: [
            { role: 'user', content: `${systemPrompt}\n\n${userPrompt}\n\nPlease respond with a JSON object matching this schema: ${JSON.stringify(TEMPLATE_GENERATION_SCHEMA)}` }
          ],
          temperature: 0.7
        };
      }

      console.log('📡 Sending request to:', endpoint);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      console.log('📥 Received response:', data);

      // Parse response based on provider
      let generatedContent: string;
      
      if (request.provider === 'openai' || request.provider === 'openrouter') {
        generatedContent = data.choices?.[0]?.message?.content;
      } else if (request.provider === 'anthropic') {
        generatedContent = data.content?.[0]?.text;
      } else {
        throw new Error(`Unsupported provider response format: ${request.provider}`);
      }

      if (!generatedContent) {
        throw new Error('No content received from AI provider');
      }

      // Parse the JSON response
      let parsedTemplate: AIGeneratedTemplate;
      try {
        parsedTemplate = JSON.parse(generatedContent);
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError);
        console.log('Raw response:', generatedContent);
        throw new Error('AI response was not valid JSON. Please try again.');
      }

      // Validate the response structure
      if (!parsedTemplate.pages || !Array.isArray(parsedTemplate.pages) || parsedTemplate.pages.length === 0 || !parsedTemplate.explanation) {
        throw new Error('AI response missing required fields (pages array, explanation)');
      }

      // Validate each page has required fields
      for (const page of parsedTemplate.pages) {
        if (!page.filename || !page.title || !page.content || !page.description) {
          throw new Error(`Page missing required fields: ${JSON.stringify(page)}`);
        }
      }

      console.log('✅ Successfully generated AI template');
      return parsedTemplate;

    } catch (error) {
      console.error('❌ AI template generation failed:', error);
      throw error;
    }
  }

  // Method to set API configuration
  setApiConfiguration(provider: string, apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || '';
    
    // Save to localStorage
    const config = {
      provider,
      apiKey,
      baseUrl: this.baseUrl
    };
    localStorage.setItem('lumaui-ai-config', JSON.stringify(config));
  }

  // Method to check if API is configured
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // Method to get available providers
  static getAvailableProviders() {
    return [
      {
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-4', name: 'GPT-4' },
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
        ]
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: [
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
          { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
          { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
        ]
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        models: [
          { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
          { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' }
        ]
      }
    ];
  }
} 
