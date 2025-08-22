import { angelaNotebookService } from '../../services/angelaNotebookService';
import { NotebookContent } from './NotebookExportService';

interface NotebookNote {
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'summary';
  content: string;
  timestamp: string;
  citations?: Array<{
    title: string;
    content: string;
  }>;
}

interface GraphData {
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
}

class NotebookDataCollector {
  async collectNotebookData(notebookId: string): Promise<NotebookContent> {
    try {
      // Get basic notebook info
      const notebook = await angelaNotebookService.getNotebook(notebookId);
      
      // Collect notes from localStorage (from NotebookCanvas)
      const notes = this.collectNotesFromStorage(notebookId);
      
      // Collect chat history from localStorage (from NotebookChat)
      const chatHistory = this.collectChatHistoryFromStorage(notebookId);
      
      // Collect graph data if available
      const graphData = await this.collectGraphData(notebookId);

      return {
        notebook: {
          id: notebook.id,
          name: notebook.name,
          description: notebook.description || '',
          created_at: notebook.created_at
        },
        notes,
        chatHistory,
        graphData
      };
    } catch (error) {
      console.error('Failed to collect notebook data:', error);
      throw new Error('Failed to collect notebook data for export');
    }
  }

  private collectNotesFromStorage(notebookId: string): NotebookNote[] {
    try {
      const savedNotes = localStorage.getItem(`notebook-notes-${notebookId}`);
      if (savedNotes) {
        const notes = JSON.parse(savedNotes);
        return Array.isArray(notes) ? notes.map((note: any) => ({
          id: note.id || `note-${Date.now()}`,
          title: note.title || 'Untitled Note',
          content: note.content || '',
          type: note.type || 'text',
          createdAt: note.createdAt || note.timestamp || new Date().toISOString(),
          updatedAt: note.updatedAt || note.timestamp || new Date().toISOString()
        })) : [];
      }
      return [];
    } catch (error) {
      console.warn('Failed to collect notes from storage:', error);
      return [];
    }
  }

  private collectChatHistoryFromStorage(notebookId: string): ChatMessage[] {
    try {
      // Try different possible storage keys for chat history
      const possibleKeys = [
        `notebook-chat-${notebookId}`,
        `angela-chat-${notebookId}`,
        `chat-history-${notebookId}`,
        `notebook-${notebookId}-chat`
      ];

      for (const key of possibleKeys) {
        const savedChat = localStorage.getItem(key);
        if (savedChat) {
          try {
            const chatData = JSON.parse(savedChat);
            
            // Handle different chat storage formats
            let messages = [];
            if (Array.isArray(chatData)) {
              messages = chatData;
            } else if (chatData.messages && Array.isArray(chatData.messages)) {
              messages = chatData.messages;
            } else if (chatData.history && Array.isArray(chatData.history)) {
              messages = chatData.history;
            }

            return messages.map((msg: any, index: number) => ({
              id: msg.id || `msg-${index}`,
              type: msg.type || (msg.role === 'user' ? 'user' : 'assistant'),
              content: msg.content || msg.message || '',
              timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
              citations: msg.citations || msg.sources || []
            }));
          } catch (parseError) {
            console.warn(`Failed to parse chat data from ${key}:`, parseError);
          }
        }
      }
      
      return [];
    } catch (error) {
      console.warn('Failed to collect chat history from storage:', error);
      return [];
    }
  }

  private async collectGraphData(notebookId: string): Promise<GraphData | undefined> {
    // Try to get graph data from localStorage (primary source for now)

    // Try to get graph data from localStorage as fallback
    try {
      const graphDataKeys = [
        `notebook-graph-${notebookId}`,
        `graph-${notebookId}`,
        `knowledge-graph-${notebookId}`
      ];

      for (const key of graphDataKeys) {
        const savedGraph = localStorage.getItem(key);
        if (savedGraph) {
          const graphData = JSON.parse(savedGraph);
          if (graphData.nodes || graphData.edges) {
            return {
              nodes: (graphData.nodes || []).map((node: any) => ({
                id: node.id || node.name,
                label: node.label || node.name || node.id,
                type: node.type || 'unknown',
                properties: node.properties || {}
              })),
              edges: (graphData.edges || []).map((edge: any) => ({
                source: edge.source || edge.from,
                target: edge.target || edge.to,
                relationship: edge.relationship || edge.label || edge.type || 'related',
                properties: edge.properties || {}
              }))
            };
          }
        }
      }
    } catch (error) {
      console.warn('Failed to collect graph data from localStorage:', error);
    }

    return undefined;
  }

