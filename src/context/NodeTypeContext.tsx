import React, { createContext, useContext, useState } from 'react';
import ImageTextLlmNode from './ImageTextLlmNode'; // Import your new node

// Define the context
const NodeTypeContext = createContext(null);

// Define the provider component
export const NodeTypeProvider = ({ children }: any) => {
  const [nodeTypes, setNodeTypes] = useState({
    imageTextLlmNode: ImageTextLlmNode, // Register your new node type
    // Add other node types here
  });

  return (
    <NodeTypeContext.Provider value={{ nodeTypes, setNodeTypes }}>
      {children}
    </NodeTypeContext.Provider>
  );
};

// Custom hook to use the node type context
export const useNodeTypes = () => {
  return useContext(NodeTypeContext);
};
