import React, { useState, useEffect } from 'react';
import { Search, HardDrive, Zap, CheckCircle, TrendingUp, Clock, Star, RefreshCw, AlertCircle, Download, ExternalLink, FolderOpen, PlayCircle, PauseCircle, Trash2 } from 'lucide-react';
import { HuggingFaceModel, DownloadProgress } from './types';
import EnhancedModelCard from './EnhancedModelCard';

interface EnhancedModelDiscoveryProps {
  onDownload: (modelId: string, fileName: string) => void;
  onDownloadWithCustomName?: (modelId: string, fileName: string, customSaveName: string) => void;
  onDownloadWithDependencies?: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>) => void;
  downloading: Set<string>;
  downloadProgress: { [fileName: string]: DownloadProgress };
}

interface QueuedDownload {
  id: string;
  modelId: string;
  modelName: string;
  fileName: string;
  allFiles?: Array<{ rfilename: string; size?: number }>;
  status: 'queued' | 'retrying' | 'failed' | 'manual';
  addedAt: Date;
  retryCount: number;
  downloadUrl?: string;
}

interface SystemInfo {
  totalRAM: number;
  availableRAM: number;
  gpu: {
    name: string;
    vram: number;
    hasNvidiaGPU: boolean;
    isAMD: boolean;
  } | null;
}

interface EnhancedModel extends HuggingFaceModel {
  compatibility: {
    fitsInRAM: 'yes' | 'maybe' | 'no';
    fitsInVRAM: 'yes' | 'maybe' | 'no' | 'na';
    parameterCount: string;
    estimatedRAMUsage: number;
    quantization: string;
    architecture: string;
  };
  metadata?: {
    embeddingSize?: number;
    contextLength?: number;
    isVisionModel?: boolean;
    needsMmproj?: boolean;
    hasMmproj?: boolean;
    hasMmprojAvailable?: boolean;
    mmprojFiles?: Array<{ rfilename: string; size?: number }>;
    availableQuantizations?: Array<{
      type: string;
      files: Array<{ rfilename: string; size?: number }>;
      totalSize: number;
      displayName: string;
    }>;
  };
}

