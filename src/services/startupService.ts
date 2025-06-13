import { ipcRenderer } from 'electron';

export interface StartupSettings {
  startFullscreen: boolean;
  startMinimized: boolean;
  autoStart: boolean;
  checkUpdates: boolean;
  restoreLastSession: boolean;
}

export class StartupService {
  private static instance: StartupService;
  private settings: StartupSettings = {
    startFullscreen: false,
    startMinimized: false,
    autoStart: false,
    checkUpdates: true,
    restoreLastSession: true
  };

  private constructor() {
    this.loadSettings();
  }

  public static getInstance(): StartupService {
    if (!StartupService.instance) {
      StartupService.instance = new StartupService();
    }
    return StartupService.instance;
  }

  private async loadSettings() {
    try {
      const settings = await window.startupSettings.getStartupSettings();
      this.settings = { ...this.settings, ...settings };
    } catch (error) {
      console.error('Error loading startup settings:', error);
    }
  }

  public async getStartupSettings(): Promise<StartupSettings> {
    await this.loadSettings();
    return this.settings;
  }

  public async updateStartupSettings(settings: Partial<StartupSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await window.startupSettings.setStartupSettings(this.settings);
  }

  public async applyStartupSettings(): Promise<void> {
    await window.startupSettings.setStartupSettings(this.settings);
  }
}

// Add type definitions for the window object
declare global {
  interface Window {
    startupSettings: {
      setStartupSettings: (settings: StartupSettings) => void;
      getStartupSettings: () => Promise<StartupSettings>;
    };
  }
} 