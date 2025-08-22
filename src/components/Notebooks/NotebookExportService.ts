import mermaid from 'mermaid';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } from 'docx';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface NotebookContent {
  notebook: {
    id: string;
    name: string;
    description?: string;
    created_at: string;
  };
  notes: Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    createdAt: string;
    updatedAt: string;
  }>;
  chatHistory: Array<{
    id: string;
    type: 'user' | 'assistant' | 'summary';
    content: string;
    timestamp: string;
    citations?: Array<{
      title: string;
      content: string;
    }>;
  }>;
  graphData?: {
    nodes: Array<{
      id: string;
      label: string;
      type: string;
      properties?: Record<string, any>;
    }>;
    edges: Array<{
      source: string;
      target: string;
      relationship: string;
      properties?: Record<string, any>;
    }>;
  };
}

export interface ExportOptions {
  includeNotes: boolean;
  includeChat: boolean;
  includeGraph: boolean;
  includeDiagrams: boolean;
  format: 'md' | 'txt' | 'docx' | 'pdf' | 'html';
}

class NotebookExportService {
  private static mermaidInitialized = false;

  constructor() {}

  /**
   * Unicode-safe base64 encoding
   */
  private static unicodeToBase64(str: string): string {
    try {
      // Convert Unicode string to UTF-8 bytes, then to base64
      const result = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
      }));
      console.log('✅ Unicode base64 encoding successful for SVG content');
      return result;
    } catch (error) {
      console.warn('⚠️ Unicode to base64 conversion failed, using fallback:', error);
      // Fallback: remove non-Latin1 characters
      const latin1String = str.replace(/[^\x00-\xFF]/g, '?');
      return btoa(latin1String);
    }
  }

  /**
   * Unicode-safe base64 decoding
   */
  private static base64ToUnicode(str: string): string {
    try {
      // Decode base64 to UTF-8 bytes, then to Unicode string
      return decodeURIComponent(atob(str).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (error) {
      console.warn('Base64 to unicode conversion failed, using fallback:', error);
      // Fallback: direct atob
      try {
        return atob(str);
      } catch (fallbackError) {
        console.error('Base64 decode failed completely:', fallbackError);
        return '[Decode Error]';
      }
    }
  }

  private static async initializeMermaid() {
    if (NotebookExportService.mermaidInitialized) return;
    
    try {
      await mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        themeVariables: {
          primaryColor: '#ffffff',
          primaryTextColor: '#000000',
          primaryBorderColor: '#cccccc',
          lineColor: '#666666',
          sectionBkgColor: '#f9f9f9',
          altSectionBkgColor: '#ffffff',
          gridColor: '#e0e0e0',
          tertiaryColor: '#f9f9f9'
        }
      });
      NotebookExportService.mermaidInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Mermaid:', error);
      NotebookExportService.mermaidInitialized = false;
    }
  }

  private renderMarkdownToHtml(markdown: string): string {
    // Simple markdown to HTML conversion for basic formatting
    return markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  private htmlToPlainText(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }

  /**
   * Render Mermaid diagram to SVG with enhanced error handling
   */
  private static async renderMermaidDiagram(diagramCode: string, diagramId: string): Promise<string> {
    try {
      await NotebookExportService.initializeMermaid();
      
      const cleanCode = diagramCode.trim();
      
      // Validate syntax first
      try {
        await mermaid.parse(cleanCode);
      } catch (parseError) {
        console.warn('Mermaid parse error:', parseError);
        return NotebookExportService.createErrorSvg(`Parse error: ${parseError}`);
      }

      // Render with timeout protection
      const renderPromise = mermaid.render(diagramId, cleanCode);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Mermaid render timeout')), 8000);
      });

      const result = await Promise.race([renderPromise, timeoutPromise]);
      
      if (typeof result === 'string') {
        return result;
      } else if (result && typeof result === 'object' && 'svg' in result) {
        return result.svg;
      } else {
        throw new Error('Invalid render result format');
      }
    } catch (error) {
      console.error('Mermaid render error:', error);
      return NotebookExportService.createErrorSvg(`Render error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create an error SVG when diagram rendering fails
   */
  private static createErrorSvg(errorMessage: string): string {
    return `<svg width="400" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="100" fill="#f8f9fa" stroke="#e9ecef"/>
      <text x="200" y="45" text-anchor="middle" fill="#dc2626" font-family="Arial" font-size="14">
        Diagram Error
      </text>
      <text x="200" y="65" text-anchor="middle" fill="#6c757d" font-family="Arial" font-size="12">
        ${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? '...' : ''}
      </text>
    </svg>`;
  }

  /**
   * Process diagrams in content - for MD/HTML formats, use SVG directly
   */
  private static async processDiagramsForSvg(content: string): Promise<string> {
    const diagramRegex = /```mermaid\n([\s\S]*?)\n```/g;
    const diagrams: { code: string; placeholder: string }[] = [];
    let match;
    let diagramIndex = 0;

    // Find all Mermaid diagrams
    while ((match = diagramRegex.exec(content)) !== null) {
      const diagramCode = match[1];
      const placeholder = `__DIAGRAM_${diagramIndex}__`;
      diagrams.push({ code: diagramCode, placeholder });
      diagramIndex++;
    }

    if (diagrams.length === 0) {
      return content;
    }

    // Replace diagrams with placeholders first
    let processedContent = content;
    diagrams.forEach((diagram, index) => {
      const placeholder = `__DIAGRAM_${index}__`;
      processedContent = processedContent.replace(
        /```mermaid\n([\s\S]*?)\n```/,
        placeholder
      );
    });

    // Render diagrams as SVG
    const renderedDiagrams: string[] = [];
    for (let i = 0; i < diagrams.length; i++) {
      try {
        const svgString = await NotebookExportService.renderMermaidDiagram(
          diagrams[i].code,
          `diagram-${Date.now()}-${i}`
        );
        renderedDiagrams.push(svgString);
      } catch (error) {
        console.error(`Failed to render diagram ${i}:`, error);
        renderedDiagrams.push(NotebookExportService.createErrorSvg('Render failed'));
      }
    }

    // Replace placeholders with rendered diagrams using Unicode-safe base64
    diagrams.forEach((diagram, index) => {
      processedContent = processedContent.replace(
        diagram.placeholder,
        `![Diagram ${index + 1}](data:image/svg+xml;base64,${NotebookExportService.unicodeToBase64(renderedDiagrams[index])})`
      );
    });

    return processedContent;
  }

  private formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  /**
   * Test Unicode encoding/decoding for debugging
   */
  static testUnicodeEncoding(): void {
    const testStrings = [
      'Hello World',
      'Unicode: 你好世界',
      'Emoji: 🚀 📊 ✅',
      'Math: ∑ ∫ ∆ ∞',
      'SVG with Unicode: <svg><text>Testing 你好</text></svg>'
    ];

    console.log('Testing Unicode encoding/decoding:');
    testStrings.forEach((testStr, index) => {
      try {
        const encoded = NotebookExportService.unicodeToBase64(testStr);
        const decoded = NotebookExportService.base64ToUnicode(encoded);
        const success = decoded === testStr;
        console.log(`Test ${index + 1}: ${success ? '✅' : '❌'} "${testStr}" -> "${decoded}"`);
      } catch (error) {
        console.error(`Test ${index + 1} failed:`, error);
      }
    });
  }

  // Export as Markdown
  async exportAsMarkdown(content: NotebookContent, options: ExportOptions): Promise<string> {
    let markdown = `# ${content.notebook.name}\n\n`;
    
    if (content.notebook.description) {
      markdown += `${content.notebook.description}\n\n`;
    }
    
    markdown += `**Created:** ${this.formatTimestamp(content.notebook.created_at)}\n\n`;
    markdown += `---\n\n`;

    if (options.includeNotes && content.notes.length > 0) {
      markdown += `## Notes\n\n`;
      
      for (const note of content.notes) {
        if (options.includeDiagrams) {
          const processedContent = await NotebookExportService.processDiagramsForSvg(note.content);
          
          markdown += `### ${note.title}\n\n`;
          markdown += `**Type:** ${note.type} | **Updated:** ${this.formatTimestamp(note.updatedAt)}\n\n`;
          markdown += `${processedContent}\n\n`;
        } else {
          const cleanContent = note.content.replace(/```mermaid\n[\s\S]*?\n```/g, '[Diagram omitted]');
          markdown += `### ${note.title}\n\n`;
          markdown += `**Type:** ${note.type} | **Updated:** ${this.formatTimestamp(note.updatedAt)}\n\n`;
          markdown += `${cleanContent}\n\n`;
        }
        markdown += `---\n\n`;
      }
    }

    if (options.includeChat && content.chatHistory.length > 0) {
      markdown += `## Chat History\n\n`;
      
      for (const message of content.chatHistory) {
        if (options.includeDiagrams) {
          const processedContent = await NotebookExportService.processDiagramsForSvg(message.content);
          
          const sender = message.type === 'user' ? 'User' : 'Assistant';
          markdown += `### ${sender} - ${this.formatTimestamp(message.timestamp)}\n\n`;
          markdown += `${processedContent}\n\n`;
        } else {
          const cleanContent = message.content.replace(/```mermaid\n[\s\S]*?\n```/g, '[Diagram omitted]');
          const sender = message.type === 'user' ? 'User' : 'Assistant';
          markdown += `### ${sender} - ${this.formatTimestamp(message.timestamp)}\n\n`;
          markdown += `${cleanContent}\n\n`;
        }
        
        if (message.citations && message.citations.length > 0) {
          markdown += `**Sources:**\n`;
          for (const citation of message.citations) {
            markdown += `- ${citation.title}\n`;
          }
          markdown += `\n`;
        }
        
        markdown += `---\n\n`;
      }
    }

    if (options.includeGraph && content.graphData) {
      markdown += `## Knowledge Graph\n\n`;
      markdown += `### Entities (${content.graphData.nodes.length})\n\n`;
      
      for (const node of content.graphData.nodes) {
        markdown += `- **${node.label}** (${node.type})\n`;
        if (node.properties?.description) {
          markdown += `  - ${node.properties.description}\n`;
        }
      }
      
      markdown += `\n### Relationships (${content.graphData.edges.length})\n\n`;
      
      for (const edge of content.graphData.edges) {
        const sourceNode = content.graphData.nodes.find(n => n.id === edge.source);
        const targetNode = content.graphData.nodes.find(n => n.id === edge.target);
        markdown += `- ${sourceNode?.label || edge.source} → ${targetNode?.label || edge.target} (${edge.relationship})\n`;
      }
      
      markdown += `\n`;
    }

    return markdown;
  }

  // Export as Plain Text
  async exportAsText(content: NotebookContent, options: ExportOptions): Promise<string> {
    let text = `${content.notebook.name}\n`;
    text += `${'='.repeat(content.notebook.name.length)}\n\n`;
    
    if (content.notebook.description) {
      text += `${content.notebook.description}\n\n`;
    }
    
    text += `Created: ${this.formatTimestamp(content.notebook.created_at)}\n\n`;
    text += `${'-'.repeat(50)}\n\n`;

    if (options.includeNotes && content.notes.length > 0) {
      text += `NOTES\n\n`;
      
      for (const note of content.notes) {
        // Remove markdown formatting and mermaid blocks for plain text
        let cleanContent = note.content
          .replace(/```mermaid\n[\s\S]*?\n```/g, '[Diagram omitted in plain text export]')
          .replace(/[#*_`]/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        
        text += `${note.title}\n`;
        text += `${'-'.repeat(note.title.length)}\n`;
        text += `Type: ${note.type} | Updated: ${this.formatTimestamp(note.updatedAt)}\n\n`;
        text += `${cleanContent}\n\n`;
        text += `${'-'.repeat(30)}\n\n`;
      }
    }

    if (options.includeChat && content.chatHistory.length > 0) {
      text += `CHAT HISTORY\n\n`;
      
      for (const message of content.chatHistory) {
        let cleanContent = message.content
          .replace(/```mermaid\n[\s\S]*?\n```/g, '[Diagram omitted in plain text export]')
          .replace(/[#*_`]/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        
        const sender = message.type === 'user' ? 'User' : 'Assistant';
        text += `${sender} - ${this.formatTimestamp(message.timestamp)}\n`;
        text += `${cleanContent}\n`;
        
        if (message.citations && message.citations.length > 0) {
          text += `\nSources:\n`;
          for (const citation of message.citations) {
            text += `- ${citation.title}\n`;
          }
        }
        
        text += `\n${'-'.repeat(30)}\n\n`;
      }
    }

    if (options.includeGraph && content.graphData) {
      text += `KNOWLEDGE GRAPH\n\n`;
      text += `Entities (${content.graphData.nodes.length}):\n`;
      
      for (const node of content.graphData.nodes) {
        text += `- ${node.label} (${node.type})\n`;
        if (node.properties?.description) {
          text += `  ${node.properties.description}\n`;
        }
      }
      
      text += `\nRelationships (${content.graphData.edges.length}):\n`;
      
      for (const edge of content.graphData.edges) {
        const sourceNode = content.graphData.nodes.find(n => n.id === edge.source);
        const targetNode = content.graphData.nodes.find(n => n.id === edge.target);
        text += `- ${sourceNode?.label || edge.source} → ${targetNode?.label || edge.target} (${edge.relationship})\n`;
      }
    }

    return text;
  }

  // Export as HTML with inline SVG diagrams
  async exportAsHtml(content: NotebookContent, options: ExportOptions): Promise<string> {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${content.notebook.name}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            line-height: 1.6;
        }
        h1, h2, h3 { color: #333; }
        img { max-width: 100%; height: auto; margin: 20px 0; border: 1px solid #ddd; border-radius: 8px; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
        hr { border: none; border-top: 1px solid #ddd; margin: 30px 0; }
        .timestamp { color: #666; font-size: 0.9em; }
        .citation { background: #f0f8ff; padding: 10px; border-left: 4px solid #007acc; margin: 10px 0; }
        svg { max-width: 100%; height: auto; margin: 20px 0; border: 1px solid #ddd; border-radius: 8px; }
    </style>
</head>
<body>`;

    html += `<h1>${content.notebook.name}</h1>`;
    
    if (content.notebook.description) {
      html += `<p>${content.notebook.description}</p>`;
    }
    
    html += `<p class="timestamp"><strong>Created:</strong> ${this.formatTimestamp(content.notebook.created_at)}</p>`;
    html += `<hr>`;

    if (options.includeNotes && content.notes.length > 0) {
      html += `<h2>Notes</h2>`;
      
      for (const note of content.notes) {
        html += `<h3>${note.title}</h3>`;
        html += `<p class="timestamp"><strong>Type:</strong> ${note.type} | <strong>Updated:</strong> ${this.formatTimestamp(note.updatedAt)}</p>`;
        
        if (options.includeDiagrams) {
          const processedContent = await NotebookExportService.processDiagramsForSvg(note.content);
          let htmlContent = this.renderMarkdownToHtml(processedContent);
          // Replace SVG data URLs with inline SVG
          htmlContent = htmlContent.replace(/!\[Diagram \d+\]\(data:image\/svg\+xml;base64,([^)]+)\)/g, (match, base64Data) => {
            try {
              const svgContent = NotebookExportService.base64ToUnicode(base64Data);
              return svgContent;
            } catch {
              return '[Diagram could not be displayed]';
            }
          });
          html += `<div>${htmlContent}</div>`;
        } else {
          const cleanContent = note.content.replace(/```mermaid\n[\s\S]*?\n```/g, '[Diagram omitted]');
          const renderedContent = this.renderMarkdownToHtml(cleanContent);
          html += `<div>${renderedContent}</div>`;
        }
        html += `<hr>`;
      }
    }

    if (options.includeChat && content.chatHistory.length > 0) {
      html += `<h2>Chat History</h2>`;
      
      for (const message of content.chatHistory) {
        const sender = message.type === 'user' ? 'User' : 'Assistant';
        html += `<h3>${sender} - ${this.formatTimestamp(message.timestamp)}</h3>`;
        
        if (options.includeDiagrams) {
          const processedContent = await NotebookExportService.processDiagramsForSvg(message.content);
          let htmlContent = this.renderMarkdownToHtml(processedContent);
          // Replace SVG data URLs with inline SVG
          htmlContent = htmlContent.replace(/!\[Diagram \d+\]\(data:image\/svg\+xml;base64,([^)]+)\)/g, (match, base64Data) => {
            try {
              const svgContent = NotebookExportService.base64ToUnicode(base64Data);
              return svgContent;
            } catch {
              return '[Diagram could not be displayed]';
            }
          });
          html += `<div>${htmlContent}</div>`;
        } else {
          const cleanContent = message.content.replace(/```mermaid\n[\s\S]*?\n```/g, '[Diagram omitted]');
          const renderedContent = this.renderMarkdownToHtml(cleanContent);
          html += `<div>${renderedContent}</div>`;
        }
        
        if (message.citations && message.citations.length > 0) {
          html += `<div class="citation"><strong>Sources:</strong><ul>`;
          for (const citation of message.citations) {
            html += `<li>${citation.title}</li>`;
          }
          html += `</ul></div>`;
        }
        
        html += `<hr>`;
      }
    }

    if (options.includeGraph && content.graphData) {
      html += `<h2>Knowledge Graph</h2>`;
      html += `<h3>Entities (${content.graphData.nodes.length})</h3><ul>`;
      
      for (const node of content.graphData.nodes) {
        html += `<li><strong>${node.label}</strong> (${node.type})`;
        if (node.properties?.description) {
          html += `<br><em>${node.properties.description}</em>`;
        }
        html += `</li>`;
      }
      
      html += `</ul><h3>Relationships (${content.graphData.edges.length})</h3><ul>`;
      
      for (const edge of content.graphData.edges) {
        const sourceNode = content.graphData.nodes.find(n => n.id === edge.source);
        const targetNode = content.graphData.nodes.find(n => n.id === edge.target);
        html += `<li>${sourceNode?.label || edge.source} → ${targetNode?.label || edge.target} (${edge.relationship})</li>`;
      }
      
      html += `</ul>`;
    }

    html += `</body></html>`;
    return html;
  }

  // Export as PDF - using simple HTML approach to avoid canvas issues
  async exportAsPdf(content: NotebookContent, options: ExportOptions): Promise<Blob> {
    try {
      // Get HTML content with inline SVGs
      const htmlContent = await this.exportAsHtml(content, options);
      
      // Create a temporary container
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '800px';
      container.style.backgroundColor = 'white';
      container.style.padding = '40px';
      container.style.fontFamily = 'Arial, sans-serif';
      container.innerHTML = htmlContent.replace(/<html[^>]*>|<\/html>|<head[^>]*>[\s\S]*?<\/head>|<body[^>]*>|<\/body>/gi, '');
      
      document.body.appendChild(container);

      try {
        // Use html2canvas with canvas-friendly settings
        const canvas = await html2canvas(container, {
          backgroundColor: 'white',
          scale: 1,
          useCORS: true,
          allowTaint: false,
          logging: false,
          width: 800,
          height: container.scrollHeight,
          foreignObjectRendering: false, // Disable for better SVG compatibility
          onclone: (clonedDoc) => {
            // Replace any problematic SVGs with simplified versions
            const svgs = clonedDoc.querySelectorAll('svg');
            svgs.forEach(svg => {
              svg.style.background = 'white';
              svg.style.border = '1px solid #ddd';
              svg.style.borderRadius = '4px';
              svg.style.padding = '10px';
              svg.style.margin = '10px 0';
              // Ensure all text uses web-safe fonts
              const texts = svg.querySelectorAll('text');
              texts.forEach(text => {
                text.style.fontFamily = 'Arial, sans-serif';
                text.style.fontSize = '12px';
              });
              // Set explicit dimensions if missing
              if (!svg.getAttribute('width')) {
                svg.setAttribute('width', '600');
              }
              if (!svg.getAttribute('height')) {
                svg.setAttribute('height', '400');
              }
            });
          }
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgWidth = 210;
        const pageHeight = 295;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        
        let position = 0;
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        return pdf.output('blob');
      } finally {
        document.body.removeChild(container);
      }
    } catch (error) {
      console.error('PDF export failed:', error);
      throw new Error(`PDF export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Export as DOCX (simplified version without image conversion issues)
  async exportAsDocx(content: NotebookContent, options: ExportOptions): Promise<Blob> {
    try {
      const children: any[] = [];

      // Title
      children.push(
        new Paragraph({
          children: [new TextRun({ text: content.notebook.name, bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
        })
      );

      if (content.notebook.description) {
        children.push(
          new Paragraph({
            children: [new TextRun(content.notebook.description)],
          })
        );
      }

      children.push(
        new Paragraph({
          children: [new TextRun(`Created: ${this.formatTimestamp(content.notebook.created_at)}`)],
        })
      );

      // Notes
      if (options.includeNotes && content.notes.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Notes', bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_2,
          })
        );

        for (const note of content.notes) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: note.title, bold: true, size: 20 })],
              heading: HeadingLevel.HEADING_3,
            })
          );

          children.push(
            new Paragraph({
              children: [new TextRun(`Type: ${note.type} | Updated: ${this.formatTimestamp(note.updatedAt)}`)],
            })
          );

          // Clean content (remove mermaid blocks for DOCX)
          const cleanContent = note.content.replace(/```mermaid\n[\s\S]*?\n```/g, options.includeDiagrams ? '[Diagram - see HTML export for visual representation]' : '[Diagram omitted]');
          const plainContent = this.htmlToPlainText(this.renderMarkdownToHtml(cleanContent));
          
          children.push(
            new Paragraph({
              children: [new TextRun(plainContent)],
            })
          );
        }
      }

      // Chat History
      if (options.includeChat && content.chatHistory.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Chat History', bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_2,
          })
        );

        for (const message of content.chatHistory) {
          const sender = message.type === 'user' ? 'User' : 'Assistant';
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${sender} - ${this.formatTimestamp(message.timestamp)}`, bold: true, size: 20 })],
              heading: HeadingLevel.HEADING_3,
            })
          );

          const cleanContent = message.content.replace(/```mermaid\n[\s\S]*?\n```/g, options.includeDiagrams ? '[Diagram - see HTML export for visual representation]' : '[Diagram omitted]');
          const plainContent = this.htmlToPlainText(this.renderMarkdownToHtml(cleanContent));
          
          children.push(
            new Paragraph({
              children: [new TextRun(plainContent)],
            })
          );

          if (message.citations && message.citations.length > 0) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: 'Sources:', bold: true })],
              })
            );

            for (const citation of message.citations) {
              children.push(
                new Paragraph({
                  children: [new TextRun(`- ${citation.title}`)],
                })
              );
            }
          }
        }
      }

      // Knowledge Graph
      if (options.includeGraph && content.graphData) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Knowledge Graph', bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_2,
          })
        );

        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Entities (${content.graphData.nodes.length})`, bold: true, size: 20 })],
            heading: HeadingLevel.HEADING_3,
          })
        );

        for (const node of content.graphData.nodes) {
          const nodeText = node.properties?.description
            ? `${node.label} (${node.type}) - ${node.properties.description}`
            : `${node.label} (${node.type})`;
          
          children.push(
            new Paragraph({
              children: [new TextRun(`• ${nodeText}`)],
            })
          );
        }

        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Relationships (${content.graphData.edges.length})`, bold: true, size: 20 })],
            heading: HeadingLevel.HEADING_3,
          })
        );

        for (const edge of content.graphData.edges) {
          const sourceNode = content.graphData.nodes.find(n => n.id === edge.source);
          const targetNode = content.graphData.nodes.find(n => n.id === edge.target);
          const relationshipText = `${sourceNode?.label || edge.source} → ${targetNode?.label || edge.target} (${edge.relationship})`;
          
          children.push(
            new Paragraph({
              children: [new TextRun(`• ${relationshipText}`)],
            })
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: children,
          },
        ],
      });

      return await Packer.toBlob(doc);
    } catch (error) {
      console.error('DOCX export failed:', error);
      throw new Error(`DOCX export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Main export method
  async export(content: NotebookContent, options: ExportOptions): Promise<{ blob: Blob; filename: string }> {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const baseName = `${content.notebook.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}`;

    try {
      switch (options.format) {
        case 'md': {
          const markdown = await this.exportAsMarkdown(content, options);
          const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
          return { blob, filename: `${baseName}.md` };
        }

        case 'txt': {
          const text = await this.exportAsText(content, options);
          const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
          return { blob, filename: `${baseName}.txt` };
        }

        case 'html': {
          const html = await this.exportAsHtml(content, options);
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
          return { blob, filename: `${baseName}.html` };
        }

        case 'pdf': {
          const blob = await this.exportAsPdf(content, options);
          return { blob, filename: `${baseName}.pdf` };
        }

        case 'docx': {
          const blob = await this.exportAsDocx(content, options);
          return { blob, filename: `${baseName}.docx` };
        }

        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      throw new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default NotebookExportService; 
