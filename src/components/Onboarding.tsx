import {useState, useEffect} from 'react';
import {
    User,
    Mail,
    Globe,
    Check,
    AlertCircle,
    Loader,
    Sparkles,
    Shield,
    Brain,
    Terminal,
    Zap,
    Image,
    Code,
    Bot,
    Database,
    Sunrise,
    Sun,
    Moon,
    Palette,
} from 'lucide-react';
import {db} from '../db';
import {OllamaClient} from '../utils/OllamaClient';
import { useTheme } from '../hooks/useTheme';

interface OnboardingProps {
    onComplete: () => void;
}

const Onboarding = ({onComplete}: OnboardingProps) => {
    const [section, setSection] = useState<'welcome' | 'features' | 'setup'>('welcome');
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        theme_preference: 'light' as 'light' | 'dark' | 'system', // Default to light mode
        avatar_url: '',
        ollama_url: 'http://localhost:11434',
        comfyui_url: 'http://localhost:8188',
        openai_api_key: '',
        openai_base_url: 'https://api.openai.com/v1',
        api_type: 'ollama' as 'ollama' | 'openai'
    });
    const [loading, setLoading] = useState(false);
    const [pingStatus, setPingStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [animationClass, setAnimationClass] = useState('animate-fadeIn');
    const [showApiKey, setShowApiKey] = useState(false);

    // For feature showcase animation
    const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);

    const { setThemePreference } = useTheme();

    // Apply theme immediately when selected
    useEffect(() => {
        setThemePreference(formData.theme_preference);
      }, [formData.theme_preference]);

    // Auto-rotate features
    useEffect(() => {
        if (section === 'features') {
            const interval = setInterval(() => {
                setActiveFeatureIndex((prev) => (prev + 1) % useCases.length);
            }, 5000);

            return () => clearInterval(interval);
        }
    }, [section]);

    const pingOllamaServer = async (url: string) => {
        setLoading(true);
        setPingStatus('idle');
        try {
            const client = new OllamaClient(url);
            const isAvailable = await client.checkConnection();
            if (isAvailable) {
                setPingStatus('success');
            } else {
                setPingStatus('error');
            }
        } catch (error) {
            console.error('Error pinging Ollama server:', error);
            setPingStatus('error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        // Save personal info to database
        await db.updatePersonalInfo({
            name: formData.name,
            email: formData.email,
            timezone: formData.timezone,
            theme_preference: formData.theme_preference,
            avatar_url: formData.avatar_url
        });

        // Initialize API config with Ollama URL, ComfyUI URL, and OpenAI settings
        await db.updateAPIConfig({
            ollama_base_url: formData.ollama_url,
            comfyui_base_url: formData.comfyui_url,
            openai_api_key: formData.openai_api_key,
            openai_base_url: formData.openai_base_url,
            api_type: formData.api_type
        });

        onComplete();
    };

    const handleNextSection = (nextSection: 'welcome' | 'features' | 'setup') => {
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
                if (step < 4) { // Now 4 steps with theme selection
                    if ((step === 1 && formData.name) ||
                        (step === 2 && formData.email)) {
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

    // Use cases for Clara
    const useCases = [
        {
            title: "AI Assistant",
            description: "Clara serves as your personal AI assistant, helping with tasks, answering questions, and providing information—all while keeping your data private.",
            icon: <Bot className="w-12 h-12 text-sakura-500"/>,
            examples: ["Ask questions about any topic", "Get help with coding problems", "Brainstorm ideas for projects"]
        },
        {
            title: "Image Understanding",
            description: "Upload images and get intelligent analysis and descriptions using multimodal models, without sending your images to cloud servers.",
            icon: <Image className="w-12 h-12 text-sakura-500"/>,
            examples: ["Analyze charts and graphs", "Get detailed descriptions of images", "Extract text from screenshots"]
        },
        {
            title: "Creative Writing",
            description: "Generate creative content, stories, and ideas with the help of powerful language models running on your own hardware.",
            icon: <Sparkles className="w-12 h-12 text-sakura-500"/>,
            examples: ["Write blog posts and articles", "Create stories and narratives", "Draft professional emails"]
        },
        {
            title: "Custom App Building",
            description: "Build your own AI-powered applications using Clara's visual flow builder without writing a single line of code.",
            icon: <Zap className="w-12 h-12 text-sakura-500"/>,
            examples: ["Create custom chatbots", "Build data processing flows", "Design interactive tools"]
        },
        {
            title: "Code Assistant",
            description: "Get coding help, generate code snippets, and debug issues with Clara's programming capabilities.",
            icon: <Code className="w-12 h-12 text-sakura-500"/>,
            examples: ["Generate code in multiple languages", "Debug existing code", "Get coding tutorials and explanations"]
        }
    ];

    // Features of Clara
    const features = [
        {
            title: "Privacy First",
            description: "Your data never leaves your device unless you explicitly allow it. All processing happens locally.",
            icon: <Shield className="w-8 h-8 text-sakura-500"/>
        },
        {
            title: "Powerful AI",
            description: "Access state-of-the-art AI models running on your own hardware through Ollama integration.",
            icon: <Brain className="w-8 h-8 text-sakura-500"/>
        },
        {
            title: "Visual App Builder",
            description: "Create custom AI applications with our intuitive node-based flow builder.",
            icon: <Terminal className="w-8 h-8 text-sakura-500"/>
        },
        {
            title: "Local Storage",
            description: "All your conversations and data are stored locally in your browser's database.",
            icon: <Database className="w-8 h-8 text-sakura-500"/>
        }
    ];

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
                                                <img
                                                    src="/logo.png"
                                                    alt="Clara Logo"
                                                    className="w-12 h-12 sm:w-16 sm:h-16 object-contain"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white animate-fadeIn leading-tight">
                                        Welcome to <span className="text-sakura-500">Clara</span>
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
                            onClick={() => handleNextSection("features")}
                            className="px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-sakura-400 to-sakura-500 hover:from-sakura-500 hover:to-sakura-600 text-white rounded-full font-medium shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 hover:gap-3"
                        >
                            Discover Clara <Zap className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Features and use cases section
    if (section === "features") {
        return (
            <div
                className="fixed inset-0 bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 flex items-start justify-center z-50 overflow-y-auto py-8 sm:py-12 overflow-x-hidden">
                <div
                    className={`w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-8 sm:space-y-12 ${animationClass}`}>
                    {/* Header section */}
                    <div className="text-center px-2">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
                            What can you do with Clara?
                        </h2>
                        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                            Clara is designed to be your AI companion for a variety of tasks,
                            all while keeping your data private and secure.
                        </p>
                    </div>

                    {/* Carousel section */}
                    <div className="relative min-h-[300px] sm:min-h-[350px] md:min-h-[400px] w-full overflow-hidden">
                        {useCases.map((useCase, idx) => (
                            <div
                                key={idx}
                                className={`absolute inset-0 transition-all duration-700 flex flex-col md:flex-row items-center ${
                                    idx === activeFeatureIndex
                                        ? "opacity-100 translate-x-0"
                                        : idx < activeFeatureIndex
                                            ? "opacity-0 -translate-x-full"
                                            : "opacity-0 translate-x-full"
                                }`}
                            >
                                {/* Icon/image container */}
                                <div className="w-full md:w-1/3 flex justify-center p-4 sm:p-6">
                                    <div className="relative max-w-[200px] mx-auto">
                                        <div
                                            className="absolute inset-0 bg-sakura-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                                        <div
                                            className="bg-white dark:bg-gray-800 rounded-full p-4 sm:p-6 shadow-xl relative">
                                            {useCase.icon}
                                        </div>
                                    </div>
                                </div>

                                {/* Content container */}
                                <div className="w-full md:w-2/3 space-y-3 sm:space-y-4 p-4 sm:p-6">
                                    <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                                        {useCase.title}
                                    </h3>
                                    <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg">
                                        {useCase.description}
                                    </p>

                                    <div className="space-y-2 pt-2 sm:pt-4">
                                        <p className="text-xs sm:text-sm uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                                            Examples:
                                        </p>
                                        <ul className="space-y-1 sm:space-y-2">
                                            {useCase.examples.map((example, i) => (
                                                <li key={i} className="flex items-start gap-2">
                                                    <Check
                                                        className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0 mt-0.5"/>
                                                    <span
                                                        className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                                                    {example}
                                                </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Indicator dots */}
                    <div className="flex justify-center gap-2">
                        {useCases.map((_, idx) => (
                            <button
                                key={idx}
                                className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all ${
                                    idx === activeFeatureIndex
                                        ? "bg-sakura-500 scale-125"
                                        : "bg-gray-300 dark:bg-gray-600"
                                }`}
                                onClick={() => setActiveFeatureIndex(idx)}
                                aria-label={`Go to slide ${idx + 1}`}
                            />
                        ))}
                    </div>

                    {/* Navigation buttons */}
                    <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 pt-4 sm:pt-6 px-2">
                        <button
                            onClick={() => handleNextSection("welcome")}
                            className="px-4 sm:px-6 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                        >
                            Back
                        </button>
                        <button
                            onClick={() => handleNextSection("setup")}
                            className="px-5 sm:px-8 py-2 sm:py-2.5 text-sm sm:text-base bg-gradient-to-r from-sakura-400 to-sakura-500 hover:from-sakura-500 hover:to-sakura-600 text-white rounded-full font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            Get Started <Zap className="w-4 h-4 sm:w-5 sm:h-5"/>
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
                        Let's Set Up Clara
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        {step === 1 ? "First, tell us a bit about yourself" :
                            step === 2 ? "How can we reach you?" :
                                step === 3 ? "Choose your preferred theme" :
                                    "Almost done! Configure your connections"}
                    </p>

                    {/* Progress indicator */}
                    <div className="flex items-center justify-center gap-2 mt-4">
                        {[1, 2, 3, 4].map((s) => (
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
                                Your name helps personalize your experience with Clara.
                            </p>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                                onKeyDown={handleKeyDown}
                                className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
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
                                className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
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
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'light'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'light'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-sakura-300'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'light' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <Sun className="w-6 h-6"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">Light Mode</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Bright interface, ideal
                                            for daytime use</p>
                                    </div>
                                    {formData.theme_preference === 'light' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>

                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'dark'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'dark'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-sakura-300'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'dark' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <Moon className="w-6 h-6"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">Dark Mode</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Easier on the eyes in
                                            low-light environments</p>
                                    </div>
                                    {formData.theme_preference === 'dark' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>

                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'system'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'system'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-sakura-300'
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
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Follow your device's
                                            theme settings</p>
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
                                    <Globe className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Configure Your Connections
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Clara connects to local AI engines running on your device or network for complete
                                privacy.
                            </p>

                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Ollama API URL
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Ollama provides the AI models that power Clara's intelligence. By default, it
                                        runs locally on your machine.
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={formData.ollama_url}
                                            onChange={(e) => {
                                                setFormData(prev => ({...prev, ollama_url: e.target.value}));
                                                setPingStatus('idle');
                                            }}
                                            className="flex-1 px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                                            placeholder="http://localhost:11434"
                                        />
                                        <button
                                            onClick={() => pingOllamaServer(formData.ollama_url)}
                                            disabled={loading}
                                            className="px-3 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                                        >
                                            {loading ? <Loader className="w-4 h-4 animate-spin"/> : 'Test'}
                                        </button>
                                    </div>
                                    <div className="mt-2">
                                        {pingStatus === 'success' && (
                                            <div className="flex items-center gap-1 text-green-600 text-xs">
                                                <Check className="w-4 h-4"/> Connection successful! Ollama server is
                                                reachable.
                                            </div>
                                        )}
                                        {pingStatus === 'error' && (
                                            <div className="text-xs">
                                                <div
                                                    className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                                                    <AlertCircle className="w-4 h-4"/> Unable to connect to Ollama
                                                    server
                                                </div>
                                                <div
                                                    className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs">
                                                    <p className="font-medium mb-1">Don't have Ollama yet?</p>
                                                    <p className="mb-2">Ollama is required to power Clara's AI
                                                        capabilities. It's free, open-source, and runs locally.</p>
                                                    <a
                                                        href="https://ollama.com/download"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-sakura-500 hover:underline inline-block font-medium"
                                                    >
                                                        Download Ollama →
                                                    </a>
                                                    <div
                                                        className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800">
                                                        <p className="font-medium mb-1">After installing Ollama:</p>
                                                        <p className="mb-2">Try running this command to download a small
                                                            but powerful model:</p>
                                                        <div
                                                            className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded font-mono mb-2">
                                                            ollama run deepseek-r1
                                                        </div>
                                                        <p className="text-amber-700 dark:text-amber-300 text-xs">
                                                            deepseek-r1 is a compact model that demonstrates Ollama's
                                                            capabilities while being smaller to download.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        ComfyUI URL (Optional)
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        ComfyUI enables image generation capabilities. You can configure this later if
                                        you don't have it installed.
                                    </p>
                                    <input
                                        type="url"
                                        value={formData.comfyui_url}
                                        onChange={(e) => setFormData(prev => ({...prev, comfyui_url: e.target.value}))}
                                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                                        placeholder="http://localhost:8188"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Your Timezone
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Clara uses your timezone to provide time-aware responses.
                                    </p>
                                    <select
                                        value={formData.timezone}
                                        onChange={(e) => setFormData(prev => ({...prev, timezone: e.target.value}))}
                                        onKeyDown={handleKeyDown}
                                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                                    >
                                        {Intl.supportedValuesOf('timeZone').map(tz => (
                                            <option key={tz} value={tz}>{tz}</option>
                                        ))}
                                    </select>
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
                                    onClick={() => handleNextSection('features')}
                                    className="px-6 py-2 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                                >
                                    Back to Features
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    if (step < 4) {
                                        setStep(step + 1);
                                    } else {
                                        handleSubmit();
                                    }
                                }}
                                disabled={
                                    (step === 1 && !formData.name) ||
                                    (step === 2 && !formData.email)
                                }
                                className="ml-auto px-6 py-2 rounded-lg bg-sakura-500 text-white
                transition-all disabled:bg-gray-400 disabled:cursor-not-allowed
                hover:shadow-[0_0_20px_rgba(244,163,187,0.5)] hover:bg-sakura-400"
                            >
                                {step === 4 ? 'Launch Clara' : 'Continue'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Onboarding;