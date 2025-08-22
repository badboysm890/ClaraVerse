import React, { memo, useState } from 'react';
import { NodeProps } from 'reactflow';
import { Globe, Settings, Lock, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import BaseNode from './BaseNode';

const APIRequestNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [method, setMethod] = useState(data.method || 'GET');
  const [timeout, setTimeout] = useState(data.timeout || 30000);
  const [retries, setRetries] = useState(data.retries || 3);
  const [retryDelay, setRetryDelay] = useState(data.retryDelay || 1000);
  const [authType, setAuthType] = useState(data.authType || 'none');
  const [contentType, setContentType] = useState(data.contentType || 'application/json');
  const [responseType, setResponseType] = useState(data.responseType || 'auto');
  const [followRedirects, setFollowRedirects] = useState(data.followRedirects !== false);
  const [validateStatus, setValidateStatus] = useState(data.validateStatus !== false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateData = (updates: any) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, ...updates } });
    }
  };

  const handleMethodChange = (value: string) => {
    setMethod(value);
    updateData({ method: value });
  };

  const handleTimeoutChange = (value: number) => {
    setTimeout(value);
    updateData({ timeout: value });
  };

  const handleRetriesChange = (value: number) => {
    setRetries(value);
    updateData({ retries: value });
  };

  const handleRetryDelayChange = (value: number) => {
    setRetryDelay(value);
    updateData({ retryDelay: value });
  };

  const handleAuthTypeChange = (value: string) => {
    setAuthType(value);
    updateData({ authType: value });
  };

  const handleContentTypeChange = (value: string) => {
    setContentType(value);
    updateData({ contentType: value });
  };

  const handleResponseTypeChange = (value: string) => {
    setResponseType(value);
    updateData({ responseType: value });
  };

  const handleFollowRedirectsChange = (value: boolean) => {
    setFollowRedirects(value);
    updateData({ followRedirects: value });
  };

  const handleValidateStatusChange = (value: boolean) => {
    setValidateStatus(value);
    updateData({ validateStatus: value });
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-green-500';
      case 'POST': return 'bg-blue-500';
      case 'PUT': return 'bg-yellow-500';
      case 'PATCH': return 'bg-orange-500';
      case 'DELETE': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <BaseNode
      {...props}
      title="API Request"
      category="data"
      icon={<Globe className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        {/* HTTP Method */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            HTTP Method
          </label>
          <select
            value={method}
            onChange={(e) => handleMethodChange(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>
          <div className="flex items-center gap-1 mt-1">
            <div className={`w-2 h-2 rounded-full ${getMethodColor(method)}`}></div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{method} Request</span>
          </div>
        </div>

        {/* Authentication Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Authentication
          </label>
          <select
            value={authType}
            onChange={(e) => handleAuthTypeChange(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="none">None</option>
            <option value="apiKey">API Key</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
            <option value="custom">Custom Header</option>
          </select>
        </div>

        {/* Request Body Settings */}
        {['POST', 'PUT', 'PATCH'].includes(method) && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Content Type
            </label>
            <select
              value={contentType}
              onChange={(e) => handleContentTypeChange(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="application/json">JSON</option>
              <option value="application/x-www-form-urlencoded">Form Data</option>
              <option value="multipart/form-data">Multipart</option>
              <option value="text/plain">Plain Text</option>
              <option value="application/xml">XML</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        )}

        {/* Response Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Response Type
          </label>
          <select
            value={responseType}
            onChange={(e) => handleResponseTypeChange(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="auto">Auto Detect</option>
            <option value="json">JSON</option>
            <option value="text">Text</option>
            <option value="binary">Binary</option>
          </select>
        </div>

        {/* Advanced Settings Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
        >
          <span className="flex items-center gap-1">
            <Settings className="w-3 h-3" />
            Advanced Settings
          </span>
          <RefreshCw className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="space-y-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border">
            {/* Timeout */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Timeout (ms)
              </label>
              <input
                type="number"
                min="1000"
                max="300000"
                step="1000"
                value={timeout}
                onChange={(e) => handleTimeoutChange(parseInt(e.target.value) || 30000)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Retries */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Max Retries
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={retries}
                onChange={(e) => handleRetriesChange(parseInt(e.target.value) || 3)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Retry Delay */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Retry Delay (ms)
              </label>
              <input
                type="number"
                min="100"
                max="10000"
                step="100"
                value={retryDelay}
                onChange={(e) => handleRetryDelayChange(parseInt(e.target.value) || 1000)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Options */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="followRedirects"
                  checked={followRedirects}
                  onChange={(e) => handleFollowRedirectsChange(e.target.checked)}
                  className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="followRedirects" className="text-xs text-gray-600 dark:text-gray-400">
                  Follow redirects
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="validateStatus"
                  checked={validateStatus}
                  onChange={(e) => handleValidateStatusChange(e.target.checked)}
                  className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="validateStatus" className="text-xs text-gray-600 dark:text-gray-400">
                  Validate status codes
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Feature Information */}
        <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
          <div className="flex items-start gap-2">
            <Globe className="w-3 h-3 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">
                Production API Client
              </h4>
              <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
                Enterprise-grade HTTP client with authentication, retries, timeout handling, and comprehensive error management.
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-xs px-1 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                  Auto-retry
                </span>
                <span className="text-xs px-1 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                  Auth support
                </span>
                <span className="text-xs px-1 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                  Response parsing
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Input/Output Display */}
        <div className="space-y-2">
          {/* Inputs */}
          {data.inputs && data.inputs.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                Inputs
              </h5>
              {data.inputs.map((input: any, index: number) => (
                <div
                  key={input.id}
                  className="text-xs text-gray-600 dark:text-gray-400 mb-1"
                  style={{ marginTop: index === 0 ? 0 : '4px' }}
                >
                  <span className="font-medium">{input.name}</span>
                  {input.required && <span className="text-red-500 ml-1">*</span>}
                  <span className="text-gray-400 ml-1">({input.dataType})</span>
                </div>
              ))}
            </div>
          )}

          {/* Outputs */}
          {data.outputs && data.outputs.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
              <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                Outputs
              </h5>
              {data.outputs.map((output: any, index: number) => (
                <div
                  key={output.id}
                  className="text-xs text-gray-600 dark:text-gray-400 mb-1 text-right"
                  style={{ marginTop: index === 0 ? 0 : '4px' }}
                >
                  <span className="font-medium">{output.name}</span>
                  <span className="text-gray-400 ml-1">({output.dataType})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
});

APIRequestNode.displayName = 'APIRequestNode';

export default APIRequestNode; 
