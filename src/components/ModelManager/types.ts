export interface HuggingFaceModel {
  id: string;
  name: string;
  downloads: number;
  likes: number;
  tags: string[];
  description: string;
  author: string;
  files: Array<{ rfilename: string; size?: number }>;
  pipeline_tag?: string;
  library_name?: string;
  modelId?: string;
  isVisionModel?: boolean;
  requiredMmprojFiles?: Array<{ rfilename: string; size?: number }>;
  createdAt?: string | null;
  lastModified?: string | null;
}

export interface LocalModel {
  name: string;
  file: string;
  path: string;
  size: number;
  source: string;
  lastModified: Date;
  // Mmproj-related properties
  mmprojMapping?: import('../../services/modelMmprojMappingService').ModelMmprojMapping | null;
  isVisionModel?: boolean;
  hasAssignedMmproj?: boolean;
  embeddingSize?: number | string;
}

export interface DownloadProgress {
  fileName: string;
  progress: number;
  downloadedSize: number;
  totalSize: number;
}

export interface ModelEmbeddingInfo {
  modelEmbedSize: number;
  compatibleMmprojs: Array<{
    name: string;
    url: string;
    embeddingSize: number;
  }>;
}

export interface VisionCompatibilityInfo {
  embeddingSize: number | string;
  isVisionModel: boolean;
  needsMmproj: boolean;
  compatibleMmprojFiles: Array<{
    file: string;
    embeddingSize: number | string;
    isCompatible: boolean;
    compatibilityReason: string;
  }>;
  hasCompatibleMmproj: boolean;
  compatibilityStatus: string;
  availableHuggingFaceMmproj?: Array<{
    modelId: string;
    modelName: string;
    files: Array<{ rfilename: string }>;
    estimatedEmbeddingSize: number;
    isLikelyCompatible: boolean;
  }>;
}

export interface Notification {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

export interface Confirmation {
  title: string;
  message: string;
  modelCount: number;
  modelNames: string[];
  selectedPath: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export type TrendingFilter = 'today' | 'week' | 'month' | 'all';
export type ModelManagerTab = 'discover' | 'library'; 
