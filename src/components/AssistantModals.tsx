import React from 'react';
import AssistantSettings from './assistant_components/AssistantSettings';
import ModelPullModal from './assistant_components/ModelPullModal';
import KnowledgeBaseModal from './assistant_components/KnowledgeBaseModal';
import { ToolModal } from './assistant_components/ToolModal';
import ModelConfigModal from './assistant_components/ModelConfigModal';
import OnboardingModal from './assistant_components/OnboardingModal';

// Types for model config
interface ModelConfig {
  visionModel: string;
  toolModel: string;
  ragModel: string;
  mode: string;
}

interface AssistantModalsProps {
  showSettings: boolean;
  setShowSettings: (open: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (value: boolean) => void;
  showPullModal: boolean;
  setShowPullModal: (open: boolean) => void;
  handlePullModel?: (modelName: string) => AsyncGenerator<any, void, unknown>;
  showKnowledgeBase: boolean;
  setShowKnowledgeBase: (open: boolean) => void;
  showToolModal: boolean;
  setShowToolModal: (open: boolean) => void;
  client: any;
  selectedModel: string;
  models: any[];
  showModelConfig: boolean;
  setShowModelConfig: (open: boolean) => void;
  handleModelConfigSave: (config: any) => void;
  modelSelectionConfig: ModelConfig;
  showOnboarding: boolean;
  setShowOnboarding: (open: boolean) => void;
}

const AssistantModals: React.FC<AssistantModalsProps> = ({
  showSettings,
  setShowSettings,
  isStreaming,
  setIsStreaming,
  showPullModal,
  setShowPullModal,
  handlePullModel,
  showKnowledgeBase,
  setShowKnowledgeBase,
  showToolModal,
  setShowToolModal,
  client,
  selectedModel,
  models,
  showModelConfig,
  setShowModelConfig,
  handleModelConfigSave,
  modelSelectionConfig,
  showOnboarding,
  setShowOnboarding,
}) => (
  <>
    <AssistantSettings
      isOpen={showSettings}
      onClose={() => setShowSettings(false)}
      isStreaming={isStreaming}
      setIsStreaming={setIsStreaming}
      onOpenTools={() => setShowToolModal(true)}
    />
    {handlePullModel && (
      <ModelPullModal
        isOpen={showPullModal}
        onClose={() => setShowPullModal(false)}
        onPullModel={handlePullModel}
      />
    )}
    <KnowledgeBaseModal
      isOpen={showKnowledgeBase}
      onClose={() => setShowKnowledgeBase(false)}
    />
    <ToolModal
      isOpen={showToolModal}
      onClose={() => setShowToolModal(false)}
      client={client}
      model={selectedModel}
    />
    <ModelConfigModal
      isOpen={showModelConfig}
      onClose={() => setShowModelConfig(false)}
      models={models}
      onSave={(config) => {
        handleModelConfigSave({
          ...config,
          mode: modelSelectionConfig.mode,
        });
        setShowModelConfig(false);
      }}
      currentConfig={{
        visionModel: modelSelectionConfig.visionModel,
        toolModel: modelSelectionConfig.toolModel,
        ragModel: modelSelectionConfig.ragModel,
      }}
    />
    <OnboardingModal
      isOpen={showOnboarding}
      onClose={() => setShowOnboarding(false)}
      models={models}
      onModelConfigSave={handleModelConfigSave}
    />
  </>
);

export default AssistantModals; 