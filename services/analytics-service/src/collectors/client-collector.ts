/**
 * Client-Side Behavioral Data Collector
 *
 * This module is designed to run in the browser and collect behavioral signals
 * for fraud detection. It should be bundled and included in the web app.
 *
 * PRIVACY NOTE: All data collection complies with GDPR requirements:
 * - Users are informed about data collection in privacy policy
 * - Personal identifiers are hashed before transmission
 * - Data is used only for fraud detection
 * - Users can request data deletion
 */

// =============================================================================
// TYPES
// =============================================================================

interface KeystrokeEvent {
  key: string;
  timestamp: number;
  keyCode: number;
  isModifier: boolean;
}

interface MouseEvent {
  x: number;
  y: number;
  timestamp: number;
  type: 'move' | 'click' | 'scroll';
  button?: number;
  scrollDelta?: number;
}

interface CompositionState {
  startTime: number;
  keystrokes: KeystrokeEvent[];
  content: string[];
  focusLostAt: number[];
  focusRestoredAt: number[];
  pasteEvents: number[];
}

interface CollectorConfig {
  endpoint: string;
  sessionId: string;
  userId: string;
  batchSize: number;
  flushInterval: number;
  enableMouseTracking: boolean;
  enableKeystrokeTracking: boolean;
  samplingRate: number; // 0-1, percentage of events to collect
}

// =============================================================================
// BEHAVIORAL COLLECTOR CLASS
// =============================================================================

export class BehavioralCollector {
  private config: CollectorConfig;
  private eventQueue: Array<Record<string, unknown>> = [];
  private keystrokeBuffer: KeystrokeEvent[] = [];
  private mouseBuffer: MouseEvent[] = [];
  private compositionState: CompositionState | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private lastMouseEvent: number = 0;
  private pageLoadTime: number = Date.now();
  private isActive: boolean = false;

  // Sampling for mouse events (every N ms)
  private readonly MOUSE_SAMPLE_INTERVAL = 50;

  constructor(config: Partial<CollectorConfig>) {
    this.config = {
      endpoint: '/api/analytics/events',
      sessionId: this.generateSessionId(),
      userId: '',
      batchSize: 50,
      flushInterval: 10000, // 10 seconds
      enableMouseTracking: true,
      enableKeystrokeTracking: true,
      samplingRate: 1.0,
      ...config,
    };
  }

  /**
   * Initialize the collector and start tracking
   */
  public start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Set up event listeners
    if (this.config.enableKeystrokeTracking) {
      document.addEventListener('keydown', this.handleKeydown);
      document.addEventListener('keyup', this.handleKeyup);
    }

    if (this.config.enableMouseTracking) {
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('click', this.handleClick);
      document.addEventListener('scroll', this.handleScroll, { passive: true });
    }

    // Page visibility tracking
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Focus tracking for composition
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('blur', this.handleWindowBlur);

