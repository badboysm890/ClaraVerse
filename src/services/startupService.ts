

export interface StartupSettings {
  startFullscreen: boolean;
  startMinimized: boolean;
  autoStart: boolean;
  checkUpdates: boolean;
  restoreLastSession: boolean;
  isDevelopment?: boolean;
}

export class StartupService {
  private static instance: StartupService;
  private settings: StartupSettings = {
    startFullscreen: false,
    startMinimized: false,
    autoStart: false,
    checkUpdates: true,
    restoreLastSession: true,
    isDevelopment: false
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
      // Check if electron API is available
      if (!(window as any).electron?.getStartupSettings) {
        console.warn('Electron startup settings API not available');
        return;
      }
      
      const settings = await (window as any).electron.getStartupSettings();
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
    
    try {
      // Check if electron API is available
      if (!(window as any).electron?.setStartupSettings) {
        console.warn('Electron startup settings API not available');
        return;
      }
      
      await (window as any).electron.setStartupSettings(this.settings);
    } catch (error) {
      console.error('Error updating startup settings:', error);
    }
  }

  public async applyStartupSettings(): Promise<void> {
    try {
      // Check if electron API is available
      if (!(window as any).electron?.setStartupSettings) {
        console.warn('Electron startup settings API not available, skipping startup settings application');
        return;
      }
      
      await (window as any).electron.setStartupSettings(this.settings);
    } catch (error) {
      console.error('Error applying startup settings:', error);
    }
  }
} 
