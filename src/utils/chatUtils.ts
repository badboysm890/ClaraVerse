import { TemporaryDocument } from '../components/assistantLibrary/tempDocs';
import { searchDocuments, SearchResponse, SearchResult } from '../components/assistantLibrary/ragSearch';

interface ExtendedTemporaryDocument extends TemporaryDocument {
  content?: string;
}

interface ExtendedSearchResult extends SearchResult {
  metadata?: {
    source_file?: string;
  };
}

export async function getCombinedContext(
  userQuery: string,
  temporaryDocs: ExtendedTemporaryDocument[],
  ragEnabled: boolean,
  pythonPort: number | null
): Promise<string> {
  let combinedContext = '';

  // 1. Local document handling
  if (temporaryDocs.length > 0) {
    const localContext = temporaryDocs
      .map(doc => `Content from ${doc.name}:\n${doc.content || ''}`)
      .join('\n\n');
    combinedContext += localContext;
  }

  // 2. Knowledge base search
  if (ragEnabled && pythonPort) {
    try {
      const results = await searchDocuments(userQuery, pythonPort, [], ragEnabled);
      if (results?.results && results.results.length > 0) {
        const serverContext = results.results
          .map((r: ExtendedSearchResult) => {
            const source = r.metadata?.source_file 
              ? ` (from ${r.metadata.source_file})` 
              : '';
            return `${r.content}${source}`;
          })
          .join('\n\n');
        
        if (combinedContext) {
          combinedContext += '\n\n--- Knowledge Base Content ---\n\n';
        }
        combinedContext += serverContext;
      }
    } catch (error) {
      console.error('Error fetching knowledge base content:', error);
    }
  }

  return combinedContext;
} 