    // Start flush timer
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);

    // Track page load
    this.trackEvent('page_view', {
      url: window.location.pathname,
      referrer: document.referrer,
      loadTime: Date.now() - this.pageLoadTime,
    });

    // Track page unload
    window.addEventListener('beforeunload', this.handleUnload);
  }

  /**
   * Stop tracking and cleanup
   */
  public stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('keyup', this.handleKeyup);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('beforeunload', this.handleUnload);

    // Clear timer and flush remaining events
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }

  /**
   * Set the user ID (call after authentication)
   */
  public setUserId(userId: string): void {
    this.config.userId = userId;
  }

  // ===========================================================================
  // MESSAGE COMPOSITION TRACKING
  // ===========================================================================

  /**
   * Call when user starts composing a message
   */
  public startComposition(inputId?: string): void {
    this.compositionState = {
      startTime: Date.now(),
      keystrokes: [],
      content: [],
      focusLostAt: [],
      focusRestoredAt: [],
      pasteEvents: [],
    };

    this.trackEvent('message_start', { inputId });
  }

  /**
   * Call when user submits the message
   */
  public endComposition(messageId: string, finalContent: string): void {
    if (!this.compositionState) return;

    const endTime = Date.now();
    const keystrokes = this.compositionState.keystrokes;

    // Calculate metrics
    const composition = this.analyzeComposition(
      this.compositionState,
      endTime,
      finalContent
    );

    this.trackEvent('message_submit', {
      messageId,
      ...composition,
    });

    this.compositionState = null;
  }

  /**
   * Track paste events during composition
   */
  public trackPaste(): void {
    if (this.compositionState) {
      this.compositionState.pasteEvents.push(Date.now());
    }
    this.trackEvent('paste', { timestamp: Date.now() });
  }

  /**
   * Track content changes during composition
   */
  public trackContentChange(content: string): void {
    if (this.compositionState) {
      this.compositionState.content.push(content);
    }
  }

  // ===========================================================================
  // READING TIME TRACKING
  // ===========================================================================

  /**
   * Track when a message becomes visible for reading time calculation
   */
  public trackMessageVisible(messageId: string, messageLength: number): void {
    this.trackEvent('message_read', {
      messageId,
      messageLength,
      visibleAt: Date.now(),
    });
  }

  /**
   * Track when user starts typing after reading (to calculate reading time)
   */
  public trackReadingComplete(messageId: string): void {
    this.trackEvent('reading_complete', {
      messageId,
      completedAt: Date.now(),
    });
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  private handleKeydown = (e: globalThis.KeyboardEvent): void => {
    if (!this.shouldSample()) return;

    const keystroke: KeystrokeEvent = {
      key: this.sanitizeKey(e.key),
      timestamp: Date.now(),
      keyCode: e.keyCode,
      isModifier: e.ctrlKey || e.altKey || e.metaKey,
    };

    this.keystrokeBuffer.push(keystroke);

    // Add to composition state if active
    if (this.compositionState) {
      this.compositionState.keystrokes.push(keystroke);
    }

    // Batch keystrokes
    if (this.keystrokeBuffer.length >= 20) {
      this.flushKeystrokes();
    }
  };

  private handleKeyup = (_e: globalThis.KeyboardEvent): void => {
    // Track key release timing if needed for dwell time analysis
  };

  private handleMouseMove = (e: globalThis.MouseEvent): void => {
    const now = Date.now();

    // Sample mouse events to reduce volume
    if (now - this.lastMouseEvent < this.MOUSE_SAMPLE_INTERVAL) return;
    if (!this.shouldSample()) return;

    this.lastMouseEvent = now;

    this.mouseBuffer.push({
      x: e.clientX,
      y: e.clientY,
      timestamp: now,
      type: 'move',
    });

    // Batch mouse events
    if (this.mouseBuffer.length >= 100) {
      this.flushMouseEvents();
    }
  };

  private handleClick = (e: globalThis.MouseEvent): void => {
    if (!this.shouldSample()) return;

    this.mouseBuffer.push({
      x: e.clientX,
      y: e.clientY,
      timestamp: Date.now(),
      type: 'click',
      button: e.button,
    });
  };

  private handleScroll = (): void => {
    if (!this.shouldSample()) return;

    this.mouseBuffer.push({
      x: window.scrollX,
      y: window.scrollY,
      timestamp: Date.now(),
      type: 'scroll',
      scrollDelta: window.scrollY,
    });
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.trackEvent('tab_blur', { timestamp: Date.now() });
      if (this.compositionState) {
        this.compositionState.focusLostAt.push(Date.now());
      }
    } else {
      this.trackEvent('tab_focus', { timestamp: Date.now() });
      if (this.compositionState) {
        this.compositionState.focusRestoredAt.push(Date.now());
      }
    }
  };

  private handleWindowFocus = (): void => {
    this.trackEvent('window_focus', { timestamp: Date.now() });
  };

  private handleWindowBlur = (): void => {
    this.trackEvent('window_blur', { timestamp: Date.now() });
  };

  private handleUnload = (): void => {
    this.trackEvent('page_leave', {
      url: window.location.pathname,
      duration: Date.now() - this.pageLoadTime,
    });
    this.flush(true); // Synchronous flush on unload
  };

  // ===========================================================================
  // DATA PROCESSING
  // ===========================================================================

  private analyzeComposition(
    state: CompositionState,
    endTime: number,
    finalContent: string
  ): Record<string, unknown> {
    const keystrokes = state.keystrokes;
    const totalDurationMs = endTime - state.startTime;

    // Calculate inter-key timings
    const interKeyTimes: number[] = [];
    for (let i = 1; i < keystrokes.length; i++) {
      interKeyTimes.push(keystrokes[i].timestamp - keystrokes[i - 1].timestamp);
    }

    // Calculate active vs idle time
    let activeDurationMs = 0;
    let lastKeystroke = state.startTime;
    const IDLE_THRESHOLD = 2000; // 2 seconds

    for (const ks of keystrokes) {
      const gap = ks.timestamp - lastKeystroke;
      if (gap < IDLE_THRESHOLD) {
        activeDurationMs += gap;
      }
      lastKeystroke = ks.timestamp;
    }

    // Count backspaces
    const backspaceCount = keystrokes.filter(
      (k) => k.key === 'Backspace' || k.key === 'Delete'
    ).length;

    // Calculate WPM
    const wordCount = finalContent.split(/\s+/).filter(Boolean).length;
    const effectiveWPM = wordCount / (totalDurationMs / 60000);
    const rawWPM = (keystrokes.length / 5) / (activeDurationMs / 60000);

    // Focus loss analysis
    let focusLostDurationMs = 0;
    for (let i = 0; i < state.focusLostAt.length; i++) {
      const lostAt = state.focusLostAt[i];
      const restoredAt = state.focusRestoredAt[i] || endTime;
      focusLostDurationMs += restoredAt - lostAt;
    }

    return {
      compositionStartTime: state.startTime,
      compositionEndTime: endTime,
      totalDurationMs,
      activeDurationMs,
      keystrokeCount: keystrokes.length,
      backspaceCount,
      pasteCount: state.pasteEvents.length,
      draftVersions: state.content.length,
      finalLength: finalContent.length,
      maxLength: Math.max(...state.content.map((c) => c.length), finalContent.length),
      focusLostCount: state.focusLostAt.length,
      focusLostDurationMs,
      effectiveWPM: Math.round(effectiveWPM * 100) / 100,
      rawWPM: Math.round(rawWPM * 100) / 100,
      editRatio:
        keystrokes.length > 0
          ? Math.round(((keystrokes.length - finalContent.length) / finalContent.length) * 100) / 100
          : 0,
      // Include timing distribution for server-side analysis
      interKeyTimings: this.summarizeTimings(interKeyTimes),
    };
  }

  private summarizeTimings(times: number[]): Record<string, number> {
    if (times.length === 0) {
      return { mean: 0, std: 0, min: 0, max: 0, median: 0 };
    }

    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance =
      times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
    const std = Math.sqrt(variance);

    return {
      mean: Math.round(mean * 100) / 100,
      std: Math.round(std * 100) / 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      count: times.length,
    };
  }

  private sanitizeKey(key: string): string {
    // Don't log actual characters for privacy - only log key types
    if (key.length === 1) {
      if (/[a-zA-Z]/.test(key)) return 'letter';
      if (/[0-9]/.test(key)) return 'digit';
      if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(key)) return 'symbol';
      return 'other';
    }
    // Allow modifier and control keys
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Enter',
      'Tab',
      'Escape',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Shift',
      'Control',
      'Alt',
      'Meta',
      'Space',
    ];
    return allowedKeys.includes(key) ? key : 'special';
  }

  // ===========================================================================
  // EVENT QUEUE MANAGEMENT
  // ===========================================================================

  private trackEvent(eventType: string, payload: Record<string, unknown>): void {
    this.eventQueue.push({
      eventType,
      timestamp: Date.now(),
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      payload,
      metadata: this.getMetadata(),
    });

    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  private flushKeystrokes(): void {
    if (this.keystrokeBuffer.length === 0) return;

    this.trackEvent('keystroke_batch', {
      keystrokes: this.keystrokeBuffer.map((k) => ({
        key: k.key,
        timestamp: k.timestamp,
        isModifier: k.isModifier,
      })),
      timings: this.summarizeTimings(
        this.keystrokeBuffer
          .slice(1)
          .map((k, i) => k.timestamp - this.keystrokeBuffer[i].timestamp)
      ),
    });

    this.keystrokeBuffer = [];
  }

  private flushMouseEvents(): void {
    if (this.mouseBuffer.length === 0) return;

    // Calculate movement statistics
    const movements = this.mouseBuffer.filter((e) => e.type === 'move');
    const velocities: number[] = [];
    const angles: number[] = [];

    for (let i = 1; i < movements.length; i++) {
      const dx = movements[i].x - movements[i - 1].x;
      const dy = movements[i].y - movements[i - 1].y;
      const dt = movements[i].timestamp - movements[i - 1].timestamp;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (dt > 0) {
        velocities.push(distance / dt);
        angles.push(Math.atan2(dy, dx));
      }
    }

    this.trackEvent('mouse_batch', {
      movementCount: movements.length,
      clickCount: this.mouseBuffer.filter((e) => e.type === 'click').length,
      scrollCount: this.mouseBuffer.filter((e) => e.type === 'scroll').length,
      velocityStats: this.summarizeTimings(velocities),
      // Angle entropy indicates path randomness (bots are often linear)
      angleVariance:
        angles.length > 1
          ? angles.reduce(
              (sum, a, i) => (i > 0 ? sum + Math.abs(a - angles[i - 1]) : sum),
              0
            ) / (angles.length - 1)
          : 0,
    });

    this.mouseBuffer = [];
  }

  private async flush(sync: boolean = false): Promise<void> {
    // Flush any remaining keystroke/mouse buffers
    this.flushKeystrokes();
    this.flushMouseEvents();

    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    const payload = {
      events,
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      timestamp: Date.now(),
    };

    if (sync && navigator.sendBeacon) {
      // Use sendBeacon for reliable delivery on page unload
      navigator.sendBeacon(
        this.config.endpoint,
        JSON.stringify(payload)
      );
    } else {
      try {
        await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true, // Allow request to outlive page
        });
      } catch (error) {
        // Re-queue events on failure
        this.eventQueue.push(...events);
        console.error('Failed to send analytics events:', error);
      }
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }

  private getMetadata(): Record<string, string> {
    return {
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      deviceType: this.detectDeviceType(),
    };
  }

  private detectDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const ua = navigator.userAgent.toLowerCase();
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (
      /mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)
    ) {
      return 'mobile';
    }
    return 'desktop';
  }

  /**
   * Get device fingerprint for fraud detection
   * Note: This is a simplified version. Production should use more signals.
   */
  public getDeviceFingerprint(): string {
    const components = [
      navigator.userAgent,
      navigator.language,
      window.screen.width,
      window.screen.height,
      window.screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      // Add more stable signals as needed
    ];

    return this.hashString(components.join('|'));
  }

  private hashString(str: string): string {
    // Simple hash for fingerprinting (use crypto.subtle in production)
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

// =============================================================================
// SINGLETON INSTANCE FOR EASY IMPORT
// =============================================================================

let collectorInstance: BehavioralCollector | null = null;

export function initCollector(config: Partial<CollectorConfig>): BehavioralCollector {
  if (!collectorInstance) {
    collectorInstance = new BehavioralCollector(config);
    collectorInstance.start();
  }
  return collectorInstance;
}

export function getCollector(): BehavioralCollector | null {
  return collectorInstance;
}
