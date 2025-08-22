import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Download, Package, Upload } from 'lucide-react';

const AgentBuilderToolbar: React.FC = () => {
  const [showWorkflowTemplates, setShowWorkflowTemplates] = useState(false);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const exportFlow = (format: string) => {
    // Implementation of exportFlow function
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowWorkflowTemplates(true)}
        className="bg-white/10 text-white hover:bg-white/20"
      >
        <Plus className="w-4 h-4 mr-1" />
        Templates
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => exportFlow('angela-native')}
        className="bg-white/10 text-white hover:bg-white/20"
        disabled={!currentFlow}
      >
        <Download className="w-4 h-4 mr-1" />
        Export
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => exportFlow('angela-sdk')}
        className="bg-blue-500/20 text-blue-100 hover:bg-blue-500/30"
        disabled={!currentFlow}
        title="Export for SDK - includes custom node code"
      >
        <Package className="w-4 h-4 mr-1" />
        SDK Export
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowImportDialog(true)}
        className="bg-white/10 text-white hover:bg-white/20"
      >
        <Upload className="w-4 h-4 mr-1" />
        Import
      </Button>
    </div>
  );
};

export default AgentBuilderToolbar; 
