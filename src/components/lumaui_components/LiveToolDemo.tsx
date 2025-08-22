import React, { useState } from 'react';
import LiveToolExecution from './LiveToolExecution';
import { Play, RotateCcw } from 'lucide-react';

interface ToolExecution {
  id: string;
  toolName: string;
  parameters: any;
  status: 'starting' | 'executing' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  result?: string;
  error?: string;
}

const LiveToolDemo: React.FC = () => {
  const [currentExecution, setCurrentExecution] = useState<ToolExecution | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const demoTools = [
    {
      name: 'create_file',
      params: { path: 'components/Button.tsx', content: 'export const Button = ...' },
      description: 'Creating React component'
    },
    {
      name: 'edit_file',
      params: { path: 'styles.css', content: '.btn { color: blue; }' },
      description: 'Updating styles'
    },
    {
      name: 'read_file',
      params: { path: 'package.json' },
      description: 'Reading configuration'
    },
    {
      name: 'run_command',
      params: { command: 'npm install', args: ['react'] },
      description: 'Installing packages'
    },
    {
      name: 'install_package',
      params: { package: 'axios', dev: false },
      description: 'Adding dependency'
    }
  ];

  const runDemo = async (toolIndex: number) => {
    const tool = demoTools[toolIndex];
    
    const execution: ToolExecution = {
      id: Date.now().toString(),
      toolName: tool.name,
      parameters: tool.params,
      status: 'starting',
      startTime: new Date()
    };

    setCurrentExecution(execution);
    setIsVisible(true);

    // Starting phase
    await new Promise(resolve => setTimeout(resolve, 500));

    // Executing phase
    execution.status = 'executing';
    setCurrentExecution({...execution});
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Completion phase (random success/error for demo)
    const isSuccess = Math.random() > 0.2; // 80% success rate
    
    if (isSuccess) {
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.result = `✅ ${tool.description} completed successfully`;
    } else {
      execution.status = 'error';
      execution.endTime = new Date();
      execution.error = 'Demo error for testing';
    }

    setCurrentExecution({...execution});
  };

  const reset = () => {
    setIsVisible(false);
    setCurrentExecution(null);
  };

  return (
    <div className="p-6 glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
          🎭 Live Tool Execution Demo
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          See how angela shows live feedback during tool execution with beautiful GSAP animations
        </p>
      </div>

      {/* Demo Controls */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {demoTools.map((tool, index) => (
          <button
            key={tool.name}
            onClick={() => runDemo(index)}
            disabled={isVisible}
            className="p-3 bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-lg hover:from-sakura-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none text-sm font-medium"
          >
            <Play className="w-4 h-4 inline mr-2" />
            {tool.name.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={reset}
          disabled={!isVisible}
          className="px-4 py-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Live Execution Display */}
      <div className="min-h-[120px] border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm mb-4">
          Live Tool Execution Preview
        </div>
        
        <LiveToolExecution
          currentExecution={currentExecution}
          isVisible={isVisible}
          onComplete={() => {
            // Keep visible for demo purposes
            console.log('Demo execution completed');
          }}
        />
        
        {!isVisible && (
          <div className="text-center text-gray-400 dark:text-gray-500 text-sm italic">
            Click a tool button above to see the live animation
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        <strong>Features:</strong> Real-time status updates • GSAP animations • Typewriter effects • Progress indicators • Success/error states
      </div>
    </div>
  );
};

export default LiveToolDemo; 