  // Helper method to create sample data with Mermaid diagrams for demonstration
  async createSampleData(notebookId: string, notebookName: string): Promise<NotebookContent> {
    return {
      notebook: {
        id: notebookId,
        name: notebookName,
        description: 'Sample notebook demonstrating export capabilities',
        created_at: new Date().toISOString()
      },
      notes: [
        {
          id: 'sample-note-1',
          title: 'Welcome to Your Notebook',
          content: `# Welcome to ${notebookName}

This is your first note! You can add content here including:

- **Bold text** and *italic text*
- \`Code snippets\` and blocks
- Links and images
- And even Mermaid diagrams:

\`\`\`mermaid
graph TD
    A[Start] --> B[Process Data]
    B --> C{Decision}
    C -->|Yes| D[Action 1]
    C -->|No| E[Action 2]
    D --> F[End]
    E --> F
\`\`\`

This export functionality supports all these formats across multiple file types.`,
          type: 'text',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'sample-note-2',
          title: 'System Architecture',
          content: `# System Architecture Overview

Here's how our notebook system works:

\`\`\`mermaid
graph LR
    subgraph "Frontend"
        A[React UI] --> B[NotebookWorkspace]
        B --> C[NotebookCanvas]
        B --> D[NotebookChat]
        B --> E[GraphViewer]
    end
    
    subgraph "Services"
        F[Export Service] --> G[Mermaid Renderer]
        F --> H[Data Collector]
    end
    
    subgraph "Storage"
        I[LocalStorage] --> J[Notes]
        I --> K[Chat History]
        I --> L[Graph Data]
    end
    
    A --> F
    C --> I
    D --> I
    E --> I
\`\`\`

The export system can handle all of this complexity and render it beautifully.`,
          type: 'diagram',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      chatHistory: [
        {
          id: 'sample-chat-1',
          type: 'user',
          content: 'Can you explain how the export system works?',
          timestamp: new Date(Date.now() - 7200000).toISOString()
        },
        {
          id: 'sample-chat-2',
          type: 'assistant',
          content: `The export system is quite comprehensive! Here's how it works:

## Export Process

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant W as Workspace
    participant C as Data Collector
    participant E as Export Service
    participant M as Mermaid Renderer
    
    U->>W: Click Export
    W->>C: Collect notebook data
    C->>C: Gather notes, chat, graph data
    C->>W: Return complete dataset
    W->>E: Process export request
    E->>M: Render Mermaid diagrams
    M->>E: Return SVG/PNG images
    E->>E: Generate final document
    E->>U: Download file
\`\`\`

The system supports multiple formats:
- **Markdown** (.md) - With embedded diagram images
- **HTML** (.html) - Web-ready with inline SVGs
- **Plain Text** (.txt) - Simple format without diagrams
- **Future**: PDF and DOCX with proper image embedding

Each format preserves your content while optimizing for the target medium.`,
          timestamp: new Date(Date.now() - 7000000).toISOString(),
          citations: [
            {
              title: 'Export Architecture Documentation',
              content: 'Technical details on how the export system processes different content types'
            }
          ]
        }
      ],
      graphData: {
        nodes: [
          { id: 'notebook', label: 'Notebook', type: 'concept', properties: { description: 'Digital notebook for organizing thoughts' } },
          { id: 'notes', label: 'Notes', type: 'content', properties: { description: 'Individual pieces of content with text and diagrams' } },
          { id: 'chat', label: 'AI Chat', type: 'tool', properties: { description: 'Interactive AI assistant for help and insights' } },
          { id: 'graph', label: 'Knowledge Graph', type: 'visualization', properties: { description: 'Visual representation of concept connections' } },
          { id: 'export', label: 'Export System', type: 'feature', properties: { description: 'Multi-format document generation' } },
          { id: 'mermaid', label: 'Mermaid Diagrams', type: 'visualization', properties: { description: 'Rendered flowcharts and diagrams' } }
        ],
        edges: [
          { source: 'notebook', target: 'notes', relationship: 'contains', properties: { weight: 1.0 } },
          { source: 'notebook', target: 'chat', relationship: 'includes', properties: { weight: 0.8 } },
          { source: 'notebook', target: 'graph', relationship: 'visualizes', properties: { weight: 0.9 } },
          { source: 'notes', target: 'mermaid', relationship: 'includes', properties: { weight: 0.7 } },
          { source: 'notes', target: 'graph', relationship: 'contributes_to', properties: { weight: 0.7 } },
          { source: 'chat', target: 'mermaid', relationship: 'generates', properties: { weight: 0.6 } },
          { source: 'chat', target: 'graph', relationship: 'enhances', properties: { weight: 0.6 } },
          { source: 'export', target: 'mermaid', relationship: 'renders', properties: { weight: 1.0 } },
          { source: 'notebook', target: 'export', relationship: 'supports', properties: { weight: 1.0 } }
        ]
      }
    };
  }
}

export const notebookDataCollector = new NotebookDataCollector(); 
