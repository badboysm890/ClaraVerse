import {useState, useEffect} from 'react';
import {
    User,
    Mail,
    Globe,
    Check,
    Loader,
    Shield,
    Brain,
    Terminal,
    Zap,
    Bot,
    Database,
    Sunrise,
    Sun,
    Moon,
    Palette,
    Download,
    Server,
    HardDrive,
    Plus,
    Router,
    Edit3,
    X,
    ExternalLink,
} from 'lucide-react';
import {db, Provider} from '../db';
import { useProviders } from '../contexts/ProvidersContext';
import logoImage from '../assets/logo.png';

interface OnboardingProps {
    onComplete: () => void;
}

const Onboarding = ({onComplete}: OnboardingProps) => {
    const [section, setSection] = useState<'welcome' | 'setup'>('welcome');
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        theme_preference: 'dark' as 'light' | 'dark' | 'system', // Default to dark mode
        avatar_url: '',
        angela_core_url: 'http://localhost:8091',
        comfyui_url: 'http://localhost:8188',
        model_folder_path: '',
        openai_api_key: '',
        openai_base_url: 'https://api.openai.com/v1',
        api_type: 'angela_core' as 'angela_core' | 'openai'
    });
    const [loading, setLoading] = useState(false);
    const [angelaStatus, setangelaStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [animationClass, setAnimationClass] = useState('animate-fadeIn');
    const [logoError, setLogoError] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [checkingModels, setCheckingModels] = useState(false);
    const [downloadingModel, setDownloadingModel] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    
    // Provider management state
    const [providers, setProviders] = useState<Provider[]>([]);
    const [showAddProviderModal, setShowAddProviderModal] = useState(false);
    const [setupMethod, setSetupMethod] = useState<'angela-core' | 'external-provider'>('angela-core');
    const [newProviderForm, setNewProviderForm] = useState({
        name: '',
        type: 'openai' as Provider['type'],
        baseUrl: '',
        apiKey: '',
        isEnabled: true
    });
    const [addingProvider, setAddingProvider] = useState(false);
    const [providerError, setProviderError] = useState<string | null>(null);
    const [selectedServices, setSelectedServices] = useState({
        comfyui: false,
        tts: false,
        n8n: false
    });
    const [serviceModes, setServiceModes] = useState<{[key: string]: 'docker' | 'manual'}>({
        comfyui: 'docker',
        tts: 'docker', // Always docker for angela's service
        n8n: 'docker'
    });
    const [serviceUrls, setServiceUrls] = useState({
        comfyui: 'http://localhost:8188',
        tts: 'http://localhost:8765',
        n8n: 'http://localhost:5678'
    });
    const [serviceStatuses, setServiceStatuses] = useState<{[key: string]: 'checking' | 'available' | 'unavailable' | 'starting' | 'pulling'}>({});
    const [serviceStartupProgress, setServiceStartupProgress] = useState<{[key: string]: string}>({});
    const [_featureConfig, setFeatureConfig] = useState({
        comfyUI: true,
        n8n: true,
        ragAndTts: true,
        angelaCore: true
    });
    
    // Custom model path management - reuse from CustomModelPathManager logic
    const { setCustomModelPath } = useProviders();
    const [isSettingCustomPath, setIsSettingCustomPath] = useState(false);
    const [folderPickerMessage, setFolderPickerMessage] = useState<string | null>(null);

    // Use angelaStatus to avoid lint warning
    console.log('angela status:', angelaStatus);

    // Apply theme immediately when selected
    useEffect(() => {
        const htmlElement = document.documentElement;
        if (formData.theme_preference === 'dark') {
            htmlElement.classList.add('dark');
        } else {
            htmlElement.classList.remove('dark');
        }
    }, [formData.theme_preference]);

    // Auto-check angela Core status when reaching step 4
    useEffect(() => {
        if (step === 4) {
            checkangelaCore();
        }
    }, [step]);

    // Load providers when reaching step 5
    useEffect(() => {
        if (step === 5) {
            loadProviders();
        }
    }, [step]);

    // Clean up any active downloads when component unmounts
    useEffect(() => {
        return () => {
            if (downloadingModel && window.modelManager?.stopDownload) {
                // Don't await this as it's cleanup
                window.modelManager.stopDownload('qwen2.5-0.5b-instruct-q4_k_m.gguf').catch(console.error);
            }
        };
    }, []);

    // Listen for background service status updates
    useEffect(() => {
        const handleServiceStatusUpdate = (event: any) => {
            const { serviceName, status, error, progress } = event.detail || {};
            
            if (serviceName && status) {
                // Update service status
                if (status === 'running') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'available'}));
                    setServiceStartupProgress(prev => ({...prev, [serviceName]: ''}));
                } else if (status === 'starting') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'starting'}));
                    if (progress) {
                        setServiceStartupProgress(prev => ({...prev, [serviceName]: progress}));
                    }
                } else if (status === 'error') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'unavailable'}));
                    setServiceStartupProgress(prev => ({...prev, [serviceName]: error || 'Service failed to start'}));
                } else if (status === 'stopped') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'unavailable'}));
                    setServiceStartupProgress(prev => ({...prev, [serviceName]: ''}));
                }
            }
        };

        // Listen for background service status events
        window.addEventListener('background-service-status', handleServiceStatusUpdate);
        
        return () => {
            window.removeEventListener('background-service-status', handleServiceStatusUpdate);
        };
    }, []);

    // Handler for folder picker (similar to CustomModelPathManager)
    const handlePickCustomModelPath = async () => {
        if (window.electron && window.electron.dialog) {
            try {
                const result = await window.electron.dialog.showOpenDialog({
                    properties: ['openDirectory']
                });
                
                if (result && result.filePaths && result.filePaths[0]) {
                    const selectedPath = result.filePaths[0];
                    
                    // Show loading state
                    setIsSettingCustomPath(true);
                    setFolderPickerMessage(null); // Clear previous message
                    
                    // First, scan for models in the selected path
                    if (window.llamaSwap?.scanCustomPathModels) {
                        const scanResult = await window.llamaSwap.scanCustomPathModels(selectedPath);
                        
                        if (scanResult.success && scanResult.models && scanResult.models.length > 0) {
                            // Models found, set the path and update form data
                            await setCustomModelPath(selectedPath);
                            setFormData(prev => ({...prev, model_folder_path: selectedPath}));
                            
                            // Update available models list
                            const modelNames = scanResult.models.map((m: any) => m.file);
                            setAvailableModels(modelNames);
                            
                            // Create detailed success message with folder information
                            const folderGroups = scanResult.models.reduce((acc: any, model: any) => {
                                const folder = model.folderHint || 'root';
                                acc[folder] = (acc[folder] || 0) + 1;
                                return acc;
                            }, {});
                            
                            const folderInfo = Object.entries(folderGroups)
                                .map(([folder, count]) => folder === 'root' ? `${count} in root` : `${count} in ${folder}`)
                                .join(', ');
                            
                            const message = scanResult.models.length === 1 
                                ? `✅ Found 1 GGUF model` 
                                : `✅ Found ${scanResult.models.length} GGUF models${folderGroups && Object.keys(folderGroups).length > 1 ? ` (${folderInfo})` : ''}`;
                            
                            setFolderPickerMessage(message);
                        } else if (scanResult.success && (!scanResult.models || scanResult.models.length === 0)) {
                            // No models found, but still set the path
                            await setCustomModelPath(selectedPath);
                            setFormData(prev => ({...prev, model_folder_path: selectedPath}));
                            setFolderPickerMessage('⚠️ No GGUF models found in this folder');
                        } else {
                            // Scan failed, show error
                            console.error('Error scanning folder for models:', scanResult.error || 'Unknown error');
                            setFolderPickerMessage('❌ Error scanning folder for models');
                        }
                    } else {
                        // Fallback: just set the path without scanning
                        await setCustomModelPath(selectedPath);
                        setFormData(prev => ({...prev, model_folder_path: selectedPath}));
                        setFolderPickerMessage('📁 Folder selected (scanning not available)');
                    }
                }
            } catch (error) {
                console.error('Error setting custom model path:', error);
            } finally {
                setIsSettingCustomPath(false);
            }
        } else {
            // Web browser - show message that desktop app is required
            alert('Folder picker is only available in the desktop app. You can manually enter the path.');
        }
    };

    const checkangelaCore = async () => {
        setangelaStatus('success'); // angela Core is always available
        setCheckingModels(true);
        setDownloadError(null);
        
        try {
            // Check for existing models using the same API as ModelManager
            if (window.modelManager?.getLocalModels) {
                const result = await window.modelManager.getLocalModels();
                if (result.success && result.models) {
                    const modelNames = result.models.map((model: any) => model.file || model.name);
                    setAvailableModels(modelNames);
                } else {
                    setAvailableModels([]);
                }
            } else {
                // Fallback if modelManager not available
                setAvailableModels([]);
            }
        } catch (error) {
            console.error('Error checking existing models:', error);
            setAvailableModels([]);
        } finally {
            setCheckingModels(false);
        }
    };

    // const checkOllamaModels = async (url: string) => {
    //     setCheckingModels(true);
    //     try {
    //         const client = new OllamaClient(url);
    //         const models = await client.listModels();
    //         setAvailableModels(models.map(model => model.name));
    //     } catch (error) {
    //         console.error('Error checking Ollama models:', error);
    //         setAvailableModels([]);
    //     } finally {
    //         setCheckingModels(false);
    //     }
    // };

    const handleModelDownload = async () => {
        if (!window.modelManager?.downloadModel) {
            setDownloadError('Model download not available - please ensure the desktop app is running');
            return;
        }

        setDownloadingModel(true);
        setDownloadProgress(0);
        setDownloadError(null);

        try {
            // Download the recommended Qwen 0.6B model
            // Using a popular small model that's good for onboarding
            const modelId = 'Qwen/Qwen3-0.6B-GGUF';
            const fileName = 'Qwen3-0.6B-Q8_0.gguf';
            
            // Set up progress listener
            let progressUnsubscribe: (() => void) | null = null;
            if (window.modelManager.onDownloadProgress) {
                progressUnsubscribe = window.modelManager.onDownloadProgress((progress: any) => {
                    if (progress.fileName === fileName) {
                        setDownloadProgress(progress.progress || 0);
                    }
                });
            }

            const result = await window.modelManager.downloadModel(modelId, fileName);
            
            if (progressUnsubscribe) {
                progressUnsubscribe();
            }

            if (result.success) {
                setDownloadProgress(100);
                // Refresh available models
                await checkModelsAfterDownload();
            } else {
                setDownloadError(result.error || 'Download failed');
                setDownloadProgress(0);
            }
        } catch (error: any) {
            console.error('Model download error:', error);
            setDownloadError(error.message || 'Download failed');
            setDownloadProgress(0);
        } finally {
            setDownloadingModel(false);
        }
    };

    const checkModelsAfterDownload = async () => {
        // Brief delay to ensure file system has updated
        setTimeout(async () => {
            try {
                if (window.modelManager?.getLocalModels) {
                    const result = await window.modelManager.getLocalModels();
                    if (result.success && result.models) {
                        const modelNames = result.models.map((model: any) => model.file || model.name);
                        setAvailableModels(modelNames);
                    }
                }
            } catch (error) {
                console.error('Error refreshing models after download:', error);
            }
        }, 2000);
    };

    const checkRealServiceAvailability = async () => {
        try {
            // First check Docker services using the existing IPC handler
            if (window.electronAPI?.invoke) {
                const dockerStatus = await window.electronAPI.invoke('check-docker-services');
                
                console.log('Docker service status:', dockerStatus);
                
                // Update service statuses based on Docker data
                const newStatuses: {[key: string]: 'checking' | 'available' | 'unavailable' | 'starting' | 'pulling'} = {};
                
                // Set ComfyUI status
                newStatuses.comfyui = dockerStatus.comfyuiAvailable ? 'available' : 'unavailable';
                
                // Set TTS (Python backend) status
                newStatuses.tts = dockerStatus.pythonAvailable ? 'available' : 'unavailable';
                
                // Set N8N status
                newStatuses.n8n = dockerStatus.n8nAvailable ? 'available' : 'unavailable';
                
                setServiceStatuses(newStatuses);
                
                // If Docker is not available, offer to start it
                if (!dockerStatus.dockerAvailable && dockerStatus.message === 'Docker is not running') {
                    setServiceStartupProgress(prev => ({
                        ...prev,
                        comfyui: 'Docker Desktop is installed but not running',
                        tts: 'Docker Desktop is installed but not running',
                        n8n: 'Docker Desktop is installed but not running'
                    }));
                } else if (!dockerStatus.dockerAvailable) {
                    setServiceStartupProgress(prev => ({
                        ...prev,
                        comfyui: dockerStatus.message || 'Docker not available',
                        tts: dockerStatus.message || 'Docker not available',
                        n8n: dockerStatus.message || 'Docker not available'
                    }));
                }
                
                // Also get enhanced status for additional service info
                const enhancedStatus = await window.electronAPI.invoke('service-config:get-enhanced-status');
                
                if (enhancedStatus) {
                    // Update service URLs and modes from enhanced status
                    if (enhancedStatus.comfyui?.serviceUrl) {
                        setServiceUrls(prev => ({...prev, comfyui: enhancedStatus.comfyui.serviceUrl}));
                    }
                    if (enhancedStatus.comfyui?.deploymentMode) {
                        setServiceModes(prev => ({...prev, comfyui: enhancedStatus.comfyui.deploymentMode}));
                    }
                    if (enhancedStatus.n8n?.serviceUrl) {
                        setServiceUrls(prev => ({...prev, n8n: enhancedStatus.n8n.serviceUrl}));
                    }
                    if (enhancedStatus.n8n?.deploymentMode) {
                        setServiceModes(prev => ({...prev, n8n: enhancedStatus.n8n.deploymentMode}));
                    }
                }
            }
        } catch (error) {
            console.error('Error checking real service availability:', error);
            // Set all to unavailable on error
            setServiceStatuses({
                comfyui: 'unavailable',
                tts: 'unavailable',
                n8n: 'unavailable'
            });
        }
    };

    const startDockerDesktop = async () => {
        try {
            if (window.electronAPI?.invoke) {
                // Use docker-detect-installations to check if Docker is available first
                try {
                    const installations = await window.electronAPI.invoke('docker-detect-installations');
                    if (!installations || installations.length === 0) {
                        setServiceStartupProgress(prev => ({
                            ...prev,
                            comfyui: 'Docker Desktop not found on system',
                            tts: 'Docker Desktop not found on system',
                            n8n: 'Docker Desktop not found on system'
                        }));
                        return;
                    }
                } catch (detectionError) {
                    console.log('Docker detection failed, trying alternative approach');
                }
                
                // For now, let's use the existing service startup approach
                // This will attempt to start the Docker containers, which will trigger Docker Desktop startup
                setServiceStartupProgress(prev => ({
                    ...prev,
                    comfyui: 'Starting Docker Desktop...',
                    tts: 'Starting Docker Desktop...',
                    n8n: 'Starting Docker Desktop...'
                }));
                
                // Try to start a Docker service to trigger Docker Desktop startup
                try {
                    const result = await window.electronAPI.invoke('start-docker-service', 'comfyui');
                    if (result.success) {
                        setServiceStartupProgress(prev => ({
                            ...prev,
                            comfyui: 'Docker Desktop started successfully',
                            tts: 'Docker Desktop started successfully',
                            n8n: 'Docker Desktop started successfully'
                        }));
                        
                        // Wait a bit and then recheck services
                        setTimeout(() => {
                            checkRealServiceAvailability();
                        }, 5000);
                    } else {
                        setServiceStartupProgress(prev => ({
                            ...prev,
                            comfyui: result.error || 'Failed to start Docker Desktop',
                            tts: result.error || 'Failed to start Docker Desktop',
                            n8n: result.error || 'Failed to start Docker Desktop'
                        }));
                    }
                } catch (serviceError) {
                    setServiceStartupProgress(prev => ({
                        ...prev,
                        comfyui: 'Please start Docker Desktop manually',
                        tts: 'Please start Docker Desktop manually',
                        n8n: 'Please start Docker Desktop manually'
                    }));
                }
            }
        } catch (error) {
            console.error('Error starting Docker Desktop:', error);
            setServiceStartupProgress(prev => ({
                ...prev,
                comfyui: 'Please start Docker Desktop manually',
                tts: 'Please start Docker Desktop manually',
                n8n: 'Please start Docker Desktop manually'
            }));
        }
    };

    const loadFeatureConfig = async () => {
        try {
            if ((window as any).featureConfig?.getFeatureConfig) {
                const config = await (window as any).featureConfig.getFeatureConfig();
                if (config) {
                    setFeatureConfig(config);
                    
                    // Update selected services based on feature config
                    setSelectedServices({
                        comfyui: config.comfyUI || false,
                        tts: config.ragAndTts || false,
                        n8n: config.n8n || false
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load feature configuration:', error);
        }
    };

    // Note: Services are not started during onboarding
    // They will be initialized after the main app starts up based on user preferences

    // Check service availability when reaching step 6
    useEffect(() => {
        if (step === 6) {
            // Check all services using real service manager
            checkRealServiceAvailability();
            loadFeatureConfig();
        }
    }, [step]);

    const handleSubmit = async () => {
        // Save personal info to database
        await db.updatePersonalInfo({
            name: formData.name,
            email: formData.email,
            timezone: formData.timezone,
            theme_preference: formData.theme_preference,
            avatar_url: formData.avatar_url,
            startup_settings: {
                autoStart: false,
                startMinimized: false,
                startFullscreen: false,
                checkForUpdates: true,
                restoreLastSession: true
            }
        });

        // Initialize API config with Ollama URL, ComfyUI URL, and OpenAI settings
        await db.updateAPIConfig({
            ollama_base_url: formData.angela_core_url,
            comfyui_base_url: formData.comfyui_url,
            openai_api_key: formData.openai_api_key,
            openai_base_url: formData.openai_base_url,
            api_type: formData.api_type
        });

        // Save user's explicit service selections
        if ((window as any).featureConfig?.updateFeatureConfig) {
            try {
                const newConfig = {
                    comfyUI: selectedServices.comfyui,
                    ragAndTts: false, // Don't auto-enable during onboarding to prevent downloads
                    n8n: selectedServices.n8n,
                    angelaCore: true, // Always enabled
                    userConsentGiven: true, // Flag to indicate user has completed onboarding
                    onboardingMode: true, // Flag to indicate this is during onboarding
                    servicePreferences: {
                        // Store actual user preferences separately
                        comfyUI: selectedServices.comfyui,
                        ragAndTts: selectedServices.tts,
                        n8n: selectedServices.n8n,
                        angelaCore: true
                    }
                };
                await (window as any).featureConfig.updateFeatureConfig(newConfig);
                console.log('User service selections saved:', selectedServices);
                
                // Dispatch event to notify other components about the config change
                const event = new CustomEvent('feature-config-updated', { detail: newConfig });
                window.dispatchEvent(event);
                console.log('🔄 Onboarding - Dispatched feature-config-updated event');
            } catch (error) {
                console.error('Failed to save service selections:', error);
            }
        }

        // Create user consent file for watchdog service
        if ((window as any).electronAPI?.createUserConsentFile) {
            try {
                await (window as any).electronAPI.createUserConsentFile({
                    hasConsented: true,
                    onboardingMode: true, // Flag to indicate this is during onboarding
                    autoStartServices: false, // Don't auto-start services during onboarding
                    services: {
                        comfyui: selectedServices.comfyui,
                        python: false, // Don't auto-start Python backend during onboarding
                        n8n: selectedServices.n8n,
                        'angela-core': true // Always enabled
                    },
                    servicePreferences: {
                        // Store user preferences separately from auto-start decisions
                        comfyui: selectedServices.comfyui,
                        tts: selectedServices.tts,
                        n8n: selectedServices.n8n,
                        'angela-core': true
                    },
                    timestamp: new Date().toISOString(),
                    onboardingVersion: '1.0'
                });
                console.log('User consent file created for watchdog service (onboarding mode)');
            } catch (error) {
                console.error('Failed to create user consent file:', error);
            }
        }

        // Save service configuration URLs for selected services
        if ((window as any).electronAPI?.invoke) {
            try {
                const configResults = [];
                
                for (const [serviceName, enabled] of Object.entries(selectedServices)) {
                    if (enabled) {
                        // Skip TTS service during onboarding to prevent automatic Python backend startup
                        if (serviceName === 'tts') {
                            console.log('TTS service preference noted but not configured during onboarding to prevent auto-start');
                            continue;
                        }
                        
                        const mode = serviceModes[serviceName as keyof typeof serviceModes];
                        const serviceUrl = serviceUrls[serviceName as keyof typeof serviceUrls];
                        
                        // Save service configuration
                        if (mode === 'manual' && serviceUrl) {
                            const result = await (window as any).electronAPI.invoke('service-config:set-manual-url', serviceName, serviceUrl);
                            configResults.push({ service: serviceName, mode: 'manual', url: serviceUrl, success: result.success, error: result.error });
                            
                            if (result.success) {
                                console.log(`✓ Service ${serviceName} URL saved: ${serviceUrl}`);
                            } else {
                                console.error(`✗ Failed to save ${serviceName} URL:`, result.error);
                            }
                        } else if (mode === 'docker') {
                            // For Docker services, save the mode without URL (uses defaults)
                            const result = await (window as any).electronAPI.invoke('service-config:set-config', serviceName, 'docker', null);
                            configResults.push({ service: serviceName, mode: 'docker', success: result.success, error: result.error });
                            
                            if (result.success) {
                                console.log(`✓ Service ${serviceName} configured for Docker mode`);
                            } else {
                                console.error(`✗ Failed to configure ${serviceName} for Docker:`, result.error);
                            }
                        }
                    }
                }
                
                // Verify configurations were saved by retrieving them
                try {
                    const savedConfigs = await (window as any).electronAPI.invoke('service-config:get-all-configs');
                    const verificationResults = [];
                    
                    for (const result of configResults) {
                        if (result.success) {
                            const savedConfig = savedConfigs[result.service];
                            if (savedConfig) {
                                if (result.mode === 'manual' && savedConfig.serviceUrl === result.url) {
                                    verificationResults.push(`✓ ${result.service}: ${result.url}`);
                                } else if (result.mode === 'docker' && savedConfig.deploymentMode === 'docker') {
                                    verificationResults.push(`✓ ${result.service}: Docker mode`);
                                } else {
                                    verificationResults.push(`⚠ ${result.service}: Configuration mismatch`);
                                }
                            } else {
                                verificationResults.push(`⚠ ${result.service}: Not found in saved configurations`);
                            }
                        } else {
                            verificationResults.push(`✗ ${result.service}: ${result.error}`);
                        }
                    }
                    
                    if (verificationResults.length > 0) {
                        console.log('Service configuration verification:', verificationResults);
                    }
                } catch (verifyError) {
                    console.warn('Could not verify service configurations:', verifyError);
                }
                
                // Explicitly disable Python/TTS service during onboarding to prevent auto-downloads
                try {
                    const disablePythonResult = await (window as any).electronAPI.invoke('service-config:disable-service', 'python');
                    if (disablePythonResult.success) {
                        console.log('✓ Python/TTS service explicitly disabled during onboarding');
                    } else {
                        console.warn('⚠ Could not disable Python/TTS service:', disablePythonResult.error);
                    }
                } catch (disableError) {
                    console.warn('Could not disable Python/TTS service during onboarding:', disableError);
                }
                
            } catch (error) {
                console.error('Failed to save service configurations:', error);
            }
        }

        onComplete();
    };

    const handleNextSection = (nextSection: 'welcome' | 'setup') => {
        setAnimationClass('animate-fadeOut');
        setTimeout(() => {
            setSection(nextSection);
            if (nextSection === 'setup') setStep(1);
            setAnimationClass('animate-fadeIn');
        }, 300);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (section === 'setup') {
                if (step < 8) { // Now 8 steps
                    if ((step === 1 && formData.name) ||
                        (step === 2 && formData.email) ||
                        step === 3 || step === 4 || step === 5 || step === 6 || step === 7) {
                        setStep(step + 1);
                    }
                } else {
                    if (formData.timezone) {
                        handleSubmit();
                    }
                }
            }
        }
    };

    // Load existing providers
    const loadProviders = async () => {
        try {
            const allProviders = await db.getAllProviders();
            setProviders(allProviders);
        } catch (error) {
            console.error('Error loading providers:', error);
        }
    };

    // Provider management functions
    const getProviderIcon = (type: Provider['type']) => {
        switch (type) {
            case 'angelas-pocket':
                return Bot;
            case 'openai':
                return Zap;
            case 'openai_compatible':
                return Router;
            case 'ollama':
                return Server;
            case 'openrouter':
                return ExternalLink;
            default:
                return Globe;
        }
    };

    const getDefaultProviderConfig = (type: Provider['type']) => {
        switch (type) {
            case 'openai':
                return { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' };
            case 'openai_compatible':
                return { baseUrl: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
            case 'openrouter':
                return { baseUrl: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
            case 'ollama':
                return { baseUrl: 'http://localhost:11434/v1', name: 'Ollama' };
            default:
                return { baseUrl: '', name: '' };
        }
    };

    const handleAddProvider = async () => {
        setAddingProvider(true);
        setProviderError(null);
        try {
            const providerId = await db.addProvider({
                name: newProviderForm.name,
                type: newProviderForm.type,
                baseUrl: newProviderForm.baseUrl,
                apiKey: newProviderForm.apiKey,
                isEnabled: newProviderForm.isEnabled,
                isPrimary: true // Set as primary since it's the first one being added during onboarding
            });

            // Set this provider as the API type
            setFormData(prev => ({...prev, api_type: 'external' as any}));

            // Reload providers
            await loadProviders();

            setShowAddProviderModal(false);
            setNewProviderForm({
                name: '',
                type: 'openai',
                baseUrl: '',
                apiKey: '',
                isEnabled: true
            });
        } catch (error: any) {
            console.error('Error adding provider:', error);
            setProviderError(error.message || 'Failed to add provider');
        } finally {
            setAddingProvider(false);
        }
    };

    const handleDeleteProvider = async (providerId: string) => {
        try {
            await db.deleteProvider(providerId);
            await loadProviders();
        } catch (error) {
            console.error('Error deleting provider:', error);
        }
    };

    // Check if user has configured something to proceed
    const hasValidSetup = () => {
        if (setupMethod === 'angela-core') {
            return availableModels.length > 0 || formData.model_folder_path;
        } else {
            const enabledProviders = providers.filter(p => p.isEnabled);
            return enabledProviders.length > 0;
        }
    };

    // Features of angela
    const features = [
        {
            title: "Privacy First",
            description: "Your data never leaves your device unless you explicitly allow it. All processing happens locally.",
            icon: <Shield className="w-8 h-8 text-sakura-500"/>
        },
        {
            title: "Powerful AI",
            description: "Access state-of-the-art AI models through angela Core with built-in model management and optimization.",
            icon: <Brain className="w-8 h-8 text-sakura-500"/>
        },
        {
            title: "Visual App Builder",
            description: "Create custom AI applications with our intuitive node-based flow builder and N8N integration.",
            icon: <Terminal className="w-8 h-8 text-sakura-500"/>
        },
        {
            title: "Rich Ecosystem",
            description: "Integrated ComfyUI, Jupyter notebooks, TTS services, and document processing capabilities.",
            icon: <Database className="w-8 h-8 text-sakura-500"/>
        }
    ];

    // Helper function to get timezone display name with UTC offset
    const getTimezoneDisplay = (timezone: string) => {
        try {
            const offset = getTimezoneOffset(timezone);
            const offsetString = offset >= 0 ? `+${offset}` : `${offset}`;
            return `${timezone} (UTC${offsetString})`;
        } catch {
            return timezone;
        }
    };

    // Helper function to get timezone offset in hours
    const getTimezoneOffset = (timezone: string) => {
        try {
            const now = new Date();
            const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
            return Math.round((tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60));
        } catch {
            return 0;
        }
    };

    // Welcome section
    if (section === "welcome") {
        return (
            <div
                className="fixed inset-0 bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 z-50 overflow-y-auto">
                <div className="min-h-screen w-full flex flex-col">
                    <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                        <div className="w-full max-w-7xl mx-auto">
                            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
                                <div className="w-full lg:w-1/2 text-center lg:text-left space-y-4 sm:space-y-6">
                                    <div className="flex justify-center lg:justify-start">
                                        <div className="relative">
                                            <div
                                                className="absolute inset-0 bg-sakura-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                                            <div
                                                className="relative bg-white dark:bg-gray-800 rounded-full p-3 sm:p-4 shadow-xl">
                                                {!logoError ? (
                                                    <img
                                                        src={logoImage}
                                                        alt="angela Logo"
                                                        className="w-12 h-12 sm:w-16 sm:h-16 object-contain"
                                                        onError={() => setLogoError(true)}
                                                    />
                                                ) : (
                                                    <Bot className="w-12 h-12 sm:w-16 sm:h-16 text-sakura-500" />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white animate-fadeIn leading-tight">
                                        Welcome to <span className="text-sakura-500">angela</span>
                                    </h1>

                                    <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto lg:mx-0 animate-fadeInUp delay-200 leading-relaxed">
                                        Your privacy-first AI assistant that keeps your data local and
                                        your conversations private.
                                    </p>
                                </div>

                                <div className="w-full lg:w-1/2 max-w-2xl">
                                    <div
                                        className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 animate-fadeInUp delay-300">
                                        {features.map((feature, idx) => (
                                            <div
                                                key={idx}
                                                className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850 backdrop-blur-md rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 hover:border-sakura-200 dark:hover:border-sakura-900 group"
                                            >
                                                <div
                                                    className="p-3 bg-sakura-100 dark:bg-sakura-900/20 rounded-lg w-fit mb-4 group-hover:scale-110 transition-transform">
                                                    {feature.icon}
                                                </div>
                                                <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                                                    {feature.title}
                                                </h3>
                                                <p className="text-gray-600 dark:text-gray-400">
                                                    {feature.description}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full px-4 pb-6 sm:pb-8 flex justify-center animate-fadeInUp delay-500 shrink-0">
                        <button
                            onClick={() => handleNextSection("setup")}
                            className="px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-sakura-400 to-sakura-500 hover:from-sakura-500 hover:to-sakura-600 text-white rounded-full font-medium shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 hover:gap-3"
                        >
                            Get Started <Zap className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Setup section - Enhanced version of the original form
    return (
        <div
            className="fixed inset-0 bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center z-50 overflow-y-auto py-6">
            <div
                className={`glassmorphic rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 space-y-4 sm:space-y-6 shadow-2xl ${animationClass}`}>
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                        Let's Set Up angela
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        {step === 1 ? "First, tell us a bit about yourself" :
                            step === 2 ? "How can we reach you?" :
                                step === 3 ? "Choose your preferred theme" :
                                    step === 4 ? "Let's connect to angela Core" :
                                        step === 5 ? "Set up your AI service" :
                                            step === 6 ? "Choose additional services" :
                                                step === 7 ? "Configure your services" :
                                                    "Final setup - timezone preferences"}
                    </p>

                    {/* Progress indicator */}
                    <div className="flex items-center justify-center gap-2 mt-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                            <div
                                key={s}
                                className={`h-2 rounded-full transition-all duration-300 ${
                                    s === step ? 'w-8 bg-sakura-500' : s < step ? 'w-8 bg-green-500' : 'w-4 bg-gray-300 dark:bg-gray-600'
                                }`}
                            />
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                    {step === 1 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <User className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    What should I call you?
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Your name helps personalize your experience with angela.
                            </p>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                                onKeyDown={handleKeyDown}
                                className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                placeholder="Your name"
                                autoFocus
                            />
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Mail className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    How can we reach you?
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Your email is stored locally and never shared. It's used for future features like saving
                                preferences across devices.
                            </p>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
                                onKeyDown={handleKeyDown}
                                className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                placeholder="your.email@example.com"
                                autoFocus
                            />
                        </div>
                    )}

                    {/* New Theme Selection Step */}
                    {step === 3 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Palette className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Choose Your Theme
                                </h3>
                            </div>

                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Select your preferred interface theme. You can change this later in settings.
                            </p>

                            <div className="flex flex-col gap-4 mt-6">
                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'dark'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'dark'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-md'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-sakura-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'dark' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <Moon className="w-6 h-6"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">Dark Mode</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Easier on the eyes, ideal for most environments</p>
                                    </div>
                                    {formData.theme_preference === 'dark' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>

                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'light'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'light'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-md'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-sakura-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'light' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <Sun className="w-6 h-6"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">Light Mode</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Bright interface for daytime use</p>
                                    </div>
                                    {formData.theme_preference === 'light' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>

                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'system'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'system'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-md'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-sakura-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'system' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <div className="relative">
                                            <Sunrise className="w-6 h-6"/>
                                        </div>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">System Default</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Follow your device's theme settings</p>
                                    </div>
                                    {formData.theme_preference === 'system' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Bot className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Connect to angela Core
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                angela Core is your local AI engine that processes everything privately on your device.
                            </p>

                            {/* angela Core Connection Status */}
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                                    <Check className="w-5 h-5"/>
                                    <span className="font-medium">angela Core is ready and running!</span>
                                </div>
                                <p className="text-sm text-green-600 dark:text-green-400">
                                    Connected to angela Core at {formData.angela_core_url}
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Download className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Set Up Your AI Service
                                </h3>
                            </div>
                            
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Choose how you want to use AI models:
                            </p>
                            
                            {/* Setup Method Selection - Compact Cards */}
                            <div className="grid gap-3">
                                <button
                                    onClick={() => setSetupMethod('angela-core')}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                        setupMethod === 'angela-core'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-sm'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-sakura-300'
                                    }`}
                                >
                                    <div className={`p-2 rounded-full ${
                                        setupMethod === 'angela-core' 
                                            ? 'bg-sakura-100 text-sakura-500' 
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                    }`}>
                                        <HardDrive className="w-5 h-5"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">angela Core (Recommended)</h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">Private, local AI models</p>
                                    </div>
                                    {setupMethod === 'angela-core' && <Check className="w-4 h-4 text-sakura-500"/>}
                                </button>
                                
                                <button
                                    onClick={() => setSetupMethod('external-provider')}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                        setupMethod === 'external-provider'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-sm'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-sakura-300'
                                    }`}
                                >
                                    <div className={`p-2 rounded-full ${
                                        setupMethod === 'external-provider' 
                                            ? 'bg-sakura-100 text-sakura-500' 
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                    }`}>
                                        <ExternalLink className="w-5 h-5"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">External API</h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">OpenAI, OpenRouter, etc.</p>
                                    </div>
                                    {setupMethod === 'external-provider' && <Check className="w-4 h-4 text-sakura-500"/>}
                                </button>
                            </div>
                            
                            {/* angela Core Setup - Condensed */}
                            {setupMethod === 'angela-core' && (
                                <div className="mt-4 space-y-3">
                                    {checkingModels ? (
                                        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <Loader className="w-4 h-4 animate-spin text-blue-600"/>
                                            <span className="text-sm text-blue-700 dark:text-blue-300">Checking models...</span>
                                        </div>
                                    ) : downloadError ? (
                                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-red-500">⚠</span>
                                                <span className="text-sm font-medium text-red-700 dark:text-red-300">Download failed</span>
                                            </div>
                                            <p className="text-xs text-red-600 dark:text-red-400 mb-2">{downloadError}</p>
                                            <button 
                                                onClick={() => {
                                                    setDownloadError(null);
                                                    handleModelDownload();
                                                }}
                                                className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                            >
                                                Try Again
                                            </button>
                                        </div>
                                    ) : availableModels.length === 0 ? (
                                        <div className="space-y-3">
                                            {/* Quick Download Option */}
                                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Download className="w-4 h-4 text-blue-600"/>
                                                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Quick Start (350MB)</span>
                                                </div>
                                                <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                                                    Download Qwen3 0.6B - fast and efficient for getting started
                                                </p>
                                                <button 
                                                    onClick={handleModelDownload}
                                                    disabled={downloadingModel}
                                                    className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
                                                >
                                                    {downloadingModel ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <Loader className="w-3 h-3 animate-spin"/>
                                                            {downloadProgress}%
                                                        </span>
                                                    ) : 'Download Model'}
                                                </button>
                                                
                                                {downloadingModel && (
                                                    <div className="mt-2">
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                                            <div 
                                                                className="bg-blue-600 h-1 rounded-full transition-all"
                                                                style={{ width: `${downloadProgress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Advanced Option - Collapsible */}
                                            <details className="group">
                                                <summary className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
                                                    <span className="group-open:rotate-90 transition-transform text-gray-700 dark:text-gray-300">▶</span>
                                                    <span className="text-gray-700 dark:text-gray-300">I have my own GGUF models</span>
                                                </summary>
                                                <div className="mt-2 space-y-3">
                                                    {/* Loading State */}
                                                    {isSettingCustomPath ? (
                                                        <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
                                                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                            <div>
                                                                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Scanning folder for models</p>
                                                                <p className="text-xs text-blue-600 dark:text-blue-400">Looking for .gguf files... Adding them, gimme a minute</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded">
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={formData.model_folder_path}
                                                                    onChange={(e) => {
                                                                        setFormData(prev => ({...prev, model_folder_path: e.target.value}));
                                                                        setFolderPickerMessage(null);
                                                                    }}
                                                                    placeholder="Path to your models folder..."
                                                                    className="flex-1 px-2 py-1 rounded bg-white/70 border border-gray-200 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 text-xs"
                                                                />
                                                                <button
                                                                    onClick={handlePickCustomModelPath}
                                                                    disabled={isSettingCustomPath}
                                                                    className="px-3 py-1 bg-sakura-500 text-white rounded hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs flex items-center gap-2"
                                                                >
                                                                    {isSettingCustomPath && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                                                    {isSettingCustomPath ? 'Scanning...' : 'Browse'}
                                                                </button>
                                                            </div>
                                                            {folderPickerMessage && (
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{folderPickerMessage}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </details>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Check className="w-4 h-4 text-green-600"/>
                                                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                                                    {availableModels.length} model{availableModels.length > 1 ? 's' : ''} ready!
                                                </span>
                                            </div>
                                            <p className="text-xs text-green-600 dark:text-green-400">
                                                You're all set to start using angela
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* External Provider Setup - Condensed */}
                            {setupMethod === 'external-provider' && (
                                <div className="mt-4 space-y-3">
                                    {providers.length > 0 ? (
                                        <div className="space-y-2">
                                            {providers.slice(0, 2).map((provider) => {
                                                const ProviderIcon = getProviderIcon(provider.type);
                                                return (
                                                    <div key={provider.id} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                                                        <ProviderIcon className="w-4 h-4 text-green-600"/>
                                                        <span className="text-sm text-green-700 dark:text-green-300 flex-1">{provider.name}</span>
                                                        <button
                                                            onClick={() => handleDeleteProvider(provider.id)}
                                                            className="p-1 text-red-500 hover:text-red-700"
                                                        >
                                                            <X className="w-3 h-3"/>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {providers.length > 2 && (
                                                <p className="text-xs text-gray-500">+{providers.length - 2} more providers</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                                                Connect to external AI services
                                            </p>
                                        </div>
                                    )}
                                    
                                    <button
                                        onClick={() => setShowAddProviderModal(true)}
                                        className="w-full flex items-center justify-center gap-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-sakura-400 text-gray-600 dark:text-gray-400 hover:text-sakura-600 text-sm"
                                    >
                                        <Plus className="w-4 h-4"/>
                                        Add Provider
                                    </button>
                                    
                                    {providerError && (
                                        <p className="text-xs text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                                            {providerError}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 6 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Server className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Choose Additional Services (Optional)
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Select the services you'd like to enable. <b>You must have docker installed to use these services.</b>
                                <br/>
                                <br/>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Note: During onboarding, only ComfyUI and N8N will be started if selected. TTS services will be available on-demand when needed. All services can be managed later in settings.
                                </span>
                            </p>

                            <div className="space-y-4">
                                {/* ComfyUI Service */}
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 transition-colors">
                                    <div className="flex items-center gap-3 p-4">
                                        <input
                                            type="checkbox"
                                            id="comfyui-service"
                                            checked={selectedServices.comfyui}
                                            onChange={(e) => setSelectedServices(prev => ({...prev, comfyui: e.target.checked}))}
                                            className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-sakura-500 dark:focus:ring-sakura-400"
                                        />
                                        <div className="text-2xl">🎨</div>
                                        <div className="flex-1">
                                            <label htmlFor="comfyui-service" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-gray-900 dark:text-white">ComfyUI</h4>
                                                    {serviceStatuses.comfyui === 'checking' && (
                                                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                    )}
                                                    {serviceStatuses.comfyui === 'available' && (
                                                        <span className="text-green-500 text-xs">● Online</span>
                                                    )}
                                                    {serviceStatuses.comfyui === 'unavailable' && (
                                                        <span className="text-gray-400 text-xs">○ Offline</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Image generation and editing</p>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    {selectedServices.comfyui && (
                                        <div className="px-4 pb-4 space-y-3">
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                ✅ ComfyUI will be configured after onboarding completes.
                                            </p>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2 rounded">
                                                <strong>Docker:</strong> 15.7GB download (Windows CUDA only)<br/>
                                                <strong>Manual:</strong> Use your own ComfyUI instance
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* RAG & TTS Service */}
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 transition-colors">
                                    <div className="flex items-center gap-3 p-4">
                                        <input
                                            type="checkbox"
                                            id="tts-service"
                                            checked={selectedServices.tts}
                                            onChange={(e) => setSelectedServices(prev => ({...prev, tts: e.target.checked}))}
                                            className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-sakura-500 dark:focus:ring-sakura-400"
                                        />
                                        <div className="text-2xl">🧠</div>
                                        <div className="flex-1">
                                            <label htmlFor="tts-service" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-gray-900 dark:text-white">RAG & TTS </h4>
                                                    {serviceStatuses.tts === 'checking' && (
                                                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                    )}
                                                    {serviceStatuses.tts === 'available' && (
                                                        <span className="text-green-500 text-xs">● Online</span>
                                                    )}
                                                    {serviceStatuses.tts === 'unavailable' && (
                                                        <span className="text-gray-400 text-xs">○ Offline</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Document analysis & voice synthesis (will start on-demand)</p>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    {selectedServices.tts && (
                                        <div className="px-4 pb-4 space-y-2">
                                            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700 dark:text-green-300">
                                                ✓ TTS service preference saved. Will NOT download during onboarding - available on-demand when you need document analysis or voice features (~11.4GB download when first used)
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* N8N Service */}
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 transition-colors">
                                    <div className="flex items-center gap-3 p-4">
                                        <input
                                            type="checkbox"
                                            id="n8n-service"
                                            checked={selectedServices.n8n}
                                            onChange={(e) => setSelectedServices(prev => ({...prev, n8n: e.target.checked}))}
                                            className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-sakura-500 dark:focus:ring-sakura-400"
                                        />
                                        <div className="text-2xl">⚡</div>
                                        <div className="flex-1">
                                            <label htmlFor="n8n-service" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-gray-900 dark:text-white">N8N Workflows</h4>
                                                    {serviceStatuses.n8n === 'checking' && (
                                                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                    )}
                                                    {serviceStatuses.n8n === 'available' && (
                                                        <span className="text-green-500 text-xs">● Online</span>
                                                    )}
                                                    {serviceStatuses.n8n === 'unavailable' && (
                                                        <span className="text-gray-400 text-xs">○ Offline</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Visual workflow automation</p>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    {selectedServices.n8n && (
                                        <div className="px-4 pb-4 space-y-3">
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                ✅ N8N will be configured after onboarding completes.
                                            </p>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2 rounded">
                                                <strong>Docker:</strong> Lightweight container for workflows<br/>
                                                <strong>Manual:</strong> Use your own N8N instance
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Simplified message */}
                            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-600 dark:text-blue-400">
                                    💡 Your selected services will be configured but not auto-started after onboarding. 
                                    You can manually start them when needed from the main application.
                                </p>
                                <p className="text-xs text-blue-500 dark:text-blue-300 mt-2">
                                    Note: angela Core will always be managed automatically as it's essential for the app to function.
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 7 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Globe className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Configure Your Services
                                </h3>
                            </div>
                            
                            {/* Show only selected services */}
                            {Object.entries(selectedServices).some(([_, enabled]) => enabled) ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Configure URLs for your selected services (or use defaults).
                                    </p>
                                    
                                    {selectedServices.comfyui && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="text-lg">🎨</div>
                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    ComfyUI URL - optional only if using a custom server or else ignore
                                                </label>
                                            </div>
                                            <input
                                                type="url"
                                                value={serviceUrls.comfyui}
                                                onChange={(e) => setServiceUrls(prev => ({...prev, comfyui: e.target.value}))}
                                                placeholder="http://localhost:8188"
                                                className="w-full px-3 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400 text-sm"
                                            />
                                        </div>
                                    )}

                                    {(selectedServices.tts || selectedServices.n8n) && (
                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-1">
                                                <Check className="w-4 h-4"/>
                                                <span className="text-sm font-medium">Auto-configured services</span>
                                            </div>
                                            <p className="text-xs text-green-600 dark:text-green-400">
                                                {selectedServices.tts && "RAG & TTS (on-demand)"}{selectedServices.tts && selectedServices.n8n && ", "}
                                                {selectedServices.n8n && "N8N"} will be configured automatically.
                                            </p>
                                        </div>
                                    )}

                                    {/* Test Configuration Button */}
                                    {selectedServices.comfyui && (
                                        <div className="pt-2">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        setServiceStartupProgress(prev => ({...prev, comfyui: 'Testing configuration...'}));
                                                        
                                                        // Save the URL first
                                                        const saveResult = await (window as any).electronAPI.invoke('service-config:set-manual-url', 'comfyui', serviceUrls.comfyui);
                                                        if (saveResult.success) {
                                                            setServiceStartupProgress(prev => ({...prev, comfyui: '✓ Configuration saved successfully'}));
                                                            
                                                            // Test the connection
                                                            try {
                                                                const testResult = await (window as any).electronAPI.invoke('service-config:test-manual-service', 'comfyui', serviceUrls.comfyui);
                                                                if (testResult.success) {
                                                                    setServiceStartupProgress(prev => ({...prev, comfyui: '✅ Connection test successful!'}));
                                                                    setServiceStatuses(prev => ({...prev, comfyui: 'available'}));
                                                                } else {
                                                                    setServiceStartupProgress(prev => ({...prev, comfyui: `⚠ Connection failed: ${testResult.error}`}));
                                                                    setServiceStatuses(prev => ({...prev, comfyui: 'unavailable'}));
                                                                }
                                                            } catch (testError: any) {
                                                                setServiceStartupProgress(prev => ({...prev, comfyui: `⚠ Connection test failed: ${testError.message}`}));
                                                                setServiceStatuses(prev => ({...prev, comfyui: 'unavailable'}));
                                                            }
                                                        } else {
                                                            setServiceStartupProgress(prev => ({...prev, comfyui: `❌ Failed to save: ${saveResult.error}`}));
                                                        }
                                                    } catch (error: any) {
                                                        setServiceStartupProgress(prev => ({...prev, comfyui: `❌ Error: ${error.message}`}));
                                                    }
                                                }}
                                                className="w-full px-4 py-2 bg-sakura-500 text-white rounded-lg text-sm font-medium hover:bg-sakura-600 transition-colors"
                                            >
                                                Test & Save Configuration
                                            </button>
                                            
                                            {/* Show test result */}
                                            {serviceStartupProgress.comfyui && (
                                                <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-xs text-gray-600 dark:text-gray-400">
                                                    {serviceStartupProgress.comfyui}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        No additional services selected. You can enable them later in Settings.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 8 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Globe className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Final Preferences
                                </h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Your Timezone
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        angela uses your timezone for time-aware responses.
                                    </p>
                                    <select
                                        value={formData.timezone}
                                        onChange={(e) => setFormData(prev => ({...prev, timezone: e.target.value}))}
                                        className="w-full px-3 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:focus:border-sakura-400"
                                    >
                                        {[
                                            // UTC
                                            'UTC',
                                            
                                            // Africa
                                            'Africa/Abidjan',
                                            'Africa/Algiers',
                                            'Africa/Cairo',
                                            'Africa/Casablanca',
                                            'Africa/Johannesburg',
                                            'Africa/Lagos',
                                            'Africa/Nairobi',
                                            'Africa/Tunis',
                                            
                                            // America - North
                                            'America/Anchorage',
                                            'America/Chicago',
                                            'America/Denver',
                                            'America/Los_Angeles',
                                            'America/New_York',
                                            'America/Phoenix',
                                            'America/Toronto',
                                            'America/Vancouver',
                                            'America/Winnipeg',
                                            
                                            // America - Central
                                            'America/Belize',
                                            'America/Costa_Rica',
                                            'America/Guatemala',
                                            'America/Havana',
                                            'America/Mexico_City',
                                            'America/Panama',
                                            'America/Tegucigalpa',
                                            
                                            // America - South
                                            'America/Argentina/Buenos_Aires',
                                            'America/Bogota',
                                            'America/Caracas',
                                            'America/Lima',
                                            'America/Santiago',
                                            'America/Sao_Paulo',
                                            
                                            // Asia - East
                                            'Asia/Bangkok',
                                            'Asia/Hong_Kong',
                                            'Asia/Jakarta',
                                            'Asia/Kuala_Lumpur',
                                            'Asia/Manila',
                                            'Asia/Seoul',
                                            'Asia/Shanghai',
                                            'Asia/Singapore',
                                            'Asia/Taipei',
                                            'Asia/Tokyo',
                                            
                                            // Asia - South
                                            'Asia/Calcutta',
                                            'Asia/Colombo',
                                            'Asia/Dhaka',
                                            'Asia/Karachi',
                                            'Asia/Kathmandu',
                                            
                                            // Asia - Central/West
                                            'Asia/Dubai',
                                            'Asia/Istanbul',
                                            'Asia/Jerusalem',
                                            'Asia/Kuwait',
                                            'Asia/Qatar',
                                            'Asia/Riyadh',
                                            'Asia/Tehran',
                                            'Asia/Tashkent',
                                            'Asia/Yekaterinburg',
                                            
                                            // Europe
                                            'Europe/Amsterdam',
                                            'Europe/Athens',
                                            'Europe/Berlin',
                                            'Europe/Brussels',
                                            'Europe/Budapest',
                                            'Europe/Dublin',
                                            'Europe/Helsinki',
                                            'Europe/Istanbul',
                                            'Europe/London',
                                            'Europe/Madrid',
                                            'Europe/Moscow',
                                            'Europe/Oslo',
                                            'Europe/Paris',
                                            'Europe/Prague',
                                            'Europe/Rome',
                                            'Europe/Stockholm',
                                            'Europe/Vienna',
                                            'Europe/Warsaw',
                                            'Europe/Zurich',
                                            
                                            // Australia/Oceania
                                            'Australia/Adelaide',
                                            'Australia/Brisbane',
                                            'Australia/Darwin',
                                            'Australia/Melbourne',
                                            'Australia/Perth',
                                            'Australia/Sydney',
                                            'Pacific/Auckland',
                                            'Pacific/Fiji',
                                            'Pacific/Honolulu',
                                            'Pacific/Port_Moresby',
                                            'Pacific/Samoa',
                                            'Pacific/Tahiti',
                                            'Pacific/Tongatapu',
                                            
                                            // Atlantic
                                            'Atlantic/Azores',
                                            'Atlantic/Bermuda',
                                            'Atlantic/Canary',
                                            'Atlantic/Cape_Verde',
                                            'Atlantic/Reykjavik',
                                            
                                            // Indian Ocean
                                            'Indian/Maldives',
                                            'Indian/Mauritius',
                                        ].map(tz => (
                                            <option key={tz} value={tz} className="dark:bg-gray-800 dark:text-gray-100">{getTimezoneDisplay(tz)}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Service startup progress - Hidden during onboarding as services aren't started */}
                                {/* Services will be initialized after onboarding completes */}

                                {/* Loading state for launch */}
                                {loading && (
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Loader className="w-4 h-4 animate-spin text-blue-500"/>
                                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                                Launching angela... (I will take a min to download Llama.cpp Binaries)
                                            </span>
                                        </div>
                                        <p className="text-xs text-blue-600 dark:text-blue-400">
                                            Saving your preferences. angela will initialize your selected services after startup.
                                        </p>
                                    </div>
                                )}

                                <div className="p-3 bg-sakura-50 dark:bg-sakura-900/20 rounded-lg">
                                    <h4 className="font-medium text-sakura-800 dark:text-sakura-200 mb-2">
                                        🎉 You're almost ready!
                                    </h4>
                                    <p className="text-sm text-sakura-700 dark:text-sakura-300">
                                        angela is configured and ready to go. Click "Launch angela" to start your AI-powered journey!
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-between pt-4">
                    {section === 'setup' && (
                        <>
                            {step > 1 ? (
                                <button
                                    onClick={() => setStep(step - 1)}
                                    className="px-6 py-2 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                                >
                                    Back
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleNextSection('welcome')}
                                    className="px-6 py-2 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                                >
                                    Back to Welcome
                                </button>
                            )}

                            <button
                                onClick={async () => {
                                    if (step < 8) {
                                        setStep(step + 1);
                                    } else {
                                        // Launch angela - just save preferences, don't start services
                                        setLoading(true);
                                        try {
                                            // Only save preferences during onboarding
                                            await handleSubmit();
                                            // Complete onboarding - services will be started by the main app
                                            onComplete();
                                        } catch (error) {
                                            console.error('Error saving preferences:', error);
                                            // Still complete onboarding even if there are preference save errors
                                            onComplete();
                                        } finally {
                                            setLoading(false);
                                        }
                                    }
                                }}
                                disabled={
                                    (step === 1 && !formData.name) ||
                                    (step === 2 && !formData.email) ||
                                    (step === 5 && !hasValidSetup() && !downloadingModel) ||
                                    downloadingModel ||
                                    loading
                                }
                                className="ml-auto px-6 py-2 rounded-lg bg-sakura-500 text-white
                transition-all disabled:bg-gray-400 disabled:cursor-not-allowed
                hover:shadow-[0_0_20px_rgba(244,163,187,0.5)] hover:bg-sakura-400"
                            >
                                {step === 8 ? (
                                    loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader className="w-4 h-4 animate-spin"/>
                                            Launching angela... (I will take a min to download Llama.cpp Binaries)
                                        </span>
                                    ) : 'Launch angela'
                                ) : 'Continue'}
                            </button>
                        </>
                    )}
                </div>
            </div>
            
            {/* Add Provider Modal */}
            {showAddProviderModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Add AI Provider
                            </h3>
                            <button
                                onClick={() => {
                                    setShowAddProviderModal(false);
                                    setProviderError(null);
                                }}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Provider Type
                                </label>
                                <select
                                    value={newProviderForm.type}
                                    onChange={(e) => {
                                        const type = e.target.value as Provider['type'];
                                        const defaultConfig = getDefaultProviderConfig(type);
                                        setNewProviderForm(prev => ({
                                            ...prev,
                                            type,
                                            name: defaultConfig.name || prev.name,
                                            baseUrl: defaultConfig.baseUrl || prev.baseUrl,
                                            apiKey: type === 'ollama' ? 'ollama' : prev.apiKey
                                        }));
                                    }}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:focus:border-sakura-400"
                                >
                                    <option value="openai" className="dark:bg-gray-800 dark:text-gray-100">OpenAI</option>
                                    <option value="openai_compatible" className="dark:bg-gray-800 dark:text-gray-100">OpenAI Compatible</option>
                                    <option value="openrouter" className="dark:bg-gray-800 dark:text-gray-100">OpenRouter</option>
                                    <option value="ollama" className="dark:bg-gray-800 dark:text-gray-100">Ollama</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Provider Name
                                </label>
                                <input
                                    type="text"
                                    value={newProviderForm.name}
                                    onChange={(e) => setNewProviderForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                    placeholder="Enter provider name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Base URL
                                </label>
                                <input
                                    type="url"
                                    value={newProviderForm.baseUrl}
                                    onChange={(e) => setNewProviderForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                    placeholder="https://api.example.com/v1"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    value={newProviderForm.apiKey}
                                    onChange={(e) => setNewProviderForm(prev => ({ ...prev, apiKey: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                    placeholder="Enter API key"
                                />
                            </div>
                            
                            {newProviderForm.type === 'openrouter' && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                        💡 <strong>OpenRouter tip:</strong> Get your API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">openrouter.ai/keys</a>
                                    </p>
                                </div>
                            )}
                            
                            {newProviderForm.type === 'openai' && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                        💡 <strong>OpenAI tip:</strong> Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com/api-keys</a>
                                    </p>
                                </div>
                            )}
                            
                            {providerError && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                    <p className="text-sm text-red-600 dark:text-red-400">{providerError}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowAddProviderModal(false);
                                    setProviderError(null);
                                }}
                                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddProvider}
                                disabled={!newProviderForm.name.trim() || !newProviderForm.baseUrl.trim() || addingProvider}
                                className="flex-1 px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {addingProvider ? (
                                    <>
                                        <Loader className="w-4 h-4 animate-spin"/>
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Add Provider
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Onboarding;
