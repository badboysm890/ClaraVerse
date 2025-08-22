import React, { useState } from 'react';

/**
 * Demo component to showcase enhanced error handling
 * This demonstrates the difference between old and new error messages
 */
const ErrorHandlingDemo: React.FC = () => {
  const [showDemo, setShowDemo] = useState(false);

  // Simulate different types of errors with their enhanced messages
  const errorExamples = [
    {
      title: "Authentication Error",
      oldMessage: "I apologize, but I encountered an error while processing your request.  (If you are using angela core - probably the model is not loaded properly. head to settings and run the balanced settings)",
      newMessage: `**Authentication Error**

There was an issue with the API authentication. Please check your API key configuration.

**Technical Details:**
\`\`\`
Request failed: 401 Unauthorized
API key is invalid or expired

Server Response:
{
  "error": {
    "message": "Invalid API key provided",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
\`\`\`

You can:
• Try again with a different message
• Switch to a different model in Advanced Options
• Check the service status in Settings
• Start a new chat if the conversation is too long`
    },
    {
      title: "Rate Limit Error",
      oldMessage: "I apologize, but I encountered an error while processing your request.  (If you are using angela core - probably the model is not loaded properly. head to settings and run the balanced settings)",
      newMessage: `**Rate Limit Exceeded**

Too many requests have been made. Please wait a moment before trying again.

**Technical Details:**
\`\`\`
Request failed: 429 Too Many Requests
You have exceeded the rate limit. Please try again later.

Server Response:
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}
\`\`\`

You can:
• Try again with a different message
• Switch to a different model in Advanced Options
• Check the service status in Settings
• Start a new chat if the conversation is too long`
    },
    {
      title: "Context Length Error",
      oldMessage: "I apologize, but I encountered an error while processing your request.  (If you are using angela core - probably the model is not loaded properly. head to settings and run the balanced settings)",
      newMessage: `**Context Length Exceeded**

The conversation has become too long for the current model. Please start a new chat or try a model with a larger context window.

**Technical Details:**
\`\`\`
Request failed: 400 Bad Request
This model's maximum context length is 128000 tokens. However, you requested 130755 tokens (122755 in the messages, 8000 in the completion).

Server Response:
{
  "error": {
    "message": "maximum context length exceeded",
    "type": "invalid_request_error",
    "code": "context_length_exceeded"
  }
}
\`\`\`

You can:
• Try again with a different message
• Switch to a different model in Advanced Options
• Check the service status in Settings
• Start a new chat if the conversation is too long`
    },
    {
      title: "Connection Error",
      oldMessage: "I apologize, but I encountered an error while processing your request.  (If you are using angela core - probably the model is not loaded properly. head to settings and run the balanced settings)",
      newMessage: `**Connection Error**

Unable to connect to the AI service. Please check your internet connection and service configuration.

**Technical Details:**
\`\`\`
TypeError: Failed to fetch
Network request failed - could not connect to server

Server Response:
ECONNREFUSED: Connection refused
\`\`\`

You can:
• Try again with a different message
• Switch to a different model in Advanced Options
• Check the service status in Settings
• Start a new chat if the conversation is too long`
    }
  ];

  if (!showDemo) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">🔧 Enhanced Error Handling Demo</h3>
        <p className="text-blue-700 mb-3">
          angela now shows detailed server error responses instead of generic error messages.
        </p>
        <button
          onClick={() => setShowDemo(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Show Error Handling Comparison
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">Enhanced Error Handling Comparison</h3>
        <button
          onClick={() => setShowDemo(false)}
          className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
      </div>
      
      <div className="space-y-6">
        {errorExamples.map((example, index) => (
          <div key={index} className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
              <h4 className="font-semibold text-gray-800">{example.title}</h4>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Old Error Message */}
              <div className="p-4 border-r border-gray-300">
                <div className="flex items-center mb-2">
                  <span className="text-red-600 font-medium">❌ Before (Generic)</span>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-700">{example.oldMessage}</p>
                </div>
              </div>
              
              {/* New Error Message */}
              <div className="p-4">
                <div className="flex items-center mb-2">
                  <span className="text-green-600 font-medium">✅ After (Detailed)</span>
                </div>
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <div className="text-sm text-green-800">
                    <div className="prose prose-sm max-w-none">
                      {example.newMessage.split('\n').map((line, i) => {
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <div key={i} className="font-bold mt-2 mb-1">{line.slice(2, -2)}</div>;
                        } else if (line.startsWith('```')) {
                          return <div key={i} className="font-mono text-xs bg-gray-200 p-2 rounded mt-1">{line}</div>;
                        } else if (line.startsWith('•')) {
                          return <div key={i} className="ml-4">{line}</div>;
                        } else if (line.trim()) {
                          return <div key={i} className="mb-1">{line}</div>;
                        } else {
                          return <div key={i} className="h-2"></div>;
                        }
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">✨ Key Improvements:</h4>
        <ul className="text-blue-700 text-sm space-y-1">
          <li>• <strong>Specific error categories:</strong> Authentication, Rate Limits, Context Length, Connection, etc.</li>
          <li>• <strong>Technical details:</strong> HTTP status codes, server responses, error codes</li>
          <li>• <strong>Actionable solutions:</strong> Clear next steps for users</li>
          <li>• <strong>Enhanced notifications:</strong> More detailed error notifications with longer display time</li>
          <li>• <strong>Better debugging:</strong> Full server error data available in message metadata</li>
        </ul>
      </div>
    </div>
  );
};

export default ErrorHandlingDemo;
