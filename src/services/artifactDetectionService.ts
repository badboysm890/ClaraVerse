/**
 * Artifact Detection Service
 * 
 * This service automatically detects and extracts various types of structured content
 * from AI responses to create artifacts for enhanced display and interaction.
 * 
 * Features:
 * - Automatic detection of code blocks, tables, charts, diagrams
 * - Language detection for 25+ programming languages
 * - Pattern-based extraction with priority system
 * - Context-aware detection based on user requests
 * - Support for markdown tables, JSON data, CSV, SQL, LaTeX math
 * - Mermaid diagram detection both in code blocks and unmarked content
 */

import { angelaArtifact, angelaArtifactType, angelaAIConfig } from '../types/angela_assistant_types';

export interface DetectionContext {
  userMessage?: string;
  conversationHistory?: string[];
  messageContent: string;
  attachments?: any[];
  artifactConfig?: angelaAIConfig['artifacts'];
}

export interface DetectionResult {
  artifacts: angelaArtifact[];
  cleanedContent: string;
  detectionSummary: {
    totalArtifacts: number;
    artifactTypes: string[];
    detectionConfidence: number;
    skippedInlineVisuals: boolean;
  };
}

/**
 * Programming language detection patterns
 */
const LANGUAGE_PATTERNS = {
  javascript: [
    /function\s+\w+\s*\(/,
    /const\s+\w+\s*=/,
    /let\s+\w+\s*=/,
    /var\s+\w+\s*=/,
    /=>\s*{/,
    /console\.log\(/,
    /document\./,
    /window\./,
    /require\(/,
    /import\s+.*from/,
    /export\s+(default\s+)?/
  ],
  typescript: [
    /interface\s+\w+/,
    /type\s+\w+\s*=/,
    /:\s*(string|number|boolean|any)\s*[;,}]/,
    /function\s+\w+\s*\([^)]*:\s*\w+/,
    /class\s+\w+\s+implements/,
    /<.*>/
  ],
  python: [
    /def\s+\w+\s*\(/,
    /class\s+\w+\s*[\(:]?/,
    /import\s+\w+/,
    /from\s+\w+\s+import/,
    /if\s+__name__\s*==\s*['"']__main__['"']/,
    /print\s*\(/,
    /range\s*\(/,
    /len\s*\(/,
    /self\./
  ],
  java: [
    /public\s+class\s+\w+/,
    /private\s+\w+\s+\w+/,
    /public\s+static\s+void\s+main/,
    /System\.out\.println/,
    /import\s+java\./,
    /package\s+\w+/,
    /@Override/,
    /new\s+\w+\s*\(/
  ],
  cpp: [
    /#include\s*<.*>/,
    /using\s+namespace\s+std/,
    /int\s+main\s*\(/,
    /cout\s*<<|cin\s*>>/,
    /std::/,
    /class\s+\w+\s*{/,
    /template\s*</,
    /nullptr/
  ],
  csharp: [
    /using\s+System/,
    /namespace\s+\w+/,
    /public\s+class\s+\w+/,
    /Console\.WriteLine/,
    /string\[\]\s+args/,
    /var\s+\w+\s*=/,
    /\[.*\]/,
    /get;\s*set;/
  ],
  sql: [
    /SELECT\s+.*\s+FROM/i,
    /INSERT\s+INTO/i,
    /UPDATE\s+\w+\s+SET/i,
    /DELETE\s+FROM/i,
    /CREATE\s+(TABLE|DATABASE|INDEX)/i,
    /ALTER\s+TABLE/i,
    /DROP\s+(TABLE|DATABASE)/i,
    /WHERE\s+.*=/i,
    /JOIN\s+.*\s+ON/i,
    /GROUP\s+BY/i,
    /ORDER\s+BY/i
  ],
  html: [
    /<html[^>]*>/i,
    /<head[^>]*>/i,
    /<body[^>]*>/i,
    /<div[^>]*>/i,
    /<p[^>]*>/i,
    /<a\s+href/i,
    /<img\s+src/i,
    /<script[^>]*>/i,
    /<style[^>]*>/i,
    /<!DOCTYPE/i
  ],
  css: [
    /\.[a-zA-Z][\w-]*\s*{/,
    /#[a-zA-Z][\w-]*\s*{/,
    /[a-zA-Z][\w-]*\s*:\s*[^;]+;/,
    /@media\s*\(/,
    /@import\s+/,
    /background-color\s*:/,
    /font-family\s*:/,
    /margin\s*:/,
    /padding\s*:/,
    /display\s*:/
  ],
  json: [
    /^\s*{[\s\S]*?\}/,
    /^\s*\[[\s\S]*?\]/,
    /"[^"]*"\s*:\s*"[^"]*"/,
    /"[^"]*"\s*:\s*\d+/,
    /"[^"]*"\s*:\s*true|false/,
    /"[^"]*"\s*:\s*null/
  ],
  xml: [
    /<\?xml\s+version/i,
    /<[a-zA-Z][\w-]*[^>]*>[\s\S]*<\/[a-zA-Z][\w-]*>/,
    /<[a-zA-Z][\w-]*\s+[^>]*\/>/,
    /xmlns\s*=/i
  ],
  yaml: [
    /^[a-zA-Z][\w-]*\s*:\s*$/m,
    /^[a-zA-Z][\w-]*\s*:\s*[^{}\[\]]/m,
    /^\s*-\s+[a-zA-Z]/m,
    /^---\s*$/m,
    /^\.\.\.\s*$/m
  ],
  markdown: [
    /^#{1,6}\s+/m,
    /\*\*[^*]+\*\*/,
    /\*[^*]+\*/,
    /`[^`]+`/,
    /```[\s\S]*?```/,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /\[([^\]]+)\]\(([^)]+)\)/,
    /!\[([^\]]*)\]\(([^)]+)\)/
  ],
  bash: [
    /^#!/,
    /\$\w+/,
    /echo\s+/,
    /grep\s+/,
    /awk\s+/,
    /sed\s+/,
    /find\s+/,
    /chmod\s+/,
    /sudo\s+/,
    /export\s+\w+=/,
    /if\s+\[.*\];\s*then/,
    /for\s+\w+\s+in/
  ],
  go: [
    /package\s+main/,
    /import\s+\(/,
    /func\s+main\s*\(\)/,
    /func\s+\w+\s*\(/,
    /fmt\.Print/,
    /var\s+\w+\s+\w+/,
    /:=\s*/,
    /go\s+\w+\(/,
    /chan\s+\w+/,
    /defer\s+/
  ],
  rust: [
    /fn\s+main\s*\(\)/,
    /fn\s+\w+\s*\(/,
    /let\s+mut\s+\w+/,
    /let\s+\w+\s*=/,
    /println!\s*\(/,
    /use\s+std::/,
    /struct\s+\w+/,
    /impl\s+\w+/,
    /match\s+\w+/,
    /&str|&mut/
  ],
  php: [
    /<\?php/,
    /\$\w+\s*=/,
    /echo\s+/,
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /new\s+\w+\s*\(/,
    /require_once|include_once/,
    /\$_GET|\$_POST|\$_SESSION/,
    /mysqli_|PDO::/
  ],
  ruby: [
    /def\s+\w+/,
    /class\s+\w+/,
    /puts\s+/,
    /require\s+/,
    /end\s*$/m,
    /@\w+/,
    /\|\w+\|/,
    /\.each\s+do/,
    /if\s+.*\s+then/,
    /unless\s+/
  ],
  swift: [
    /import\s+\w+/,
    /func\s+\w+\s*\(/,
    /var\s+\w+\s*:/,
    /let\s+\w+\s*=/,
    /class\s+\w+\s*:/,
    /struct\s+\w+/,
    /print\s*\(/,
    /override\s+func/,
    /extension\s+\w+/,
    /protocol\s+\w+/
  ],
  kotlin: [
    /fun\s+main\s*\(/,
    /fun\s+\w+\s*\(/,
    /val\s+\w+\s*=/,
    /var\s+\w+\s*:/,
    /class\s+\w+/,
    /println\s*\(/,
    /import\s+\w+/,
    /when\s*\(/,
    /data\s+class/,
    /companion\s+object/
  ],
  r: [
    /<-\s*/,
    /library\s*\(/,
    /data\.frame\s*\(/,
    /ggplot\s*\(/,
    /summary\s*\(/,
    /mean\s*\(/,
    /plot\s*\(/,
    /c\s*\(/,
    /function\s*\(/,
    /if\s*\(.*\)\s*{/
  ],
  matlab: [
    /function\s+.*=\s*\w+\s*\(/,
    /fprintf\s*\(/,
    /disp\s*\(/,
    /plot\s*\(/,
    /figure\s*\(/,
    /end\s*$/m,
    /for\s+\w+\s*=\s*\d+:\d+/,
    /if\s+.*\s*$/m,
    /zeros\s*\(/,
    /ones\s*\(/
  ]
};

/**
 * Content type detection patterns
 */
const CONTENT_PATTERNS = {
  mermaidDiagram: [
    /graph\s+(TD|TB|BT|RL|LR)/i,
    /flowchart\s+(TD|TB|BT|RL|LR)/i,
    /sequenceDiagram/i,
    /classDiagram/i,
    /stateDiagram/i,
    /erDiagram/i,
    /journey/i,
    /gantt/i,
    /pie\s+title/i,
    /gitgraph/i,
    /mindmap/i,
    /timeline/i,
    /quadrantChart/i,
    /requirementDiagram/i,
    /C4Context/i
  ],
  table: [
    /\|.*\|.*\|/,
    /^\s*\|.*\|\s*$/m,
    /\|[-:]+\|/,
    /\|\s*[-:]+\s*\|/
  ],
  csvData: [
    /^[^,\n]+,[^,\n]+/m,
    /^"[^"]*","[^"]*"/m,
    /^\w+,\w+,\w+/m
  ],
  jsonData: [
    /^\s*{[\s\S]*}\s*$/,
    /^\s*\[[\s\S]*\]\s*$/
  ],
  mathFormula: [
    /\$\$[\s\S]*?\$\$/,
    /\$[^$]+\$/,
    /\\begin\{.*\}[\s\S]*?\\end\{.*\}/,
    /\\frac\{.*\}\{.*\}/,
    /\\sum_\{.*\}/,
    /\\int_\{.*\}/,
    /\\alpha|\\beta|\\gamma|\\delta|\\epsilon/,
    /\\sqrt\{.*\}/,
    /\\lim_\{.*\}/
  ],
  apiResponse: [
    /HTTP\/\d\.\d\s+\d{3}/,
    /Content-Type:\s*application\/json/i,
    /\{\s*"status":\s*\d+/,
    /\{\s*"data":\s*\{/,
    /\{\s*"error":\s*"/,
    /\{\s*"message":\s*"/
  ],
  sqlQuery: [
    /SELECT\s+.*\s+FROM\s+\w+/i,
    /INSERT\s+INTO\s+\w+/i,
    /UPDATE\s+\w+\s+SET/i,
    /DELETE\s+FROM\s+\w+/i,
    /CREATE\s+TABLE\s+\w+/i,
    /ALTER\s+TABLE\s+\w+/i
  ],
  configFile: [
    /^\s*[a-zA-Z][\w-]*\s*=\s*[^=]+$/m,
    /^\s*[a-zA-Z][\w-]*:\s*[^:]+$/m,
    /^\[.*\]$/m,
    /^#.*$/m
  ],
  logFile: [
    /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/,
    /\[INFO\]|\[ERROR\]|\[WARN\]|\[DEBUG\]/i,
    /ERROR:|WARN:|INFO:|DEBUG:/i,
    /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/
  ],
  chartData: [
    /\{\s*"labels":\s*\[/,
    /\{\s*"datasets":\s*\[/,
    /\{\s*"data":\s*\[.*\]/,
    /\{\s*"x":\s*\d+,\s*"y":\s*\d+/
  ]
};

/**
 * Main artifact detection service
 */
export class ArtifactDetectionService {
  /**
   * Detect and extract artifacts from message content
   */
  static detectArtifacts(context: DetectionContext): DetectionResult {
    const { messageContent, userMessage = '', conversationHistory = [], artifactConfig } = context;
    const artifacts: angelaArtifact[] = [];
    const placeholders: { [key: string]: string } = {};
    let cleanedContent = messageContent;
    let detectionConfidence = 0;

    console.log('🎯 Starting artifact detection with inline visual filtering...');
    console.log('📋 Content length:', messageContent.length);

    // **NEW: Skip artifact creation for visual content that will be rendered inline**
    // This prevents duplicate rendering - charts/diagrams will show inline instead of as artifacts
    const skipVisualArtifacts = artifactConfig?.enableInlineVisuals !== false; // Default to true

    if (skipVisualArtifacts) {
      console.log('✅ Inline visual rendering enabled - skipping chart/diagram artifacts to prevent duplicates');
    }

    try {
      // Get artifact configuration with defaults
      const config = {
        enableCodeArtifacts: artifactConfig?.enableCodeArtifacts ?? true,
        enableChartArtifacts: artifactConfig?.enableChartArtifacts ?? true,
        enableTableArtifacts: artifactConfig?.enableTableArtifacts ?? true,
        enableMermaidArtifacts: artifactConfig?.enableMermaidArtifacts ?? true,
        enableHtmlArtifacts: artifactConfig?.enableHtmlArtifacts ?? true,
        enableMarkdownArtifacts: artifactConfig?.enableMarkdownArtifacts ?? true,
        enableJsonArtifacts: artifactConfig?.enableJsonArtifacts ?? true,
        enableDiagramArtifacts: artifactConfig?.enableDiagramArtifacts ?? true,
        maxArtifactsPerMessage: artifactConfig?.maxArtifactsPerMessage ?? 10
      };

      // 1. Extract code blocks (highest priority) - if enabled
      if (config.enableCodeArtifacts) {
        const codeResult = this.extractCodeBlocks(messageContent);
        console.log(`📦 Found ${codeResult.artifacts.length} code blocks`);

        for (const artifact of codeResult.artifacts) {
          console.log(`🔍 Processing code block: ${artifact.language || 'unknown'} (${artifact.content.length} chars)`);

          // **MODIFIED: Skip visual artifacts if inline rendering is enabled**
          if (skipVisualArtifacts) {
            // Check if this is a visual element that will be rendered inline
            const isInlineVisual = this.isInlineVisualContentFromArtifact(artifact);
            if (isInlineVisual) {
              console.log(`⏭️ Skipping ${artifact.language} artifact - will be rendered inline in chat`);
              continue; // Skip creating artifact, let inline renderer handle it
            }
          }

          // Add non-visual artifacts
          artifacts.push(artifact);
          console.log(`✅ Added ${artifact.type} artifact: ${artifact.title}`);
        }
        
        cleanedContent = codeResult.cleanedContent;
        detectionConfidence += codeResult.confidence;
      }

      // 2. Extract tables - if enabled
      if (config.enableTableArtifacts) {
        const tableArtifacts = this.extractTables(cleanedContent);
        artifacts.push(...tableArtifacts.artifacts);
        cleanedContent = tableArtifacts.cleanedContent;
        detectionConfidence += tableArtifacts.confidence;
      }

      // 3. Extract Mermaid diagrams - if enabled AND not skipping visual artifacts
      if ((config.enableMermaidArtifacts || config.enableDiagramArtifacts) && !skipVisualArtifacts) {
        const diagramArtifacts = this.extractMermaidDiagrams(cleanedContent);
        artifacts.push(...diagramArtifacts.artifacts);
        cleanedContent = diagramArtifacts.cleanedContent;
        detectionConfidence += diagramArtifacts.confidence;
      } else if (skipVisualArtifacts) {
        console.log('⏭️ Skipping Mermaid diagram artifacts - will be rendered inline in chat');
      }

      // 4. Extract JSON/CSV data - if enabled
      if (config.enableJsonArtifacts) {
        const dataArtifacts = this.extractStructuredData(cleanedContent);
        artifacts.push(...dataArtifacts.artifacts);
        cleanedContent = dataArtifacts.cleanedContent;
        detectionConfidence += dataArtifacts.confidence;
      }

      // 5. Extract math formulas - if markdown is enabled
      if (config.enableMarkdownArtifacts) {
        const mathArtifacts = this.extractMathFormulas(cleanedContent);
        artifacts.push(...mathArtifacts.artifacts);
        cleanedContent = mathArtifacts.cleanedContent;
        detectionConfidence += mathArtifacts.confidence;
      }

      // 6. Context-aware detection based on user request - if any types are enabled
      if (Object.values(config).some(enabled => enabled === true)) {
        const contextArtifacts = this.detectFromContext(cleanedContent, userMessage, conversationHistory);
        // Filter context artifacts based on configuration
        const filteredContextArtifacts = contextArtifacts.artifacts.filter(artifact => {
          switch (artifact.type) {
            case 'code': return config.enableCodeArtifacts;
            case 'chart': return config.enableChartArtifacts;
            case 'table': return config.enableTableArtifacts;
            case 'mermaid': return config.enableMermaidArtifacts;
            case 'html': return config.enableHtmlArtifacts;
            case 'markdown': return config.enableMarkdownArtifacts;
            case 'json': return config.enableJsonArtifacts;
            case 'diagram': return config.enableDiagramArtifacts;
            default: return true; // Allow unknown types by default
          }
        });
        
        artifacts.push(...filteredContextArtifacts);
        cleanedContent = contextArtifacts.cleanedContent;
        detectionConfidence += contextArtifacts.confidence;
      }

      // Apply max artifacts limit
      const limitedArtifacts = artifacts.slice(0, config.maxArtifactsPerMessage);
      
      // Log configuration usage
      if (artifacts.length > limitedArtifacts.length) {
        console.log(`🎨 Artifact limit applied: ${artifacts.length} detected, ${limitedArtifacts.length} kept (max: ${config.maxArtifactsPerMessage})`);
      }
      
      if (limitedArtifacts.length > 0) {
        console.log(`🎨 Artifact detection config used:`, {
          enabledTypes: Object.entries(config)
            .filter(([key, value]) => key.startsWith('enable') && value === true)
            .map(([key]) => key.replace('enable', '').replace('Artifacts', '')),
          maxLimit: config.maxArtifactsPerMessage,
          detected: limitedArtifacts.length
        });
      }

      // Normalize confidence score
      const maxPossibleConfidence = 6; // Number of detection methods
      const normalizedConfidence = Math.min(detectionConfidence / maxPossibleConfidence, 1);

      // Return the final detection result
      return {
        artifacts: limitedArtifacts,
        cleanedContent: cleanedContent,
        detectionSummary: {
          totalArtifacts: limitedArtifacts.length,
          artifactTypes: [...new Set(limitedArtifacts.map(a => a.type))],
          detectionConfidence: normalizedConfidence,
          skippedInlineVisuals: skipVisualArtifacts
        }
      };

    } catch (error) {
      console.error('❌ Error during artifact detection:', error);
      
      return {
        artifacts: [],
        cleanedContent: messageContent,
        detectionSummary: {
          totalArtifacts: 0,
          artifactTypes: [],
          detectionConfidence: 0,
          skippedInlineVisuals: skipVisualArtifacts
        }
      };
    }
  }

  /**
   * Extract code blocks from content
   */
  private static extractCodeBlocks(content: string): { artifacts: angelaArtifact[]; cleanedContent: string; confidence: number } {
    const artifacts: angelaArtifact[] = [];
    let cleanedContent = content; // Keep original content instead of cleaning
    let confidence = 0;

    // Extract fenced code blocks
    const fencedCodeRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    let match;
    
    while ((match = fencedCodeRegex.exec(content)) !== null) {
      const language = match[1] || this.detectLanguage(match[2]);
      const code = match[2].trim();
      
      if (code.length > 10) { // Only create artifacts for substantial code
        artifacts.push({
          id: this.generateId(),
          type: 'code',
          title: `${language.charAt(0).toUpperCase() + language.slice(1)} Code`,
          content: code,
          language: language,
          createdAt: new Date(),
          isExecutable: this.isExecutableLanguage(language),
          metadata: {
            detectedLanguage: language,
            lineCount: code.split('\n').length,
            characterCount: code.length,
            preserveInline: true // Flag to indicate content should stay inline
          }
        });
        
        // DON'T remove from cleaned content - keep original
        // cleanedContent = cleanedContent.replace(match[0], `\n[Code block: ${language}]\n`);
        confidence += 0.3;
      }
    }

    // Extract inline code that might be substantial
    const inlineCodeRegex = /`([^`]{50,})`/g;
    while ((match = inlineCodeRegex.exec(content)) !== null) {
      const code = match[1].trim();
      const language = this.detectLanguage(code);
      
      if (language !== 'text') {
        artifacts.push({
          id: this.generateId(),
          type: 'code',
          title: `Inline ${language.charAt(0).toUpperCase() + language.slice(1)}`,
          content: code,
          language: language,
          createdAt: new Date(),
          metadata: {
            detectedLanguage: language,
            inline: true,
            preserveInline: true
          }
        });
        
        // DON'T remove from cleaned content - keep original
        // cleanedContent = cleanedContent.replace(match[0], `[Inline code: ${language}]`);
        confidence += 0.1;
      }
    }

    return { artifacts, cleanedContent, confidence };
  }

  /**
   * Extract tables from content
   */
  private static extractTables(content: string): { artifacts: angelaArtifact[]; cleanedContent: string; confidence: number } {
    const artifacts: angelaArtifact[] = [];
    let cleanedContent = content; // Keep original content instead of cleaning
    let confidence = 0;

    // Extract markdown tables
    const tableRegex = /(\|.*\|.*\n)+(\|[-:]+\|.*\n)(\|.*\|.*\n)*/g;
    let match;
    
    while ((match = tableRegex.exec(content)) !== null) {
      const tableText = match[0].trim();
      const lines = tableText.split('\n');
      
      if (lines.length >= 3) { // Header, separator, at least one data row
        const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);
        const dataRows = lines.slice(2).map(row => 
          row.split('|').map(cell => cell.trim()).filter(cell => cell)
        );
        
        // Convert to JSON format
        const tableData = dataRows.map(row => {
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] || '';
          });
          return obj;
        });
        
        artifacts.push({
          id: this.generateId(),
          type: 'table',
          title: `Data Table (${dataRows.length} rows)`,
          content: JSON.stringify(tableData, null, 2),
          createdAt: new Date(),
          metadata: {
            rowCount: dataRows.length,
            columnCount: headers.length,
            headers: headers,
            format: 'markdown',
            preserveInline: true
          }
        });
        
        // DON'T remove from cleaned content - keep original
        // cleanedContent = cleanedContent.replace(match[0], `\n[Table: ${dataRows.length} rows, ${headers.length} columns]\n`);
        confidence += 0.4;
      }
    }

    // Extract CSV-like data
    const csvRegex = /^([^,\n]+,){2,}[^,\n]*\n(([^,\n]+,){2,}[^,\n]*\n){2,}/gm;
    while ((match = csvRegex.exec(content)) !== null) {
      const csvText = match[0].trim();
      const lines = csvText.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      const dataRows = lines.slice(1).map(row => row.split(',').map(cell => cell.trim()));
      
      const tableData = dataRows.map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });
      
      artifacts.push({
        id: this.generateId(),
        type: 'table',
        title: `CSV Data (${dataRows.length} rows)`,
        content: JSON.stringify(tableData, null, 2),
        createdAt: new Date(),
        metadata: {
          rowCount: dataRows.length,
          columnCount: headers.length,
          headers: headers,
          format: 'csv',
          originalCsv: csvText,
          preserveInline: true
        }
      });
      
      // DON'T remove from cleaned content - keep original
      // cleanedContent = cleanedContent.replace(match[0], `\n[CSV Data: ${dataRows.length} rows]\n`);
      confidence += 0.3;
    }

    return { artifacts, cleanedContent, confidence };
  }

  /**
   * Extract Mermaid diagrams
   */
  private static extractMermaidDiagrams(content: string): { artifacts: angelaArtifact[]; cleanedContent: string; confidence: number } {
    const artifacts: angelaArtifact[] = [];
    let cleanedContent = content;
    let confidence = 0;

    console.log('🔍 Checking for Mermaid diagrams in content:', content.substring(0, 200) + '...');

    // SKIP Mermaid code blocks - they're already handled by extractCodeBlocks()
    // We only look for inline/unmarked Mermaid diagrams here
    
    console.log('🔍 Skipping Mermaid code blocks (handled by extractCodeBlocks), checking for inline diagrams...');
    
    // Remove any existing code blocks from content before checking for inline diagrams
    const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
    
    // Only look for inline Mermaid diagrams (not in code blocks)
    if (contentWithoutCodeBlocks.trim().length > 0) {
      console.log('🔍 No Mermaid code blocks found, checking for inline diagrams...');
      
      // Check for Mermaid patterns in the content (excluding code blocks)
      for (const pattern of CONTENT_PATTERNS.mermaidDiagram) {
        console.log('🔍 Testing pattern:', pattern.toString());
        if (pattern.test(contentWithoutCodeBlocks)) {
          console.log('✅ Pattern matched:', pattern.toString());
          
          // Try to extract the diagram with improved logic
          const lines = contentWithoutCodeBlocks.split('\n');
          let diagramStart = -1;
          let diagramEnd = -1;
          
          // Find the start of the diagram
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i]) && diagramStart === -1) {
              diagramStart = i;
              console.log('📍 Diagram start found at line:', i, '→', lines[i]);
              break;
            }
          }
          
          if (diagramStart !== -1) {
            // Find the end of the diagram by looking for meaningful content
            let consecutiveEmptyLines = 0;
            let lastContentLine = diagramStart;
            
            for (let i = diagramStart + 1; i < lines.length; i++) {
              const line = lines[i].trim();
              
              // Check if this line looks like Mermaid content
              const isMermaidLine = line && (
                line.includes('-->') ||
                line.includes('subgraph') ||
                line.includes('end') ||
                line.match(/^\s*[A-Z]\[.*\]/) ||
                line.match(/^\s*[A-Z]\s*-->/) ||
                line.includes('|') ||
                line.includes('graph') ||
                line.includes('flowchart') ||
                line.includes('sequenceDiagram') ||
                line.includes('classDiagram') ||
                line.includes('gantt') ||
                line.includes('gitGraph')
              );
              
              if (isMermaidLine) {
                lastContentLine = i;
                consecutiveEmptyLines = 0;
              } else if (line === '') {
                consecutiveEmptyLines++;
                // Allow up to 2 consecutive empty lines within a diagram
                if (consecutiveEmptyLines > 2) {
                  diagramEnd = lastContentLine;
                  break;
                }
              } else {
                // Non-empty, non-Mermaid line - likely end of diagram
                diagramEnd = lastContentLine;
                break;
              }
            }
            
            // If we reached the end of content, use the last content line
            if (diagramEnd === -1) {
              diagramEnd = lastContentLine;
            }
            
            console.log('📍 Diagram end found at line:', diagramEnd);
            
            if (diagramStart !== -1 && diagramEnd >= diagramStart) {
              const diagramContent = lines.slice(diagramStart, diagramEnd + 1).join('\n').trim();
              console.log('📋 Extracted diagram content:', diagramContent);
              
              if (diagramContent.length > 20) {
                const diagramType = this.detectMermaidType(diagramContent);
                console.log('🎨 Detected diagram type:', diagramType);
                
                artifacts.push({
                  id: this.generateId(),
                  type: 'mermaid',
                  title: `${diagramType} Diagram`,
                  content: diagramContent,
                  createdAt: new Date(),
                  metadata: {
                    diagramType: diagramType,
                    lineCount: diagramContent.split('\n').length,
                    preserveInline: true
                  }
                });
                
                console.log('✅ Mermaid artifact created successfully');
                confidence += 0.5;
                break; // Only extract the first diagram found
              } else {
                console.log('⚠️ Diagram content too short:', diagramContent.length, 'chars');
              }
            } else {
              console.log('⚠️ Could not determine diagram boundaries');
            }
          }
        } else {
          console.log('❌ Pattern did not match:', pattern.toString());
        }
      }
    } else {
      console.log('🔍 No content remaining after removing code blocks');
    }

    if (artifacts.length === 0) {
      console.log('❌ No Mermaid diagrams detected in content');
    } else {
      console.log('✅ Detected', artifacts.length, 'Mermaid diagram(s)');
    }

    return { artifacts, cleanedContent, confidence };
  }

  /**
   * Extract structured data (JSON, API responses, etc.)
   */
  private static extractStructuredData(content: string): { artifacts: angelaArtifact[]; cleanedContent: string; confidence: number } {
    const artifacts: angelaArtifact[] = [];
    let cleanedContent = content;
    let confidence = 0;

    // Extract JSON objects
    const jsonRegex = /\{[\s\S]*?\}/g;
    let match;
    
    while ((match = jsonRegex.exec(content)) !== null) {
      try {
        const jsonText = match[0];
        const parsed = JSON.parse(jsonText);
        
        // Only create artifacts for substantial JSON objects
        if (Object.keys(parsed).length > 2 || JSON.stringify(parsed).length > 100) {
          const artifactType = this.detectJsonType(parsed);
          
          artifacts.push({
            id: this.generateId(),
            type: artifactType,
            title: this.getJsonTitle(parsed, artifactType),
            content: JSON.stringify(parsed, null, 2),
            createdAt: new Date(),
            metadata: {
              objectKeys: Object.keys(parsed),
              dataType: artifactType,
              size: JSON.stringify(parsed).length,
              preserveInline: true
            }
          });
          
          // DON'T remove from cleaned content - keep original
          // cleanedContent = cleanedContent.replace(match[0], `\n[${artifactType}: ${this.getJsonTitle(parsed, artifactType)}]\n`);
          confidence += 0.3;
        }
      } catch (error) {
        // Not valid JSON, skip
      }
    }

    // Extract JSON arrays
    const arrayRegex = /\[[\s\S]*?\]/g;
    while ((match = arrayRegex.exec(content)) !== null) {
      try {
        const arrayText = match[0];
        const parsed = JSON.parse(arrayText);
        
        if (Array.isArray(parsed) && parsed.length > 1) {
          const artifactType = this.detectArrayType(parsed);
          
          artifacts.push({
            id: this.generateId(),
            type: artifactType,
            title: `${artifactType.charAt(0).toUpperCase() + artifactType.slice(1)} (${parsed.length} items)`,
            content: JSON.stringify(parsed, null, 2),
            createdAt: new Date(),
            metadata: {
              arrayLength: parsed.length,
              dataType: artifactType,
              itemType: typeof parsed[0],
              preserveInline: true
            }
          });
          
          // DON'T remove from cleaned content - keep original
          // cleanedContent = cleanedContent.replace(match[0], `\n[${artifactType}: ${parsed.length} items]\n`);
          confidence += 0.2;
        }
      } catch (error) {
        // Not valid JSON, skip
      }
    }

    return { artifacts, cleanedContent, confidence };
  }

  /**
   * Extract math formulas
   */
  private static extractMathFormulas(content: string): { artifacts: angelaArtifact[]; cleanedContent: string; confidence: number } {
    const artifacts: angelaArtifact[] = [];
    let cleanedContent = content;
    let confidence = 0;

    // Extract LaTeX math blocks
    const mathBlockRegex = /\$\$([\s\S]*?)\$\$/g;
    let match;
    
    while ((match = mathBlockRegex.exec(content)) !== null) {
      const mathContent = match[1].trim();
      
      if (mathContent.length > 5) {
        artifacts.push({
          id: this.generateId(),
          type: 'markdown',
          title: 'Mathematical Formula',
          content: mathContent,
          createdAt: new Date(),
          metadata: {
            format: 'latex',
            displayMode: 'block',
            preserveInline: true
          }
        });
        
        // DON'T remove from cleaned content - keep original
        // cleanedContent = cleanedContent.replace(match[0], '\n[Mathematical Formula]\n');
        confidence += 0.4;
      }
    }

    // Extract inline math
    const inlineMathRegex = /\$([^$]{10,})\$/g;
    while ((match = inlineMathRegex.exec(content)) !== null) {
      const mathContent = match[1].trim();
      
      artifacts.push({
        id: this.generateId(),
        type: 'markdown',
        title: 'Inline Math',
        content: mathContent,
        createdAt: new Date(),
        metadata: {
          format: 'latex',
          displayMode: 'inline',
          preserveInline: true
        }
      });
      
      // DON'T remove from cleaned content - keep original
      // cleanedContent = cleanedContent.replace(match[0], '[Math Formula]');
      confidence += 0.2;
    }

    return { artifacts, cleanedContent, confidence };
  }

  /**
   * Context-aware detection based on user request
   */
  private static detectFromContext(content: string, userMessage: string, conversationHistory: string[]): { artifacts: angelaArtifact[]; cleanedContent: string; confidence: number } {
    const artifacts: angelaArtifact[] = [];
    let cleanedContent = content;
    let confidence = 0;

    const userLower = userMessage.toLowerCase();
    const contentLower = content.toLowerCase();

    // Chart/visualization requests
    if ((userLower.includes('chart') || userLower.includes('graph') || userLower.includes('plot')) &&
        (contentLower.includes('data') || contentLower.includes('values'))) {
      
      // Try to extract chart data
      const numberArrays = content.match(/\[[\d\s,.-]+\]/g);
      if (numberArrays && numberArrays.length > 0) {
        const chartData = {
          labels: ['Data 1', 'Data 2', 'Data 3', 'Data 4', 'Data 5'],
          datasets: [{
            label: 'Dataset',
            data: numberArrays[0].match(/[\d.-]+/g)?.map(Number).slice(0, 5) || [1, 2, 3, 4, 5]
          }]
        };
        
        artifacts.push({
          id: this.generateId(),
          type: 'chart',
          title: 'Data Visualization',
          content: JSON.stringify(chartData, null, 2),
          createdAt: new Date(),
          metadata: {
            chartType: 'auto-detected',
            dataSource: 'user-request'
          }
        });
        
        confidence += 0.6;
      }
    }

    // API documentation requests
    if (userLower.includes('api') && (contentLower.includes('endpoint') || contentLower.includes('request') || contentLower.includes('response'))) {
      // Look for API-like content
      const apiPatterns = [
        /GET|POST|PUT|DELETE|PATCH/i,
        /\/api\/\w+/,
        /HTTP\/\d\.\d/,
        /Content-Type:/i
      ];
      
      if (apiPatterns.some(pattern => pattern.test(content))) {
        artifacts.push({
          id: this.generateId(),
          type: 'json',
          title: 'API Documentation',
          content: content,
          createdAt: new Date(),
          metadata: {
            detectedFrom: 'context',
            userRequest: userMessage
          }
        });
        
        confidence += 0.5;
      }
    }

    // Database/SQL requests
    if ((userLower.includes('database') || userLower.includes('sql') || userLower.includes('query')) &&
        CONTENT_PATTERNS.sqlQuery.some(pattern => pattern.test(content))) {
      
      artifacts.push({
        id: this.generateId(),
        type: 'code',
        title: 'SQL Query',
        content: content,
        language: 'sql',
        createdAt: new Date(),
        metadata: {
          detectedFrom: 'context',
          queryType: 'auto-detected'
        }
      });
      
      confidence += 0.5;
    }

    return { artifacts, cleanedContent, confidence };
  }

  /**
   * Detect programming language from code content
   */
  private static detectLanguage(code: string): string {
    const codeLines = code.split('\n').slice(0, 20); // Check first 20 lines
    const codeText = codeLines.join('\n');
    
    let maxScore = 0;
    let detectedLanguage = 'text';
    
    for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
      let score = 0;
      
      for (const pattern of patterns) {
        if (pattern.test(codeText)) {
          score += 1;
        }
      }
      
      // Normalize score by number of patterns
      const normalizedScore = score / patterns.length;
      
      if (normalizedScore > maxScore && normalizedScore > 0.2) {
        maxScore = normalizedScore;
        detectedLanguage = language;
      }
    }
    
    return detectedLanguage;
  }

  /**
   * Check if language is executable
   */
  private static isExecutableLanguage(language: string): boolean {
    const executableLanguages = ['javascript', 'python', 'sql', 'html', 'css'];
    return executableLanguages.includes(language.toLowerCase());
  }

  /**
   * Detect Mermaid diagram type
   */
  private static detectMermaidType(content: string): string {
    const contentLower = content.toLowerCase();
    
    if (contentLower.includes('sequencediagram')) return 'Sequence';
    if (contentLower.includes('classdiagram')) return 'Class';
    if (contentLower.includes('statediagram')) return 'State';
    if (contentLower.includes('erdiagram')) return 'Entity Relationship';
    if (contentLower.includes('journey')) return 'User Journey';
    if (contentLower.includes('gantt')) return 'Gantt';
    if (contentLower.includes('pie')) return 'Pie Chart';
    if (contentLower.includes('gitgraph')) return 'Git Graph';
    if (contentLower.includes('mindmap')) return 'Mind Map';
    if (contentLower.includes('timeline')) return 'Timeline';
    if (contentLower.includes('flowchart') || contentLower.includes('graph')) return 'Flowchart';
    
    return 'Diagram';
  }

  /**
   * Detect JSON object type
   */
  private static detectJsonType(obj: any): angelaArtifactType {
    if (obj.labels && obj.datasets) return 'chart';
    if (obj.status && (obj.data || obj.error)) return 'json';
    if (obj.query || obj.table || obj.rows) return 'json';
    if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') return 'table';
    
    return 'json';
  }

  /**
   * Detect array type
   */
  private static detectArrayType(arr: any[]): angelaArtifactType {
    if (arr.length === 0) return 'json';
    
    const firstItem = arr[0];
    
    if (typeof firstItem === 'object' && firstItem !== null) {
      // Check if it looks like table data
      const keys = Object.keys(firstItem);
      if (keys.length > 1 && arr.every(item => typeof item === 'object' && Object.keys(item).length === keys.length)) {
        return 'table';
      }
      return 'json';
    }
    
    if (typeof firstItem === 'number') return 'chart';
    
    return 'json';
  }

  /**
   * Get appropriate title for JSON content
   */
  private static getJsonTitle(obj: any, type: string): string {
    switch (type) {
      case 'chart':
        return 'Chart Data';
      case 'api-response':
        return `API Response (${obj.status || 'Unknown'})`;
      case 'database-result':
        return 'Database Query Result';
      case 'table':
        return `Data Table (${Array.isArray(obj) ? obj.length : 'Unknown'} rows)`;
      default:
        return 'JSON Data';
    }
  }

  /**
   * Generate unique ID for artifacts
   */
  private static generateId(): string {
    return `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * **NEW: Check if artifact should be rendered inline instead of as a separate artifact**
   */
  private static isInlineVisualContentFromArtifact(artifact: angelaArtifact): boolean {
    const { language, content, type } = artifact;
    
    // Check for Mermaid diagrams
    if (type === 'mermaid' || language === 'mermaid' || 
        content.trim().match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|requirement|c4context)/i)) {
      return true;
    }
    
    // Check for Chart.js JSON
    if ((language === 'json' || type === 'chart') && content.includes('"type":') && content.includes('"data":') && 
        (content.includes('"bar"') || content.includes('"line"') || content.includes('"pie"') || content.includes('"doughnut"'))) {
      return true;
    }
    
    return false;
  }
}

// Debug function for development
if (process.env.NODE_ENV === 'development') {
  // Test artifact detection with the user's specific diagram
  (window as any).testArtifactDetection = (content?: string) => {
    const testContent = content || `Here's a system architecture diagram:

\`\`\`mermaid
graph TD
    A[User Interface] --> B[API Gateway]
    B --> C[User Service]
    B --> D[Product Service]
    B --> E[Order Service]
\`\`\`

This shows the basic microservices architecture.`;

    console.log('🧪 Testing artifact detection...');
    console.log('📝 Test content:', testContent);

    const detectionContext = {
      messageContent: testContent,
      userMessage: "Show me a system architecture diagram",
      conversationHistory: [],
      attachments: [],
      artifactConfig: {
        enableCodeArtifacts: true,
        enableChartArtifacts: true,
        enableTableArtifacts: true,
        enableMermaidArtifacts: true,
        enableHtmlArtifacts: true,
        enableMarkdownArtifacts: true,
        enableJsonArtifacts: true,
        enableDiagramArtifacts: true,
        autoDetectArtifacts: true,
        maxArtifactsPerMessage: 10
      }
    };

    console.log('🔧 Detection context:', detectionContext);

    const result = ArtifactDetectionService.detectArtifacts(detectionContext);

    console.log('📊 Detection result:', result);
    console.log('🎨 Artifacts found:', result.artifacts.length);
    
    result.artifacts.forEach((artifact, index) => {
      console.log(`📋 Artifact ${index + 1}:`, {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        contentLength: artifact.content.length,
        contentPreview: artifact.content.substring(0, 100) + '...',
        metadata: artifact.metadata
      });
    });

    console.log('🧹 Cleaned content:', result.cleanedContent);
    console.log('📈 Detection summary:', result.detectionSummary);

    return result;
  };

  // Test with the user's complex diagram specifically
  (window as any).testComplexDiagram = () => {
    const complexContent = `To illustrate the architecture of a microservices-based e-commerce platform, we can create a diagram that highlights various components and their interactions. Below is a Mermaid diagram that represents the architecture of such a system:

\`\`\`mermaid
graph TD
    subgraph User Interface
        A[Web Application] -->|Interacts with| B[Mobile Application]
    end

    subgraph API Gateway
        C[API Gateway] -->|Routes requests to| D[User Service]
        C --> E[Product Service]
        C --> F[Order Service]
        C --> G[Payment Service]
        C --> H[Cart Service]
        C --> I[Shipping Service]
        C --> J[Notification Service]
    end

    subgraph Microservices
        D -->|Database| K[User Database]
        E -->|Database| L[Product Database]
        F -->|Database| M[Order Database]
        G -->|Third-party API| N[Payment Gateway]
        H -->|Database| O[Cart Database]
        I -->|Database| P[Shipping Database]
        J -->|Database| Q[Notification Database]
    end

    subgraph Infrastructure
        R[Container Orchestration] -->|Deploys| S[Microservices]
        S --> T[Load Balancer]
        T --> U[Service Discovery]
    end

    A --> C
\`\`\`

### Explanation of Components:
1. **User Interface**: This consists of a web application and a mobile application that users interact with.
2. **API Gateway**: This acts as a single entry point for all client requests.`;

    console.log('🧪 Testing complex diagram detection...');
    return (window as any).testArtifactDetection(complexContent);
  };

  // Test inline diagram detection (without code blocks)
  (window as any).testInlineDiagram = () => {
    const inlineContent = `Here's a simple flowchart:

graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E

This shows a basic decision flow.`;

    console.log('🧪 Testing inline diagram detection...');
    return (window as any).testArtifactDetection(inlineContent);
  };

  // Test if Mermaid artifacts are being created correctly
  (window as any).createTestMermaidArtifact = () => {
    console.log('🧪 Creating test Mermaid artifact manually...');
    
    const testArtifact = {
      id: `test-mermaid-${Date.now()}`,
      type: 'mermaid' as const,
      title: 'Test Mermaid Diagram',
      content: `graph TD
    A[User Interface] --> B[API Gateway]
    B --> C[User Service]
    B --> D[Product Service]
    B --> E[Order Service]`,
      createdAt: new Date(),
      metadata: {
        diagramType: 'flowchart',
        lineCount: 5,
        preserveInline: true
      }
    };

    console.log('📋 Test artifact created:', testArtifact);
    console.log('🎯 Artifact type:', testArtifact.type);
    console.log('📝 Artifact content:', testArtifact.content);

    // Try to render it using the window function if available
    if ((window as any).testMermaidRendering) {
      console.log('🎨 Testing rendering with the artifact content...');
      (window as any).testMermaidRendering(testArtifact.content);
    }

    return testArtifact;
  };
}

export default ArtifactDetectionService; 
