// Import all node executors here to ensure they're registered

import './TextInputExecutor';
import './TextOutputExecutor';
import './MarkdownOutputExecutor';
import './StaticTextExecutor';
import './ApiCallExecutor';
import './ImageTextLlmExecutor';
import './GetClipboardTextExecutor';
import './ConcatTextExecutor';
import './WebcamInputExecutor';
import './LlmPromptExecutor';
import './ImageInputExecutor';
import './structuredLlmExecutor';


// This file is imported by main.tsx to ensure all executors are registered
// before the application starts running
