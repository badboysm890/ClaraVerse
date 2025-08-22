// Model selection logic utilities for Assistant

export interface ModelConfig {
  visionModel: string;
  toolModel: string;
  ragModel: string;
}

export interface ModelSelectionConfig extends ModelConfig {
  mode: 'auto' | 'manual' | 'smart';
}

export interface OllamaModelConfig extends ModelSelectionConfig {
  type: 'ollama';
}

export interface OpenAIModelConfig extends ModelSelectionConfig {
  type: 'openai';
}

export type ApiModelConfig = OllamaModelConfig | OpenAIModelConfig;

export const checkModelImageSupport = (modelName: string): boolean => {
  const configs = localStorage.getItem('model_image_support');
  if (!configs) return false;
  const modelConfigs = JSON.parse(configs);
  const config = modelConfigs.find((c: any) => c.name === modelName);
  return config?.supportsImages || false;
};

export const findImageSupportedModel = (): string | null => {
  const configs = localStorage.getItem('model_image_support');
  if (!configs) return null;
  const modelConfigs = JSON.parse(configs);
  const imageModel = modelConfigs.find((c: any) => c.supportsImages);
  return imageModel ? imageModel.name : null;
};

export const getAppropriateModel = (
  modelSelectionConfig: ModelSelectionConfig,
  selectedModel: string,
  context: { hasImages: boolean; hasTool: boolean; hasRag: boolean; }
): string => {
  const { hasImages, hasTool, hasRag } = context;
  switch (modelSelectionConfig.mode) {
    case 'auto':
      if (hasImages && modelSelectionConfig.visionModel) {
        if (checkModelImageSupport(modelSelectionConfig.visionModel)) {
          return modelSelectionConfig.visionModel;
        } else {
          const imageModel = findImageSupportedModel();
          if (imageModel) return imageModel;
        }
      }
      if (hasTool && modelSelectionConfig.toolModel) {
        return modelSelectionConfig.toolModel;
      }
      if (hasRag && modelSelectionConfig.ragModel) {
        return modelSelectionConfig.ragModel;
      }
      return (
        modelSelectionConfig.ragModel ||
        modelSelectionConfig.toolModel ||
        modelSelectionConfig.visionModel ||
        selectedModel
      );
    case 'smart':
      return selectedModel;
    case 'manual':
    default:
      return selectedModel;
  }
}; 
