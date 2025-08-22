import type { Workflow } from '../Store';
import workflowsData from '../workflows/n8n_workflows_full.json';

// Add ID to each workflow for consistency
const addIdToWorkflows = (workflows: any[]): Workflow[] => {
  return workflows.map((workflow, index) => ({
    ...workflow,
    id: workflow.jsonLink || `workflow-${index}`,
    downloads: 0,
    is_prebuilt: true
  }));
};

// Simple function to get all workflows from JSON file
export async function fetchWorkflows(): Promise<Workflow[]> {
  try {
    // Add artificial delay to simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const workflows = addIdToWorkflows(workflowsData);
    console.log(`Loaded ${workflows.length} workflows from JSON file`);
    return workflows;
  } catch (error) {
    console.error('Failed to load workflows from JSON:', error);
    return [];
  }
}

// Function to get workflows by category
export async function fetchWorkflowsByCategory(category: string): Promise<Workflow[]> {
  const workflows = await fetchWorkflows();
  return workflows.filter(workflow => workflow.category === category);
}

// Function to search workflows
export async function searchWorkflows(searchTerm: string): Promise<Workflow[]> {
  const workflows = await fetchWorkflows();
  const lowerSearch = searchTerm.toLowerCase();
  
  return workflows.filter(workflow => 
    workflow.name.toLowerCase().includes(lowerSearch) ||
    workflow.description.toLowerCase().includes(lowerSearch) ||
    workflow.tags.some(tag => tag.toLowerCase().includes(lowerSearch))
  );
}

// Function to get available categories
export async function getWorkflowCategories(): Promise<string[]> {
  const workflows = await fetchWorkflows();
  const categories = [...new Set(workflows.map(workflow => workflow.category))];
  return categories.sort();
}

// Utility function to convert GitHub URLs to raw format
export const toRawGitHubUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return '';
  
  // If it's already a raw URL or not a GitHub URL, return as is
  if (url.includes('raw.githubusercontent.com') || !url.includes('github.com')) {
    return url;
  }
  
  return url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');
};

// Function to fetch workflow JSON content from GitHub
export async function fetchWorkflowJson(jsonLink: string): Promise<string | null> {
  try {
    const rawUrl = toRawGitHubUrl(jsonLink);
    const response = await fetch(rawUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const jsonContent = await response.text();
    return jsonContent;
  } catch (error) {
    console.error('Failed to fetch workflow JSON:', error);
    return null;
  }
}

// Function to prefetch and store workflows (for caching/offline use)
export async function prefetchAndStoreWorkflows(): Promise<Workflow[]> {
  try {
    console.log('Prefetching workflows...');
    const workflows = await fetchWorkflows();
    
    // Store in localStorage for offline access
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('n8n_workflows_cache', JSON.stringify({
          timestamp: Date.now(),
          workflows: workflows
        }));
        console.log(`Cached ${workflows.length} workflows to localStorage`);
      } catch (error) {
        console.warn('Failed to cache workflows to localStorage:', error);
      }
    }
    
    return workflows;
  } catch (error) {
    console.error('Failed to prefetch workflows:', error);
    
    // Try to load from cache if available
    if (typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('n8n_workflows_cache');
        if (cached) {
          const cacheData = JSON.parse(cached);
          console.log(`Loaded ${cacheData.workflows?.length || 0} workflows from cache`);
          return cacheData.workflows || [];
        }
      } catch (cacheError) {
        console.warn('Failed to load workflows from cache:', cacheError);
      }
    }
    
    throw error;
  }
} 
