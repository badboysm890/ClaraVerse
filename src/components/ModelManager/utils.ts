export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

export const getModelParams = (name: string): string => {
  const paramMatch = name.match(/(\d+\.?\d*)[bB]/i);
  if (paramMatch) {
    const params = parseFloat(paramMatch[1]);
    return params >= 1 ? `${params}B` : `${(params * 1000).toFixed(0)}M`;
  }
  return 'Unknown';
};

export const sortFilesByPriority = (files: Array<{ rfilename: string; size?: number }>) => {
  return [...files].sort((a, b) => {
    const aName = a.rfilename.toLowerCase();
    const bName = b.rfilename.toLowerCase();
    
    // Prioritize Q4 quantized models
    const aIsQ4 = aName.includes('q4') || aName.includes('4bit');
    const bIsQ4 = bName.includes('q4') || bName.includes('4bit');
    
    if (aIsQ4 && !bIsQ4) return -1;
    if (!aIsQ4 && bIsQ4) return 1;
    
    // Then prioritize other quantized models (Q5, Q6, Q8)
    const aIsQuant = /q[0-9]|[0-9]bit/i.test(aName);
    const bIsQuant = /q[0-9]|[0-9]bit/i.test(bName);
    
    if (aIsQuant && !bIsQuant) return -1;
    if (!aIsQuant && bIsQuant) return 1;
    
    // Finally, sort by file size (smaller first for quants)
    if (a.size && b.size) {
      return a.size - b.size;
    }
    
    return 0;
  });
};

export const isMmprojFile = (filename: string): boolean => {
  return filename.toLowerCase().includes('mmproj') ||
         filename.toLowerCase().includes('mm-proj') ||
         filename.toLowerCase().includes('projection');
};

export const isVisionModel = (model: { name: string; tags: string[]; description: string; isVisionModel?: boolean }): boolean => {
  return model.isVisionModel || 
    model.tags.some(tag => ['vision', 'multimodal', 'vl'].includes(tag.toLowerCase())) || 
    model.name.toLowerCase().includes('vl') || 
    model.description.toLowerCase().includes('vision');
};

export const fetchCompatibleMmprojs = async (modelEmbedSize: number) => {
  // We can query Hugging Face API to find compatible mmproj files
  // This is a simplified example - you'll need to implement the actual API call
  const response = await fetch(`https://huggingface.co/api/models?search=mmproj&embedding_size=${modelEmbedSize}`);
  const data = await response.json() as Array<{
    name: string;
    download_url: string;
    config: { embedding_size: number };
  }>;
  return data.map(item => ({
    name: item.name,
    url: item.download_url,
    embeddingSize: item.config.embedding_size
  }));
}; 
