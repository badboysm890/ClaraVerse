/**
 * Notification Service for angela
 * Handles completion notifications, sound alerts, and notification management
 */

export interface angelaNotification {
  id: string;
  type: 'completion' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  duration?: number; // Auto-dismiss after this many ms
  sound?: boolean; // Whether to play sound
}

export type NotificationListener = (notifications: angelaNotification[]) => void;

class NotificationService {
  private notifications: angelaNotification[] = [];
  private listeners: Set<NotificationListener> = new Set();
  private audioContext: AudioContext | null = null;
  private soundEnabled: boolean = true;

  constructor() {
    this.initializeAudio();
    this.loadNotifications();
  }

  /**
   * Initialize Web Audio API for sound generation
   */
  private initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  /**
   * Play a completion chime sound
   */
  private playCompletionChime() {
    if (!this.soundEnabled || !this.audioContext) return;

    try {
      // Resume audio context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Create a pleasant completion chime (C major chord arpeggio)
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      const duration = 0.15; // Duration of each note
      const gap = 0.05; // Gap between notes

      notes.forEach((frequency, index) => {
        const oscillator = this.audioContext!.createOscillator();
        const gainNode = this.audioContext!.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext!.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext!.currentTime);
        oscillator.type = 'sine';

        const startTime = this.audioContext!.currentTime + (index * (duration + gap));
        const endTime = startTime + duration;

        // Smooth envelope
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);

        oscillator.start(startTime);
        oscillator.stop(endTime);
      });

      console.log('🔔 Played completion chime');
    } catch (error) {
      console.warn('Failed to play completion chime:', error);
    }
  }

  /**
   * Play an error sound
   */
  private playErrorSound() {
    if (!this.soundEnabled || !this.audioContext) return;

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Create a subtle error tone (lower frequency, shorter)
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
      oscillator.type = 'triangle';

      const startTime = this.audioContext.currentTime;
      const endTime = startTime + 0.3;

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.08, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);

      oscillator.start(startTime);
      oscillator.stop(endTime);

      console.log('🔔 Played error sound');
    } catch (error) {
      console.warn('Failed to play error sound:', error);
    }
  }

  /**
   * Add a new notification
   */
  public addNotification(notification: Omit<angelaNotification, 'id' | 'timestamp' | 'isRead'>): string {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newNotification: angelaNotification = {
      id,
      timestamp: new Date(),
      isRead: false,
      sound: true,
      ...notification
    };

    this.notifications.unshift(newNotification); // Add to beginning

    // Keep only last 50 notifications
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(0, 50);
    }

    // Play sound if enabled
    if (newNotification.sound) {
      if (newNotification.type === 'completion') {
        this.playCompletionChime();
      } else if (newNotification.type === 'error') {
        this.playErrorSound();
      }
    }

    // Auto-dismiss if duration is set
    if (newNotification.duration) {
      setTimeout(() => {
        this.removeNotification(id);
      }, newNotification.duration);
    }

    this.saveNotifications();
    this.notifyListeners();

    console.log(`📢 Added ${newNotification.type} notification:`, newNotification.title);
    return id;
  }

  /**
   * Add a completion notification with chime
   */
  public addCompletionNotification(title: string, message: string, duration: number = 5000): string {
    return this.addNotification({
      type: 'completion',
      title,
      message,
      duration,
      sound: true
    });
  }

  /**
   * Add a persistent background completion notification (no auto-dismiss)
   */
  public addBackgroundCompletionNotification(title: string, message: string): string {
    return this.addNotification({
      type: 'completion',
      title,
      message,
      duration: undefined, // No auto-dismiss
      sound: true
    });
  }

  /**
   * Add an error notification
   */
  public addErrorNotification(title: string, message: string, duration: number = 8000): string {
    return this.addNotification({
      type: 'error',
      title,
      message,
      duration,
      sound: true
    });
  }

  /**
   * Add an info notification
   */
  public addInfoNotification(title: string, message: string, duration: number = 4000): string {
    return this.addNotification({
      type: 'info',
      title,
      message,
      duration,
      sound: false
    });
  }

  /**
   * Mark notification as read
   */
  public markAsRead(id: string): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.isRead = true;
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Mark all notifications as read
   */
  public markAllAsRead(): void {
    this.notifications.forEach(n => n.isRead = true);
    this.saveNotifications();
    this.notifyListeners();
  }

  /**
   * Remove a notification
   */
  public removeNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.saveNotifications();
    this.notifyListeners();
  }

  /**
   * Clear all error notifications
   */
  public clearErrorNotifications(): void {
    this.notifications = this.notifications.filter(n => n.type !== 'error');
    this.saveNotifications();
    this.notifyListeners();
    console.log('🧹 Cleared all error notifications');
  }

  /**
   * Clear all notifications
   */
  public clearAll(): void {
    this.notifications = [];
    this.saveNotifications();
    this.notifyListeners();
  }

  /**
   * Get all notifications
   */
  public getNotifications(): angelaNotification[] {
    return [...this.notifications];
  }

  /**
   * Get unread notification count
   */
  public getUnreadCount(): number {
    return this.notifications.filter(n => !n.isRead).length;
  }

  /**
   * Subscribe to notification updates
   */
  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Enable/disable sound
   */
  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    localStorage.setItem('angela-notifications-sound', JSON.stringify(enabled));
  }

  /**
   * Check if sound is enabled
   */
  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  /**
   * Test the completion chime (for user testing)
   */
  public testCompletionChime(): void {
    this.playCompletionChime();
  }

  /**
   * Test the error sound (for user testing)
   */
  public testErrorSound(): void {
    this.playErrorSound();
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getNotifications());
      } catch (error) {
        console.error('Error notifying notification listener:', error);
      }
    });
  }

  /**
   * Save notifications to localStorage
   */
  private saveNotifications(): void {
    try {
      // Only save last 20 notifications to localStorage
      const toSave = this.notifications.slice(0, 20);
      localStorage.setItem('angela-notifications', JSON.stringify(toSave));
    } catch (error) {
      console.warn('Failed to save notifications to localStorage:', error);
    }
  }

  /**
   * Load notifications from localStorage
   */
  private loadNotifications(): void {
    try {
      const saved = localStorage.getItem('angela-notifications');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.notifications = parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        }));
      }

      // Load sound preference
      const soundPref = localStorage.getItem('angela-notifications-sound');
      if (soundPref !== null) {
        this.soundEnabled = JSON.parse(soundPref);
      }
    } catch (error) {
      console.warn('Failed to load notifications from localStorage:', error);
      this.notifications = [];
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Export convenience functions
export const addCompletionNotification = (title: string, message: string, duration?: number) => 
  notificationService.addCompletionNotification(title, message, duration);

export const addBackgroundCompletionNotification = (title: string, message: string) => 
  notificationService.addBackgroundCompletionNotification(title, message);

export const addErrorNotification = (title: string, message: string, duration?: number) => 
  notificationService.addErrorNotification(title, message, duration);

export const addInfoNotification = (title: string, message: string, duration?: number) => 
  notificationService.addInfoNotification(title, message, duration);

export const clearErrorNotifications = () => 
  notificationService.clearErrorNotifications(); 