const EnhancedModelDiscovery: React.FC<EnhancedModelDiscoveryProps> = ({
  onDownload,
  onDownloadWithCustomName,
  onDownloadWithDependencies,
  downloading,
  downloadProgress
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<EnhancedModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [activeFilter, setActiveFilter] = useState<'recommended' | 'latest' | 'popular' | 'trending'>('recommended');
  const [apiError, setApiError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  
  // Download Queue Management
  const [downloadQueue, setDownloadQueue] = useState<QueuedDownload[]>([]);
  const [showDownloadQueue, setShowDownloadQueue] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Load system information
  useEffect(() => {
    const loadSystemInfo = async () => {
      try {
        // Try multiple GPU detection methods in order of preference
        const [sysInfo, electronGPU, llamaSwapGPU] = await Promise.all([
          (window as any).electronAPI?.getSystemInfo(),
          (window as any).electronAPI?.getGPUInfo(),
          (window as any).llamaSwap?.getGPUDiagnostics()
        ]);

        console.log('System info:', sysInfo);
        console.log('Electron GPU info:', electronGPU);
        console.log('LlamaSwap GPU diagnostics:', llamaSwapGPU);

        // Parse RAM from system info - handle multiple formats
        let totalRAM = 8 * 1024 * 1024 * 1024; // 8GB default
        let availableRAM = 4 * 1024 * 1024 * 1024; // 4GB default

        if (sysInfo) {
          // Try different memory field formats
          if (sysInfo.totalMemory && sysInfo.freeMemory) {
            totalRAM = sysInfo.totalMemory;
            availableRAM = sysInfo.freeMemory;
          } else if (sysInfo.memory) {
            totalRAM = sysInfo.memory.total || totalRAM;
            availableRAM = sysInfo.memory.free || sysInfo.memory.available || totalRAM * 0.5;
          } else if (typeof sysInfo.ram === 'string') {
            // Handle string format like "64 GB"
            const ramMatch = sysInfo.ram.match(/(\d+\.?\d*)/);
            if (ramMatch) {
              totalRAM = parseFloat(ramMatch[1]) * 1024 * 1024 * 1024;
              availableRAM = totalRAM * 0.6; // Assume 60% available
            }
          }
        }

        // Parse GPU info - try LlamaSwap GPU diagnostics first (most comprehensive)
        let gpu = null;
        
        if (llamaSwapGPU?.success && llamaSwapGPU.gpuInfo) {
          const gpuData = llamaSwapGPU.gpuInfo;
          console.log('Using LlamaSwap GPU data:', gpuData);
          console.log('Available GPU fields:', Object.keys(gpuData));
          
          // Try multiple VRAM field names that might be returned
          let vramBytes = 0;
          if (gpuData.gpuMemoryBytes) {
            vramBytes = gpuData.gpuMemoryBytes;
            console.log('Found VRAM via gpuMemoryBytes:', vramBytes);
          } else if (gpuData.gpuMemoryGB) {
            vramBytes = gpuData.gpuMemoryGB * 1024 * 1024 * 1024;
            console.log('Found VRAM via gpuMemoryGB:', gpuData.gpuMemoryGB, 'GB');
          } else if (gpuData.vramSize) {
            vramBytes = gpuData.vramSize;
            console.log('Found VRAM via vramSize:', vramBytes);
          } else if (gpuData.dedicatedVideoMemory) {
            vramBytes = gpuData.dedicatedVideoMemory;
            console.log('Found VRAM via dedicatedVideoMemory:', vramBytes);
          }
          
          // Try multiple GPU name fields
          const gpuName = gpuData.gpuName || 
                         gpuData.name || 
                         gpuData.deviceName || 
                         gpuData.description ||
                         'Unknown GPU';
          
          console.log('GPU name candidates:', {
            gpuName: gpuData.gpuName,
            name: gpuData.name,
            deviceName: gpuData.deviceName,
            description: gpuData.description,
            final: gpuName
          });
          
          gpu = {
            name: gpuName,
            vram: vramBytes,
            hasNvidiaGPU: gpuData.hasNvidiaGPU || gpuData.gpuType === 'nvidia' || gpuName.toLowerCase().includes('nvidia') || false,
            isAMD: gpuData.isAMD || gpuData.gpuType === 'amd' || gpuName.toLowerCase().includes('amd') || false
          };
        }
        
        // Fallback to Electron GPU info if LlamaSwap doesn't have complete info
        if ((!gpu || gpu.name === 'Unknown GPU' || gpu.vram === 0) && electronGPU?.success && electronGPU.gpuInfo) {
          const gpuData = electronGPU.gpuInfo;
          console.log('Using Electron GPU data:', gpuData);
          
          // Try multiple VRAM field names
          let vramBytes = gpu?.vram || 0;
          if (!vramBytes) {
            if (gpuData.vramSize) {
              vramBytes = gpuData.vramSize;
            } else if (gpuData.memorySize) {
              vramBytes = gpuData.memorySize;
            } else if (gpuData.dedicatedVideoMemory) {
              vramBytes = gpuData.dedicatedVideoMemory;
            }
          }
          
          // Try multiple GPU name fields
          const gpuName = gpuData.gpuName || 
                         gpuData.name || 
                         gpuData.deviceName || 
                         gpuData.description ||
                         gpu?.name ||
                         'Unknown GPU';
          
          gpu = {
            name: gpuName,
            vram: vramBytes,
            hasNvidiaGPU: gpuData.hasNvidiaGPU || gpuData.vendor?.toLowerCase().includes('nvidia') || gpuName.toLowerCase().includes('nvidia') || false,
            isAMD: gpuData.isAMD || gpuData.vendor?.toLowerCase().includes('amd') || gpuName.toLowerCase().includes('amd') || false
          };
        }

        // If we still don't have VRAM info but have GPU name, try to estimate VRAM
        if (gpu && gpu.vram === 0 && gpu.name && gpu.name !== 'Unknown GPU') {
          const estimatedVRAM = estimateVRAMFromGPUName(gpu.name);
          if (estimatedVRAM > 0) {
            gpu.vram = estimatedVRAM;
            console.log(`Estimated VRAM for ${gpu.name}: ${estimatedVRAM / (1024 * 1024 * 1024)}GB`);
          }
        }

        // If we have VRAM but no GPU name, try to reverse-engineer the GPU name
        if (gpu && gpu.vram > 0 && (gpu.name === 'Unknown GPU' || !gpu.name)) {
          const vramGB = gpu.vram / (1024 * 1024 * 1024);
          gpu.name = estimateGPUNameFromVRAM(vramGB, gpu.hasNvidiaGPU, gpu.isAMD);
        }

        console.log('Final parsed system info:', { totalRAM, availableRAM, gpu });

        // Cache system info for model analysis
        (window as any).__systemInfo = {
          totalRAM,
          availableRAM,
          gpu
        };

        setSystemInfo({
          totalRAM,
          availableRAM,
          gpu
        });
      } catch (error) {
        console.error('Failed to load system info:', error);
        // Set defaults
        setSystemInfo({
          totalRAM: 8 * 1024 * 1024 * 1024, // 8GB default
          availableRAM: 4 * 1024 * 1024 * 1024, // 4GB default
          gpu: null
        });
      }
    };

    loadSystemInfo();
  }, []);

  // Helper function to estimate VRAM for known GPU models
  const estimateVRAMFromGPUName = (gpuName: string): number => {
    const name = gpuName.toLowerCase();
    
    // NVIDIA RTX 40 series
    if (name.includes('rtx 4090')) return 24 * 1024 * 1024 * 1024; // 24GB
    if (name.includes('rtx 4080')) return 16 * 1024 * 1024 * 1024; // 16GB
    if (name.includes('rtx 4070 ti')) return 12 * 1024 * 1024 * 1024; // 12GB
    if (name.includes('rtx 4070')) return 12 * 1024 * 1024 * 1024; // 12GB
    if (name.includes('rtx 4060 ti')) return 16 * 1024 * 1024 * 1024; // 16GB or 8GB
    if (name.includes('rtx 4060')) return 8 * 1024 * 1024 * 1024; // 8GB
    
    // NVIDIA RTX 30 series
    if (name.includes('rtx 3090')) return 24 * 1024 * 1024 * 1024; // 24GB
    if (name.includes('rtx 3080')) return 10 * 1024 * 1024 * 1024; // 10GB
    if (name.includes('rtx 3070')) return 8 * 1024 * 1024 * 1024; // 8GB
    if (name.includes('rtx 3060')) return 12 * 1024 * 1024 * 1024; // 12GB
    
    // AMD RX 7000 series
    if (name.includes('rx 7900')) return 20 * 1024 * 1024 * 1024; // 20GB
    if (name.includes('rx 7800')) return 16 * 1024 * 1024 * 1024; // 16GB
    if (name.includes('rx 7700')) return 12 * 1024 * 1024 * 1024; // 12GB
    if (name.includes('rx 7600')) return 8 * 1024 * 1024 * 1024; // 8GB
    
    // AMD RX 6000 series
    if (name.includes('rx 6950')) return 16 * 1024 * 1024 * 1024; // 16GB
    if (name.includes('rx 6900')) return 16 * 1024 * 1024 * 1024; // 16GB
    if (name.includes('rx 6800')) return 16 * 1024 * 1024 * 1024; // 16GB
    if (name.includes('rx 6700')) return 12 * 1024 * 1024 * 1024; // 12GB
    if (name.includes('rx 6600')) return 8 * 1024 * 1024 * 1024; // 8GB
    
    return 0; // Unknown GPU
  };

  // Helper function to estimate GPU name from VRAM amount and vendor
  const estimateGPUNameFromVRAM = (vramGB: number, isNvidia: boolean, isAMD: boolean): string => {
    const vram = Math.round(vramGB);
    
    if (isNvidia) {
      // NVIDIA GPUs based on VRAM
      if (vram === 24) return 'NVIDIA GeForce RTX 4090'; // Most likely for 24GB
      if (vram === 16) return 'NVIDIA GeForce RTX 4080';
      if (vram === 12) return 'NVIDIA GeForce RTX 4070 Ti';
      if (vram === 10) return 'NVIDIA GeForce RTX 3080';
      if (vram === 8) return 'NVIDIA GeForce RTX 4060';
      if (vram === 6) return 'NVIDIA GeForce GTX 1060';
      if (vram === 4) return 'NVIDIA GeForce GTX 1050 Ti';
    } else if (isAMD) {
      // AMD GPUs based on VRAM
      if (vram === 20) return 'AMD Radeon RX 7900 XTX';
      if (vram === 16) return 'AMD Radeon RX 6800 XT';
      if (vram === 12) return 'AMD Radeon RX 6700 XT';
      if (vram === 8) return 'AMD Radeon RX 7600';
      if (vram === 6) return 'AMD Radeon RX 5600 XT';
      if (vram === 4) return 'AMD Radeon RX 5500 XT';
    } else {
      // Unknown vendor but try to guess from VRAM
      if (vram === 24) return 'High-End GPU (24GB)'; // Likely RTX 4090 or RTX 3090
      if (vram === 16) return 'High-End GPU (16GB)';
      if (vram === 12) return 'Mid-High-End GPU (12GB)';
      if (vram === 10) return 'Mid-High-End GPU (10GB)';
      if (vram === 8) return 'Mid-Range GPU (8GB)';
      if (vram === 6) return 'Mid-Range GPU (6GB)';
      if (vram === 4) return 'Entry-Level GPU (4GB)';
    }
    
    return `GPU with ${vram}GB VRAM`;
  };

  // Enhanced model analysis with file size fetching
  const analyzeModel = async (model: HuggingFaceModel): Promise<EnhancedModel> => {
    // Filter and prioritize GGUF files, exclude non-model files but include split files
    const filteredFiles = model.files.filter(file => {
      const filename = file.rfilename.toLowerCase();
      
      // Exclude documentation and non-model files
      if (filename.includes('readme') || filename.includes('.md') || filename.includes('.txt') || 
          filename.includes('license') || filename.includes('.json') || filename.includes('.py') ||
          filename.includes('config') || filename.includes('.git')) {
        return false;
      }
      
      // Include split files (now supported) - files with pattern like "001-of-003"
      // Split files are essential for very large models (>50B parameters)
      if (filename.match(/\d+-of-\d+\.gguf$/)) {
        console.log(`Including split file: ${file.rfilename}`);
        return true;
      }
      
      // Include GGUF files and mmproj files (mmproj are essential for vision models)
      return filename.includes('.gguf') || filename.includes('.bin') || 
             filename.includes('.safetensors') || filename.includes('mmproj');
    });
    
    // Separate main model files from mmproj files
    const modelFiles = filteredFiles.filter(file => 
      !file.rfilename.toLowerCase().includes('mmproj')
    );
    const mmprojFiles = filteredFiles.filter(file => 
      file.rfilename.toLowerCase().includes('mmproj')
    );
    
    console.log(`Model ${model.name}: Original files: ${model.files.length}, Filtered model files: ${modelFiles.length}, MMProj files: ${mmprojFiles.length}`);
    
    if (modelFiles.length === 0) {
      console.warn(`No compatible GGUF files found for ${model.name}`);
      // Return minimal model info if no compatible files
      return {
        ...model,
        files: [],
        compatibility: {
          fitsInRAM: 'no' as const,
          fitsInVRAM: 'no' as const,
          parameterCount: 'Unknown',
          estimatedRAMUsage: 0,
          quantization: 'Unsupported',
          architecture: 'Unknown',
          fitAnalysis: null
        },
        metadata: {
          hasMmproj: mmprojFiles.length > 0,
          mmprojFiles: mmprojFiles,
          needsMmproj: false,
          isVisionModel: false
        }
      } as any;
    }
    
    // Fetch actual file sizes if they're missing (0 B) for both model and mmproj files
    const allFilesToProcess = [...modelFiles, ...mmprojFiles];
    const filesWithSizes = await Promise.all(allFilesToProcess.map(async (file) => {
      if (!file.size || file.size === 0) {
        try {
          // Try to fetch file metadata from Hugging Face API
          const response = await fetch(`https://huggingface.co/${model.id}/resolve/main/${file.rfilename}`, {
            method: 'HEAD'
          });
          
          if (response.ok) {
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
              const size = parseInt(contentLength, 10);
              console.log(`Fetched size for ${file.rfilename}: ${size} bytes`);
              return { ...file, size };
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch size for ${file.rfilename}:`, error);
        }
        
        // For mmproj files, use a default estimate if size fetch fails
        if (file.rfilename.toLowerCase().includes('mmproj')) {
          const estimatedMmprojSize = 600 * 1024 * 1024; // ~600MB typical for mmproj
          console.log(`Estimated size for mmproj ${file.rfilename}: ${estimatedMmprojSize} bytes`);
          return { ...file, size: estimatedMmprojSize };
        }
        
        // Fallback: estimate size based on model parameters and quantization for model files
        const nameParamMatch = model.name.match(/(\d+\.?\d*)[bB]/i);
        const paramCount = nameParamMatch ? parseFloat(nameParamMatch[1]) : 0;
        
        if (paramCount > 0) {
          // Estimate total model size based on parameters and quantization
          let bytesPerParam = 0.5; // Default for Q4
          if (file.rfilename.toLowerCase().includes('q4_k_s')) bytesPerParam = 0.45;
          else if (file.rfilename.toLowerCase().includes('q4_k_m')) bytesPerParam = 0.5;
          else if (file.rfilename.toLowerCase().includes('q5_k_s')) bytesPerParam = 0.65;
          else if (file.rfilename.toLowerCase().includes('q5_k_m')) bytesPerParam = 0.7;
          else if (file.rfilename.toLowerCase().includes('q6_k')) bytesPerParam = 0.8;
          else if (file.rfilename.toLowerCase().includes('q8_0')) bytesPerParam = 1.0;
          else if (file.rfilename.toLowerCase().includes('fp16')) bytesPerParam = 2.0;
          else if (file.rfilename.toLowerCase().includes('fp32')) bytesPerParam = 4.0;
          
          const estimatedSize = paramCount * 1000000000 * bytesPerParam;
          console.log(`Estimated size for ${file.rfilename}: ${estimatedSize} bytes`);
          return { ...file, size: Math.round(estimatedSize) };
        }
      }
      return file;
    }));
    
    // Separate processed files back into model files and mmproj files
    const processedModelFiles = filesWithSizes.filter(file => 
      !file.rfilename.toLowerCase().includes('mmproj')
    );
    const processedMmprojFiles = filesWithSizes.filter(file => 
      file.rfilename.toLowerCase().includes('mmproj')
    );
    
    console.log('Model files with sizes:', processedModelFiles.map(f => ({ name: f.rfilename, size: f.size })));
    console.log('MMProj files with sizes:', processedMmprojFiles.map(f => ({ name: f.rfilename, size: f.size })));
    
    // Group files by quantization type for smart selection (only for model files, not mmproj)
    const quantGroups = new Map<string, typeof processedModelFiles>();
    processedModelFiles.forEach(file => {
      const filename = file.rfilename.toLowerCase();
      let quantType = 'unknown';
      
      if (filename.includes('q4_k_s')) quantType = 'q4_k_s';
      else if (filename.includes('q4_k_m')) quantType = 'q4_k_m';
      else if (filename.includes('q4_0')) quantType = 'q4_0';
      else if (filename.includes('q4_1')) quantType = 'q4_1';
      else if (filename.includes('q4')) quantType = 'q4';
      else if (filename.includes('q5_k_s')) quantType = 'q5_k_s';
      else if (filename.includes('q5_k_m')) quantType = 'q5_k_m';
      else if (filename.includes('q5_0')) quantType = 'q5_0';
      else if (filename.includes('q5_1')) quantType = 'q5_1';
      else if (filename.includes('q5')) quantType = 'q5';
      else if (filename.includes('q6_k')) quantType = 'q6_k';
      else if (filename.includes('q8_0')) quantType = 'q8_0';
      else if (filename.includes('q8')) quantType = 'q8';
      else if (filename.includes('fp16')) quantType = 'fp16';
      else if (filename.includes('fp32')) quantType = 'fp32';
      
      if (!quantGroups.has(quantType)) quantGroups.set(quantType, []);
      quantGroups.get(quantType)!.push(file);
    });
    
    // Handle split files: group split files together for each quantization
    // Split files have patterns like "model-001-of-003.gguf", "model-002-of-003.gguf"
    const splitFileGroups = new Map<string, typeof processedModelFiles>();
    quantGroups.forEach((files, quantType) => {
      const splitFiles = files.filter(file => file.rfilename.match(/\d+-of-\d+\.gguf$/));
      const nonSplitFiles = files.filter(file => !file.rfilename.match(/\d+-of-\d+\.gguf$/));
      
      if (splitFiles.length > 0) {
        // Group split files by their base name and total parts
        const splitGroups = new Map<string, typeof processedModelFiles>();
        splitFiles.forEach(file => {
          const match = file.rfilename.match(/^(.+)-(\d+)-of-(\d+)\.gguf$/);
          if (match) {
            const [, baseName, , totalParts] = match;
            const groupKey = `${baseName}-split-${totalParts}`;
            if (!splitGroups.has(groupKey)) splitGroups.set(groupKey, []);
            splitGroups.get(groupKey)!.push(file);
          }
        });
        
        // For each complete split file set, treat as one downloadable unit
        splitGroups.forEach((splitFiles, groupKey) => {
          const match = groupKey.match(/^(.+)-split-(\d+)$/);
          if (match) {
            const [, , totalParts] = match;
            const expectedParts = parseInt(totalParts, 10);
            
            // Only include complete split sets
            if (splitFiles.length === expectedParts) {
              console.log(`Found complete split file set: ${groupKey} with ${splitFiles.length} parts`);
              splitFileGroups.set(`${quantType}_split_${groupKey}`, splitFiles);
            } else {
              console.warn(`Incomplete split file set: ${groupKey}, found ${splitFiles.length}/${expectedParts} parts`);
            }
          }
        });
      }
      
      // Keep non-split files in original quantization groups
      if (nonSplitFiles.length > 0) {
        quantGroups.set(quantType, nonSplitFiles);
      } else {
        quantGroups.delete(quantType); // Remove if only split files existed
      }
    });
    
    // Merge split file groups back into quantization groups for unified handling
    // This enables support for very large models (>50B parameters) that are split into multiple files
    splitFileGroups.forEach((files, splitKey) => {
      quantGroups.set(splitKey, files);
    });
    
    // Find the best quantization that fits the system
    const cachedSystemInfo = (window as any).__systemInfo; // Get cached system info
    let bestQuantGroup: typeof processedModelFiles = [];
    
    if (cachedSystemInfo?.gpu?.vram && cachedSystemInfo.availableRAM) {
      const gpuVRAM = cachedSystemInfo.gpu.vram;
      const availableRAM = cachedSystemInfo.availableRAM;
      const totalMemory = gpuVRAM + (availableRAM * 0.6); // Hybrid approach
      
      // Priority order: try to fit in GPU first, then hybrid, then smallest available and with uppercase
      const quantPriority = ['q4_k_s', 'q4_k_m', 'q4_0', 'q4_1', 'q4', 'q5_k_s', 'q5_k_m', 'q5_0', 'q5_1', 'q5', 'q6_k', 'q8_0', 'q8', 'fp16', 'fp32', 'F16', 'F32', 'Q4_K_S', 'Q4_K_M', 'Q4_0', 'Q4_1', 'Q4', 'Q5_K_S', 'Q5_K_M', 'Q5_0', 'Q5_1', 'Q5', 'Q6_K', 'Q8_0', 'Q8', 'BF16', 'BF32','mmproj', 'IQ1', 'IQ2', 'IQ3', 'IQ4', 'IQ5', 'IQ6', 'IQ7', 'IQ8'];
      
      for (const quantType of quantPriority) {
        const group = quantGroups.get(quantType);
        if (group && group.length > 0) {
          const groupSize = group.reduce((acc, file) => acc + (file.size || 0), 0);
          
          // Check if it fits in available memory
          if (groupSize <= totalMemory) {
            bestQuantGroup = group;
            console.log(`Selected best quantization: ${quantType} (${groupSize} bytes fits in ${totalMemory} bytes)`);
            break;
          }
        }
      }
      
      // If nothing fits, use the smallest available
      if (bestQuantGroup.length === 0) {
        for (const quantType of quantPriority) {
          const group = quantGroups.get(quantType);
          if (group && group.length > 0) {
            bestQuantGroup = group;
            console.log(`Using smallest available quantization: ${quantType}`);
            break;
          }
        }
      }
    }
    
    // Fallback to first available if no system info
    if (bestQuantGroup.length === 0 && quantGroups.size > 0) {
      const firstEntry = Array.from(quantGroups.entries())[0];
      bestQuantGroup = firstEntry[1];
    }
    
    // Sort selected group by file size (smaller first)
    bestQuantGroup.sort((a, b) => (a.size || 0) - (b.size || 0));
    
    // Use the best quantization group for analysis
    const analysisFiles = bestQuantGroup.length > 0 ? bestQuantGroup : processedModelFiles;
    
    // Extract parameter count from name or description
    const nameParamMatch = model.name.match(/(\d+\.?\d*)[bB]/i);
    const descParamMatch = model.description?.match(/(\d+\.?\d*)[bB]/i);
    const paramCount = nameParamMatch ? parseFloat(nameParamMatch[1]) : 
                     descParamMatch ? parseFloat(descParamMatch[1]) : 0;
    
    // Detect quantization from filename - be more specific and accurate
    const primaryFile = analysisFiles[0];
    let quantization = 'Unknown';
    if (primaryFile?.rfilename) {
      const filename = primaryFile.rfilename.toLowerCase();
      //   const quantPriority = ['q4_k_s', 'q4_k_m', 'q4_0', 'q4_1', 'q4', 'q5_k_s', 'q5_k_m', 'q5_0', 'q5_1', 'q5', 'q6_k', 'q8_0', 'q8', 'fp16', 'fp32', 'F16', 'F32', 'Q4_K_S', 'Q4_K_M', 'Q4_0', 'Q4_1', 'Q4', 'Q5_K_S', 'Q5_K_M', 'Q5_0', 'Q5_1', 'Q5', 'Q6_K', 'Q8_0', 'Q8', 'BF16', 'BF32','mmproj', 'IQ1', 'IQ2', 'IQ3', 'IQ4', 'IQ5', 'IQ6', 'IQ7', 'IQ8'];
      //   write regex to match more stuff
      // Look for specific quantization patterns with improved regex
      const q4k_mMatch = filename.match(/q4[_-]?k[_-]?m\b/i);
      const q4k_sMatch = filename.match(/q4[_-]?k[_-]?s\b/i);
      const q4_0Match = filename.match(/q4[_-]?0\b/i);
      const q4_1Match = filename.match(/q4[_-]?1\b/i);
      const q5k_mMatch = filename.match(/q5[_-]?k[_-]?m\b/i);
      const q5k_sMatch = filename.match(/q5[_-]?k[_-]?s\b/i);
      const q5_0Match = filename.match(/q5[_-]?0\b/i);
      const q5_1Match = filename.match(/q5[_-]?1\b/i);
      const q6kMatch = filename.match(/q6[_-]?k\b/i);
      const q8_0Match = filename.match(/q8[_-]?0\b/i);
      const fp16Match = filename.match(/fp16|f16\b/i);
      const fp32Match = filename.match(/fp32|f32\b/i);
        const bf16Match = filename.match(/bf16|b16\b/i);
        const bf32Match = filename.match(/bf32|b32\b/i);
        const iq1Match = filename.match(/iq1\b/i);
        const iq2Match = filename.match(/iq2\b/i);
        const iq3Match = filename.match(/iq3\b/i);
        const iq4Match = filename.match(/iq4\b/i);
        const iq5Match = filename.match(/iq5\b/i);
        const iq6Match = filename.match(/iq6\b/i);
        const iq7Match = filename.match(/iq7\b/i);
        const iq8Match = filename.match(/iq8\b/i);
        const mmprojMatch = filename.match(/mmproj\b/i);
        const q4Match = filename.match(/q4\b/i);
        const q5Match = filename.match(/q5\b/i);
        const q6Match = filename.match(/q6\b/i);
        const q8Match = filename.match(/q8\b/i);
        const f16Match = filename.match(/f16\b/i);
        const f32Match = filename.match(/f32\b/i);
        
    
    
      
      // Map to specific quantization types
      if (q4k_mMatch) quantization = 'Q4_K_M';
      else if (q4k_sMatch) quantization = 'Q4_K_S';
      else if (q4_1Match) quantization = 'Q4_1';
      else if (q4_0Match) quantization = 'Q4_0';
      else if (filename.includes('q4')) quantization = 'Q4';
      else if (q5k_mMatch) quantization = 'Q5_K_M';
      else if (q5k_sMatch) quantization = 'Q5_K_S';
      else if (q5_1Match) quantization = 'Q5_1';
      else if (q5_0Match) quantization = 'Q5_0';
      else if (filename.includes('q5')) quantization = 'Q5';
      else if (q6kMatch) quantization = 'Q6_K';
      else if (q8_0Match) quantization = 'Q8_0';
      else if (filename.includes('q8')) quantization = 'Q8';
      else if (fp16Match) quantization = 'FP16';
      else if (fp32Match) quantization = 'FP32';
      else if (bf16Match) quantization = 'BF16';
      else if (bf32Match) quantization = 'BF32';
      else if (iq1Match) quantization = 'IQ1';
      else if (iq2Match) quantization = 'IQ2';
      else if (iq3Match) quantization = 'IQ3';
      else if (iq4Match) quantization = 'IQ4';
      else if (iq5Match) quantization = 'IQ5';
      else if (iq6Match) quantization = 'IQ6';
      else if (iq7Match) quantization = 'IQ7';
      else if (iq8Match) quantization = 'IQ8';
      else if (mmprojMatch) quantization = 'MMProj'; // Special case for mmproj files
      else if (q4Match) quantization = 'Q4'; // Generic Q4
      else if (q5Match) quantization = 'Q5'; // Generic Q5
      else if (q6Match) quantization = 'Q6'; // Generic Q6
      else if (q8Match) quantization = 'Q8'; // Generic Q8
      else if (f16Match) quantization = 'F16'; // Generic F16
      else if (f32Match) quantization = 'F32'; // Generic F32
      else {
        // Advanced inference from file size and parameter count
        const fileSize = primaryFile.size || 0;
        if (paramCount > 0 && fileSize > 0) {
          const bytesPerParam = fileSize / (paramCount * 1000000000);
          if (bytesPerParam < 0.6) quantization = 'Q4_K_M';
          else if (bytesPerParam < 0.8) quantization = 'Q5_K_M';
          else if (bytesPerParam < 1.2) quantization = 'Q6_K';
          else if (bytesPerParam < 1.8) quantization = 'Q8_0';
          else if (bytesPerParam < 2.5) quantization = 'FP16';
          else quantization = 'FP32';
        }
      }
    }
    
    // Calculate model size from filtered GGUF files only (exclude READMEs, etc.)
    const modelSize = analysisFiles.reduce((acc, file) => acc + (file.size || 0), 0);
    
    // Enhanced RAM usage calculation based on quantization type
    let ramMultiplier = 1.4; // Default 40% overhead
    
    // Adjust multiplier based on quantization precision
    switch (quantization) {
      case 'Q4_K_M':
      case 'Q4_K_S':
      case 'Q4_0':
      case 'Q4_1':
      case 'Q4':
        ramMultiplier = 1.3; // Q4 is more memory efficient
        break;
      case 'Q5_K_M':
      case 'Q5_K_S':
      case 'Q5_0':
      case 'Q5_1':
      case 'Q5':
        ramMultiplier = 1.35;
        break;
      case 'Q6_K':
        ramMultiplier = 1.4;
        break;
      case 'Q8_0':
      case 'Q8':
        ramMultiplier = 1.45;
        break;
      case 'FP16':
        ramMultiplier = 1.5;
        break;
      case 'FP32':
        ramMultiplier = 1.6; // FP32 needs more overhead
        break;
      case 'BF16':
        ramMultiplier = 1.55; // BF16 is similar to FP16 but slightly more efficient
        break;
      case 'BF32':    
        ramMultiplier = 1.65; // BF32 is similar to FP32 but slightly more efficient
        break;
      case 'IQ1':   
        ramMultiplier = 1.2; // IQ1 is very efficient
        break;
      case 'IQ2':
        ramMultiplier = 1.25; // IQ2 is efficient
        break;
      case 'IQ3':
        ramMultiplier = 1.3; // IQ3 is efficient
        break;
      case 'IQ4':
        ramMultiplier = 1.35; // IQ4 is efficient
        break;
      case 'IQ5':
        ramMultiplier = 1.4; // IQ5 is efficient
        break;
      case 'IQ6':
        ramMultiplier = 1.45; // IQ6 is efficient
        break;
      case 'IQ7':
        ramMultiplier = 1.5; // IQ7 is efficient
        break;
      case 'IQ8':
        ramMultiplier = 1.55; // IQ8 is efficient
        break;
      case 'MMProj':
            ramMultiplier = 1.6; // MMProj is efficient
        break;
      default:
        ramMultiplier = 1.4; // Default for unknown quantization
        break;
    }
    
    const estimatedRAMUsage = modelSize * ramMultiplier;
    
    // Determine architecture from name/tags/description
    let architecture = 'Unknown';
    const nameAndDesc = (model.name + ' ' + (model.description || '')).toLowerCase();
    
    if (nameAndDesc.includes('llama')) architecture = 'Llama';
    else if (nameAndDesc.includes('qwen')) architecture = 'Qwen';
    else if (nameAndDesc.includes('phi')) architecture = 'Phi';
    else if (nameAndDesc.includes('mistral')) architecture = 'Mistral';
    else if (nameAndDesc.includes('gemma')) architecture = 'Gemma';
    else if (nameAndDesc.includes('yi ')) architecture = 'Yi';
    else if (nameAndDesc.includes('baichuan')) architecture = 'Baichuan';
    else if (nameAndDesc.includes('chatglm')) architecture = 'ChatGLM';
    else if (nameAndDesc.includes('internlm')) architecture = 'InternLM';
    else if (nameAndDesc.includes('codellama')) architecture = 'CodeLlama';
    else if (nameAndDesc.includes('deepseek')) architecture = 'DeepSeek';
    else if (nameAndDesc.includes('internvl')) architecture = 'InternVL';
    else if (nameAndDesc.includes('llava')) architecture = 'Llava';
    else if (nameAndDesc.includes('clip')) architecture = 'CLIP';
    else if (nameAndDesc.includes('minicpm')) architecture = 'MiniCPM';
    else if (nameAndDesc.includes('cogvlm')) architecture = 'CogVLM';
    else if (nameAndDesc.includes('qwen-vl')) architecture = 'Qwen-VL';
    else if (nameAndDesc.includes('vila')) architecture = 'VILA';
    else if (nameAndDesc.includes('blip')) architecture = 'BLIP';
    else if (nameAndDesc.includes('instructblip')) architecture = 'InstructBLIP';
    else if (nameAndDesc.includes('flamingo')) architecture = 'Flamingo';
    else if (nameAndDesc.includes('gpt')) architecture = 'GPT';
    else if (nameAndDesc.includes('gpt-neo')) architecture = 'GPT-Neo';
    else if (nameAndDesc.includes('gpt-j')) architecture = 'GPT-J';
    else if (nameAndDesc.includes('gpt-2')) architecture = 'GPT-2';
    else if (nameAndDesc.includes('gpt-3')) architecture = 'GPT-3';
    else if (nameAndDesc.includes('gpt-4')) architecture = 'GPT-4';

    
    // Enhanced compatibility assessment with smart RAM+GPU logic
    // Use cached system info if state systemInfo is not yet available (during initial load)
    const effectiveSystemInfo = systemInfo || (window as any).__systemInfo;
    
    const compatibility = {
      fitsInRAM: effectiveSystemInfo ? (() => {
        if (estimatedRAMUsage <= effectiveSystemInfo.availableRAM * 0.8) return 'yes';
        if (estimatedRAMUsage <= effectiveSystemInfo.totalRAM * 0.9) return 'maybe';
        return 'no';
      })() : 'maybe' as 'yes' | 'maybe' | 'no',
      
      fitsInVRAM: effectiveSystemInfo?.gpu && effectiveSystemInfo.gpu.vram > 0 ? (() => {
        // Check if model fits fully in GPU VRAM
        if (modelSize <= effectiveSystemInfo.gpu.vram * 0.8) return 'yes';
        if (modelSize <= effectiveSystemInfo.gpu.vram) return 'maybe';
        
        // Check if model can fit using RAM+GPU hybrid approach
        if (effectiveSystemInfo.availableRAM > 0) {
          const totalMemory = effectiveSystemInfo.gpu.vram + (effectiveSystemInfo.availableRAM * 0.6); // Use 60% of available RAM
          if (modelSize <= totalMemory) return 'maybe'; // Can use hybrid approach
        }
        
        return 'no';
      })() : 'na' as 'yes' | 'maybe' | 'no' | 'na',
      
      parameterCount: paramCount >= 1 ? `${paramCount}B` : 
                     paramCount > 0 ? `${(paramCount * 1000).toFixed(0)}M` : 'Unknown',
      estimatedRAMUsage,
      quantization,
      architecture,
      
      // Add detailed fit analysis for UI display
      fitAnalysis: effectiveSystemInfo ? {
        fitsFullyInGPU: effectiveSystemInfo.gpu?.vram ? modelSize <= effectiveSystemInfo.gpu.vram * 0.8 : false,
        fitsInRAMPlusGPU: effectiveSystemInfo.gpu?.vram && effectiveSystemInfo.availableRAM ? 
          modelSize <= (effectiveSystemInfo.gpu.vram + effectiveSystemInfo.availableRAM * 0.6) : false,
        recommendedMemoryGB: Math.ceil(estimatedRAMUsage / (1024 * 1024 * 1024)),
        modelSizeGB: Math.ceil(modelSize / (1024 * 1024 * 1024))
      } : null
    } as any;

    // Enhanced metadata detection - primary detection based on actual mmproj file presence
    const hasMmprojFiles = model.files.some(f => f.rfilename.toLowerCase().includes('mmproj'));
    const mmprojFilesList = model.files.filter(f => f.rfilename.toLowerCase().includes('mmproj'));
    
    // Secondary detection via tags and name patterns (as fallback)
    const hasVisionTags = model.tags?.some(tag => 
      ['vision', 'multimodal', 'vl', 'llava', 'clip', 'minicpm', 'cogvlm', 'qwen-vl', 'internvl'].includes(tag.toLowerCase())
    );
    const hasVisionKeywords = nameAndDesc.includes('vision') || nameAndDesc.includes('multimodal') || 
                             nameAndDesc.includes('llava') || nameAndDesc.includes('llama-vision') ||
                             nameAndDesc.includes('minicpm-v') || nameAndDesc.includes('cogvlm') ||
                             nameAndDesc.includes('qwen-vl') || nameAndDesc.includes('internvl') ||
                             nameAndDesc.includes('vila') || nameAndDesc.includes('blip') ||
                             nameAndDesc.includes('instructblip') || nameAndDesc.includes('flamingo');
    
    const metadata = {
      // Primary indicator: if repo has mmproj files, it's definitely a vision model
      isVisionModel: hasMmprojFiles || hasVisionTags || hasVisionKeywords,
      
      // Need mmproj if it's detected as vision model but doesn't have mmproj files yet
      needsMmproj: (hasVisionTags || hasVisionKeywords) && !hasMmprojFiles,
      
      // Has mmproj files available for download
      hasMmprojAvailable: hasMmprojFiles,
                   
      hasMmproj: hasMmprojFiles,
      
      mmprojFiles: mmprojFilesList,
                   
      contextLength: (() => {
        const contextMatch = nameAndDesc.match(/(\d+)k\s*context|context\s*(\d+)k/i);
        return contextMatch ? parseInt(contextMatch[1] || contextMatch[2]) * 1000 : undefined;
      })()
    };

    return {
      ...model,
      files: analysisFiles, // Use best-fit quantization files (main model files only)
      compatibility,
      metadata: {
        ...metadata,
        // Override with processed mmproj files that have correct sizes
        hasMmproj: processedMmprojFiles.length > 0,
        hasMmprojAvailable: processedMmprojFiles.length > 0,
        mmprojFiles: processedMmprojFiles,
        // Update isVisionModel based on actual mmproj presence (most reliable indicator)
        isVisionModel: processedMmprojFiles.length > 0 || metadata.isVisionModel,
        availableQuantizations: Array.from(quantGroups.entries()).map(([type, files]) => ({
          type,
          files,
          totalSize: files.reduce((acc, file) => acc + (file.size || 0), 0),
          displayName: type.toUpperCase().replace(/_/g, '_')
        })).sort((a, b) => a.totalSize - b.totalSize)
      }
    };
  };

  // Cache management functions
  const CACHE_KEY = 'angela_recommended_models_cache';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day in milliseconds

  const getCachedRecommendedModels = (): EnhancedModel[] | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is still valid (within TTL)
      if (now - timestamp < CACHE_TTL) {
        console.log('Using cached recommended models (cache age:', Math.round((now - timestamp) / (60 * 60 * 1000)), 'hours)');
        return data;
      } else {
        // Cache expired, remove it
        localStorage.removeItem(CACHE_KEY);
        console.log('Recommended models cache expired, will fetch fresh data');
        return null;
      }
    } catch (error) {
      console.error('Error reading cached models:', error);
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  };

  const setCachedRecommendedModels = (models: EnhancedModel[]): void => {
    try {
      const cacheData = {
        data: models,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      console.log('Cached', models.length, 'recommended models for 1 day');
    } catch (error) {
      console.error('Error caching models:', error);
    }
  };

  // Load and analyze models
  const loadModels = async (filter: typeof activeFilter, query: string = '') => {
    if (!window.modelManager?.searchHuggingFaceModels) return;
    
    console.log(`Loading models - Filter: ${filter}, Query: "${query}"`);

    // Check cache for recommended models without search query
    if (filter === 'recommended' && (!query || !query.trim())) {
      const cachedModels = getCachedRecommendedModels();
      if (cachedModels && cachedModels.length > 0) {
        setModels(cachedModels);
        setIsLoading(false);
        return;
      }
    }
    
    setIsLoading(true);
    setApiError(null);
    setIsRateLimited(false);
    
    try {
      let sortParam = 'lastModified';
      let searchQueries: string[] = [];
      
      switch (filter) {
        case 'recommended':
          // For recommended, if there's a search query, use it, otherwise use expanded model queries
          if (query && query.trim()) {
            searchQueries = [query];
            sortParam = 'downloads'; // Sort by popularity for search results
            console.log('Using search query for recommended:', query);
          } else {
            // Expanded recommendations to include various model sizes and quantizations
            // Support for small to very large models (1.5B to 70B+ parameters)
            searchQueries = [
              '7b q4', '3b q4', '1.5b q4', 'instruct q4',  // Original efficient models
              '13b q4', '30b q4', '70b q4',                // Medium to large models
              '8b q4', '14b q4', '22b q4',                 // Additional popular sizes
              'q8_0', 'f16',                               // Higher quality quantizations
              'vision q4', 'multimodal q4'                 // Vision/multimodal models
            ];
            sortParam = 'downloads';
            console.log('Using expanded recommended queries for all model sizes');
          }
          break;
        case 'latest':
          searchQueries = [query || 'gguf'];
          sortParam = 'lastModified';
          console.log('Latest query:', searchQueries[0]);
          break;
        case 'popular':
          searchQueries = [query || 'gguf'];
          sortParam = 'downloads';
          console.log('Popular query:', searchQueries[0]);
          break;
        case 'trending':
          searchQueries = [query || 'gguf'];
          sortParam = 'trending';
          console.log('Trending query:', searchQueries[0]);
          break;
      }

      const allModels: HuggingFaceModel[] = [];
      let hasRateLimitError = false;
      
      for (const searchQuery of searchQueries) {
        const result = await window.modelManager.searchHuggingFaceModels(
          searchQuery, 
          filter === 'recommended' ? 25 : 30, // Increased limits to show more models including large ones
          sortParam
        );
        
        if (result.success) {
          allModels.push(...result.models);
        } else if (result.error) {
          // Check for rate limiting (HTTP 429) or API errors
          if (result.error.includes('429') || result.error.toLowerCase().includes('rate limit')) {
            hasRateLimitError = true;
            console.log('Rate limit detected:', result.error);
          } else {
            console.error('API error:', result.error);
            setApiError(result.error);
          }
        }
      }

      // If we hit rate limits, set appropriate state
      if (hasRateLimitError && allModels.length === 0) {
        setIsRateLimited(true);
        setModels([]);
        return;
      }

      // Remove duplicates
      const uniqueModels = allModels.filter((model, index, self) => 
        index === self.findIndex(m => m.id === model.id)
      );

      // Analyze each model
      const enhancedModels = await Promise.all(
        uniqueModels.map(model => analyzeModel(model))
      );

      // Sort by compatibility for recommended tab
      if (filter === 'recommended') {
        enhancedModels.sort((a, b) => {
          const aScore = (a.compatibility.fitsInRAM === 'yes' ? 3 : a.compatibility.fitsInRAM === 'maybe' ? 2 : 1) +
                        (a.downloads / 1000);
          const bScore = (b.compatibility.fitsInRAM === 'yes' ? 3 : b.compatibility.fitsInRAM === 'maybe' ? 2 : 1) +
                        (b.downloads / 1000);
          return bScore - aScore;
        });
      }

      const finalModels = enhancedModels.slice(0, 18); // Show top 18 results to accommodate larger variety
      setModels(finalModels);

      // Cache recommended models (without search query) for 1 day to reduce API calls
      if (filter === 'recommended' && (!query || !query.trim())) {
        setCachedRecommendedModels(finalModels);
      }
    } catch (error) {
      console.error('Error loading models:', error);
      
      // Check if the error message contains rate limit indicators
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
        setIsRateLimited(true);
      } else {
        setApiError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load models when filter changes, but wait for system info on initial load
  useEffect(() => {
    // For initial load of recommended filter without search query, wait for system info
    if (activeFilter === 'recommended' && !searchQuery.trim() && !systemInfo && !(window as any).__systemInfo) {
      console.log('Waiting for system info before loading recommended models...');
      return;
    }
    
    // For all other cases (search queries, other filters, or when system info is available), load immediately
    console.log('Loading models for filter change:', activeFilter, 'query:', searchQuery);
    loadModels(activeFilter, ''); // Don't pass searchQuery here, let the filter handle its own defaults
  }, [activeFilter]);

  // Trigger initial model load when system info becomes available (for recommended tab only)
  useEffect(() => {
    if (systemInfo && models.length === 0 && !isLoading && activeFilter === 'recommended' && !searchQuery.trim()) {
      console.log('System info available, loading initial recommended models...');
      loadModels(activeFilter, '');
    }
  }, [systemInfo]);

  const handleSearch = () => {
    // Always perform search when user clicks search or presses Enter
    console.log('Performing search with query:', searchQuery);
    loadModels(activeFilter, searchQuery);
  };

  // Clear cache function
  const clearRecommendedCache = () => {
    try {
      localStorage.removeItem(CACHE_KEY);
      console.log('Cleared recommended models cache');
      // Reload if we're currently on recommended tab without search
      if (activeFilter === 'recommended' && (!searchQuery || !searchQuery.trim())) {
        loadModels(activeFilter, '');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  // Check if cache exists and is valid
  const getCacheStatus = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const { timestamp } = JSON.parse(cached);
      const now = Date.now();
      const age = now - timestamp;
      
      if (age < CACHE_TTL) {
        return {
          isValid: true,
          ageHours: Math.round(age / (60 * 60 * 1000)),
          remainingHours: Math.round((CACHE_TTL - age) / (60 * 60 * 1000))
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const formatBytes = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Download Queue Management Functions
  const addToDownloadQueue = (modelId: string, modelName: string, fileName: string, allFiles?: Array<{ rfilename: string; size?: number }>) => {
    const queueItem: QueuedDownload = {
      id: `${modelId}-${fileName}-${Date.now()}`,
      modelId,
      modelName,
      fileName,
      allFiles,
      status: 'queued',
      addedAt: new Date(),
      retryCount: 0,
      downloadUrl: `https://huggingface.co/${modelId}/resolve/main/${fileName}`
    };
    
    setDownloadQueue(prev => [...prev, queueItem]);
    setShowDownloadQueue(true);
  };

  const removeFromQueue = (queueId: string) => {
    setDownloadQueue(prev => prev.filter(item => item.id !== queueId));
  };

  const retryQueuedDownload = async (queueId: string) => {
    const queueItem = downloadQueue.find(item => item.id === queueId);
    if (!queueItem) return;

    setDownloadQueue(prev => prev.map(item => 
      item.id === queueId 
        ? { ...item, status: 'retrying', retryCount: item.retryCount + 1 }
        : item
    ));

    try {
      if (queueItem.allFiles && onDownloadWithDependencies) {
        await onDownloadWithDependencies(queueItem.modelId, queueItem.fileName, queueItem.allFiles);
      } else {
        await onDownload(queueItem.modelId, queueItem.fileName);
      }
      
      // If successful, remove from queue
      removeFromQueue(queueId);
    } catch (error) {
      console.error('Retry download failed:', error);
      
      // Check if it's still a rate limit error
      if (error instanceof Error && (error.message.includes('429') || error.message.toLowerCase().includes('rate limit'))) {
        setDownloadQueue(prev => prev.map(item => 
          item.id === queueId 
            ? { ...item, status: 'queued' }
            : item
        ));
      } else {
        setDownloadQueue(prev => prev.map(item => 
          item.id === queueId 
            ? { ...item, status: 'failed' }
            : item
        ));
      }
    }
  };

  const processQueue = async () => {
    if (isProcessingQueue) return;
    
    setIsProcessingQueue(true);
    const queuedItems = downloadQueue.filter(item => item.status === 'queued');
    
    for (const item of queuedItems) {
      try {
        // Wait 2 seconds between attempts to avoid hitting rate limits again
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await retryQueuedDownload(item.id);
      } catch (error) {
        console.error('Queue processing error:', error);
        break; // Stop processing if we hit another error
      }
    }
    
    setIsProcessingQueue(false);
  };

  const openModelFolder = async () => {
    try {
      // Try to open the models folder using electron API
      if ((window as any).electronAPI?.openModelsFolder) {
        await (window as any).electronAPI.openModelsFolder();
      } else {
        console.warn('Electron API not available for opening folder');
      }
    } catch (error) {
      console.error('Failed to open models folder:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* System Info Header */}
      {systemInfo && (
        <div className="glassmorphic rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  RAM: {formatBytes(systemInfo.totalRAM)} ({formatBytes(systemInfo.availableRAM)} available)
                </span>
              </div>
              {systemInfo.gpu && (
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {systemInfo.gpu.name} ({systemInfo.gpu.vram > 0 ? formatBytes(systemInfo.gpu.vram) : 'VRAM Unknown'})
                  </span>
                </div>
              )}
              {!systemInfo.gpu && (
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-500">
                    No dedicated GPU detected
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Compatibility based on your system
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Search className="w-5 h-5 text-sakura-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Model Discovery Hub
          </h3>
          {searchQuery.trim() && (
            <span className="px-3 py-1 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 rounded-full text-sm">
              Searching: "{searchQuery}"
            </span>
          )}
        </div>

        {/* Search Bar */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search models, authors, capabilities..."
              className="w-full px-4 py-3 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
            />
            {searchQuery.trim() && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  loadModels(activeFilter, '');
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 items-center flex-wrap">
          {[
            { id: 'recommended', label: 'Recommended', icon: CheckCircle },
            { id: 'latest', label: 'Latest', icon: Clock },
            { id: 'popular', label: 'Popular', icon: Star },
            { id: 'trending', label: 'Trending', icon: TrendingUp }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveFilter(id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeFilter === id
                  ? 'bg-sakura-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
              {id === 'recommended' && getCacheStatus() && (
                <span className="text-xs opacity-75 ml-1">
                  📄{getCacheStatus()!.ageHours}h
                </span>
              )}
            </button>
          ))}
          
          {/* Cache controls for recommended tab */}
          {activeFilter === 'recommended' && getCacheStatus() && (
            <button
              onClick={clearRecommendedCache}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              title={`Cache expires in ${getCacheStatus()!.remainingHours}h. Click to refresh now.`}
            >
              <RefreshCw className="w-3 h-3" />
              Clear Cache
            </button>
          )}
        </div>
      </div>

      {/* Models Grid */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="glassmorphic rounded-xl p-12 text-center">
            <div className="w-8 h-8 border-2 border-sakura-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading models...</p>
          </div>
        ) : isRateLimited ? (
          <div className="glassmorphic rounded-xl p-8 text-center border-l-4 border-amber-500">
            <div className="flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h4 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-3">
              Taking a Brief Pause
            </h4>
            <p className="text-amber-700 dark:text-amber-300 mb-4 max-w-md mx-auto">
              We've made quite a few requests to Hugging Face's servers and they've asked us to slow down a bit. 
              This isn't an error on your part - it's a normal part of how the API works to ensure fair access for everyone.
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-sm mb-6">
              Please wait a moment and try again. The models will be available shortly!
              <br />
              <small className="text-amber-500 dark:text-amber-400">
                💡 Tip: Recommended models are now cached for 24 hours to reduce API calls and prevent rate limits.
              </small>
              <br />
              <small>Dev Note: We don't have any server and we never wanted to check the models you use so yeah thats the reason. You are safe that your data is not being logged or monitored in any way.</small>
            </p>
            <button
              onClick={() => {
                setIsRateLimited(false);
                loadModels(activeFilter, searchQuery);
              }}
              className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white px-6 py-2 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        ) : apiError ? (
          <div className="glassmorphic rounded-xl p-8 text-center border-l-4 border-red-500">
            <div className="flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h4 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-3">
              Connection Issue
            </h4>
            <p className="text-red-700 dark:text-red-300 mb-4 max-w-md mx-auto">
              We're having trouble connecting to the model repository. This could be a temporary network issue.
            </p>
            <p className="text-red-600 dark:text-red-400 text-sm mb-6 font-mono bg-red-100 dark:bg-red-900/30 p-2 rounded">
              {apiError}
            </p>
            <button
              onClick={() => {
                setApiError(null);
                loadModels(activeFilter, searchQuery);
              }}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : models.length > 0 ? (
          models.map((model) => (
            <EnhancedModelCard
              key={model.id}
              model={model}
              onDownload={onDownload}
              onDownloadWithCustomName={onDownloadWithCustomName}
              onDownloadWithDependencies={onDownloadWithDependencies}
              onAddToQueue={(modelId: string, fileName: string, allFiles?: Array<{ rfilename: string; size?: number }>) => 
                addToDownloadQueue(modelId, model.name, fileName, allFiles)
              }
              downloading={downloading}
              downloadProgress={downloadProgress}
              systemInfo={systemInfo}
            />
          ))
        ) : (
          <div className="glassmorphic rounded-xl p-12 text-center">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No models found matching your criteria
            </h4>
            <p className="text-gray-600 dark:text-gray-400">
              Try adjusting your search terms or filters
            </p>
          </div>
        )}
      </div>

      {/* API Status Footer */}
      <div className="glassmorphic rounded-xl p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Powered by Hugging Face Public API
              </span>
            </div>
            {activeFilter === 'recommended' && getCacheStatus() && !searchQuery.trim() && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                  📄 From cache ({getCacheStatus()!.ageHours}h old)
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {downloadQueue.length > 0 && (
              <button
                onClick={() => setShowDownloadQueue(!showDownloadQueue)}
                className="flex items-center gap-2 px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Download className="w-4 h-4" />
                Queue ({downloadQueue.length})
              </button>
            )}
            <div className="text-gray-500 dark:text-gray-400">
              {models.length} models analyzed
            </div>
          </div>
        </div>
      </div>

      {/* Download Queue Modal */}
      {showDownloadQueue && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glassmorphic rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Download className="w-6 h-6 text-blue-500" />
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Download Queue
                  </h3>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                    {downloadQueue.length} items
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {downloadQueue.some(item => item.status === 'queued') && (
                    <button
                      onClick={processQueue}
                      disabled={isProcessingQueue}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                    >
                      {isProcessingQueue ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      {isProcessingQueue ? 'Processing...' : 'Process Queue'}
                    </button>
                  )}
                  <button
                    onClick={openModelFolder}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Open Folder
                  </button>
                  <button
                    onClick={() => setShowDownloadQueue(false)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 max-h-96 overflow-y-auto">
              {downloadQueue.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No downloads in queue
                </div>
              ) : (
                <div className="space-y-4">
                  {downloadQueue.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        item.status === 'queued' 
                          ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
                          : item.status === 'retrying'
                          ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20'
                          : item.status === 'failed'
                          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                            {item.modelName}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {item.fileName}
                            {item.allFiles && item.allFiles.length > 1 && (
                              <span className="ml-2 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                                + {item.allFiles.length - 1} vision files
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-4 text-xs">
                            <span className={`px-2 py-1 rounded-full font-medium ${
                              item.status === 'queued' 
                                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                : item.status === 'retrying'
                                ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                : item.status === 'failed'
                                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}>
                              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">
                              Added: {item.addedAt.toLocaleTimeString()}
                            </span>
                            {item.retryCount > 0 && (
                              <span className="text-gray-500 dark:text-gray-400">
                                Retries: {item.retryCount}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          {/* Manual Download Link */}
                          <a
                            href={item.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
                            title="Download manually via browser"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Manual
                          </a>
                          
                          {/* Retry Button */}
                          {(item.status === 'queued' || item.status === 'failed') && (
                            <button
                              onClick={() => retryQueuedDownload(item.id)}
                              className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                              title="Retry download"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Retry
                            </button>
                          )}
                          
                          {/* Remove Button */}
                          <button
                            onClick={() => removeFromQueue(item.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-1">📋 Download Options:</p>
                  <ul className="text-xs space-y-1">
                    <li>• <strong>Process Queue:</strong> Retry all queued downloads automatically</li>
                    <li>• <strong>Manual:</strong> Download via browser and place in models folder</li>
                    <li>• <strong>Open Folder:</strong> Access your local models directory</li>
                  </ul>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 dark:text-gray-400 text-xs">
                    Rate limits usually reset in 1-5 minutes
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedModelDiscovery;
