# Agent UI Builder

The Agent UI Builder allows users to create custom frontend interfaces for their AI agents using a visual drag-and-drop interface.

## Overview

This feature enables users to:
- Create custom UIs for their agents without coding
- Drag and drop UI components to build interfaces
- Bind UI components to agent input/output nodes
- Preview the UI in different device modes (desktop, tablet, mobile)
- Configure component properties through a visual properties panel

## Components

### Core Components

#### UIBuilder.tsx
Main component that provides the full UI building experience with:
- **Component Library**: Sidebar with draggable UI components
- **Canvas**: Main design area where users build their UI
- **Properties Panel**: Configure selected component properties
- **Toolbar**: Mode switching, device preview, save/load functionality

### Component Types

#### Input Components
- **Text Input**: Single-line text input with placeholder support
- **File Upload**: File selection with accept type filtering
- **Dropdown**: Select from predefined options
- **Slider**: Range input with min/max values

#### Output Components
- **Text Display**: Show text results from agent
- **Image Display**: Display generated or processed images
- **JSON Display**: Formatted display of structured data
- **Chart**: Data visualization (future enhancement)

#### Control Components
- **Button**: Action triggers for running agents
- **Container**: Layout containers for organizing components

## Features

### Drag & Drop Interface
- Drag components from the library to the canvas
- Visual feedback during drag operations
- Snap positioning for clean layouts

### Device Preview
- Desktop, tablet, and mobile preview modes
- Responsive design testing
- Device-specific width constraints

### Component Binding
- Link UI components to specific agent nodes
- Input components bind to agent input nodes
- Output components bind to agent output nodes
- Automatic data flow between UI and agent

### Properties Panel
- Visual property editing
- Real-time component updates
- Position and size controls
- Style customization

### Preview Mode
- Interactive UI testing
- Switch between edit and preview modes
- Test user interactions

## Architecture

```
UIBuilder/
├── UIBuilder.tsx           # Main UI builder component
├── types/                  # TypeScript definitions
│   └── ui-builder.ts      # UI component interfaces
└── README.md              # This documentation
```

## Usage Flow

1. **Create Agent**: First create an agent workflow with input/output nodes
2. **Open UI Builder**: Click "Create UI" button in Agent Studio
3. **Design Interface**: Drag components from library to canvas
4. **Configure Components**: Select components to edit properties
5. **Bind to Nodes**: Link UI components to agent nodes
6. **Preview & Test**: Switch to preview mode to test functionality
7. **Save UI**: Save the custom interface

## Future Enhancements

- **Advanced Components**: More specialized UI components
- **Custom Styling**: Advanced theming and styling options
- **Component Templates**: Pre-built UI templates
- **Export Options**: Export UI as standalone web app
- **Real-time Execution**: Live agent execution within the UI
- **Collaboration**: Share and remix UI designs
- **Mobile App Export**: Generate mobile apps from UI designs

## Technical Notes

- Built with React and TypeScript
- Uses absolute positioning for flexible layouts
- Integrates with existing Agent Builder context
- Extensible component system for adding new UI elements
- Responsive design with device preview modes 
