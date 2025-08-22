import { ElectronAPI } from './electron';

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {}; 
