export interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  lightColor: string;
  darkColor: string;
  category: 'input' | 'process' | 'output' | 'function';
}

export interface GalleryImage {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
  likes: number;
  views: number;
  model: string;
  resolution: string;
  source?: 'angela' | 'comfyui';
  originalPath?: string;
  fileSize?: number;
}

export interface Project {
  id: string;
  name: string;
  framework: string;
  status: 'idle' | 'running' | 'error';
  createdAt: Date;
  previewUrl?: string;
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  content?: string;
  children?: FileNode[];
}
