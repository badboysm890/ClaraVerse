// RAG/search logic utilities for Assistant

export interface SearchResult {
  score: number;
  content: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export const searchDocuments = async (
  query: string,
  pythonPort: number | null,
  temporaryDocs: { collection: string }[],
  ragEnabled: boolean
): Promise<SearchResponse | null> => {
  if (!pythonPort) return null;

  try {
    // If there are temporary documents, only use temp collections
    if (temporaryDocs.length > 0) {
      const tempResults = await Promise.all(
        temporaryDocs.map(async (doc) => {
          try {
            const response = await fetch(`http://0.0.0.0:${pythonPort}/documents/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query,
                collection_name: doc.collection,
                k: 8,
              }),
            });
            if (!response.ok) {
              console.warn(`Search failed for collection ${doc.collection}:`, response.status);
              return { results: [] };
            }
            return await response.json() as SearchResponse;
          } catch (error) {
            console.warn(`Search error for collection ${doc.collection}:`, error);
            return { results: [] };
          }
        })
      );
      // For temp docs, use all results regardless of score
      const allTempResults = tempResults.flatMap(r => r.results || []);
      // Sort by score and return
      return {
        results: allTempResults
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 8)
      };
    }
    // If RAG is enabled and no temp docs, use only angela-assistant collection
    if (ragEnabled) {
      try {
        const response = await fetch(`http://0.0.0.0:${pythonPort}/documents/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            collection_name: 'angela-assistant',
            k: 8,
          }),
        });
        if (response.ok) {
          const defaultResults = await response.json() as SearchResponse;
          const results = defaultResults?.results || [];
          const filteredResults = results.length <= 2 
            ? results 
            : results.filter(result => (result.score || 0) > 0);
          return {
            results: filteredResults.slice(0, 8)
          };
        } else {
          console.warn('angela Assistant collection search failed:', response.status);
          return { results: [] };
        }
      } catch (error) {
        console.warn('angela Assistant collection search error:', error);
        return { results: [] };
      }
    }
    // If neither temp docs nor RAG enabled, return empty results
    return { results: [] };
  } catch (error) {
    console.error('Error searching documents:', error);
    return { results: [] };
  }
}; 
