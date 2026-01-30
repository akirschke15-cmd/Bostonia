/**
 * Fraud Protection Client SDK
 *
 * Client-side utilities for interacting with the fraud protection system.
 * Handles:
 * - Device fingerprinting
 * - Challenge solving (Proof-of-Work)
 * - Request signing
 * - Session binding
 */

// =============================================================================
// DEVICE FINGERPRINTING
// =============================================================================

export interface DeviceFingerprint {
  browserFingerprint: string;
  screenResolution: string;
  colorDepth: number;
  platform: string;
  plugins: string[];
  webglRenderer: string | null;
  canvasHash: string | null;
  audioHash: string | null;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  timezone: string;
}

/**
 * Collect device fingerprint from browser
 */
export async function collectDeviceFingerprint(): Promise<DeviceFingerprint> {
  const canvas = await getCanvasFingerprint();
  const audio = await getAudioFingerprint();
  const webgl = getWebGLRenderer();

  const fingerprint: DeviceFingerprint = {
    browserFingerprint: '', // Will be computed from other values
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    colorDepth: window.screen.colorDepth,
    platform: navigator.platform,
    plugins: getPluginsList(),
    webglRenderer: webgl,
    canvasHash: canvas,
    audioHash: audio,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  // Compute overall fingerprint hash
  fingerprint.browserFingerprint = await computeHash(JSON.stringify(fingerprint));

  return fingerprint;
}

function getPluginsList(): string[] {
  const plugins: string[] = [];
  for (let i = 0; i < navigator.plugins.length; i++) {
    const plugin = navigator.plugins[i];
    if (plugin) {
      plugins.push(plugin.name);
    }
  }
  return plugins.slice(0, 20); // Limit to 20 plugins
}

function getWebGLRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return null;

    return (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  } catch {
    return null;
  }
}

async function getCanvasFingerprint(): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = 200;
    canvas.height = 50;

    // Draw some text
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Bostonia FP', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Canvas Test', 4, 17);

    const dataUrl = canvas.toDataURL();
    return await computeHash(dataUrl);
  } catch {
    return null;
  }
}

async function getAudioFingerprint(): Promise<string | null> {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return null;

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const analyser = context.createAnalyser();
    const gainNode = context.createGain();
    const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

    gainNode.gain.value = 0; // Mute
    oscillator.type = 'triangle';
    oscillator.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(0);

    return new Promise((resolve) => {
      scriptProcessor.onaudioprocess = function (event) {
        const output = event.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < output.length; i++) {
          sum += Math.abs(output[i]);
        }

        oscillator.disconnect();
        scriptProcessor.disconnect();
        gainNode.disconnect();
        context.close();

        computeHash(sum.toString()).then(resolve).catch(() => resolve(null));
      };

      // Timeout fallback
      setTimeout(() => {
        try {
          oscillator.disconnect();
          scriptProcessor.disconnect();
          gainNode.disconnect();
          context.close();
        } catch {}
        resolve(null);
      }, 1000);
    });
  } catch {
    return null;
  }
}

// =============================================================================
// PROOF-OF-WORK SOLVER
// =============================================================================

export interface PowChallenge {
  challengeId: string;
  prefix: string;
  difficulty: number;
  algorithm: 'sha256' | 'sha3';
  maxIterations: number;
  timeoutMs: number;
}

export interface PowSolution {
  nonce: number;
  hash: string;
  iterations: number;
  timeTaken: number;
}

/**
 * Solve a Proof-of-Work challenge
 * Uses Web Workers if available for better performance
 */
export async function solvePowChallenge(
  challenge: PowChallenge,
  onProgress?: (iterations: number) => void
): Promise<PowSolution | null> {
  const startTime = Date.now();
  const requiredZeros = Math.floor(challenge.difficulty / 4);

  // Use Web Worker if available
  if (typeof Worker !== 'undefined') {
    return solvePowWithWorker(challenge, startTime, onProgress);
  }

  // Fallback to main thread
  return solvePowMainThread(challenge, startTime, requiredZeros, onProgress);
}

async function solvePowMainThread(
  challenge: PowChallenge,
  startTime: number,
  requiredZeros: number,
  onProgress?: (iterations: number) => void
): Promise<PowSolution | null> {
  for (let nonce = 0; nonce < challenge.maxIterations; nonce++) {
    // Check timeout
    if (Date.now() - startTime > challenge.timeoutMs) {
      return null;
    }

    const data = `${challenge.prefix}${nonce}`;
    const hash = await computeHash(data);

    // Check leading zeros
    const leadingZeros = hash.match(/^0*/)?.[0].length || 0;

    if (leadingZeros >= requiredZeros) {
      return {
        nonce,
        hash,
        iterations: nonce + 1,
        timeTaken: Date.now() - startTime,
      };
    }

    // Report progress every 1000 iterations
    if (onProgress && nonce % 1000 === 0) {
      onProgress(nonce);
      // Yield to main thread
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return null;
}

function solvePowWithWorker(
  challenge: PowChallenge,
  startTime: number,
  onProgress?: (iterations: number) => void
): Promise<PowSolution | null> {
  return new Promise((resolve) => {
    // Create inline worker
    const workerCode = `
      self.onmessage = async function(e) {
        const { prefix, difficulty, maxIterations, timeoutMs, startTime } = e.data;
        const requiredZeros = Math.floor(difficulty / 4);

        async function sha256(message) {
          const msgBuffer = new TextEncoder().encode(message);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        for (let nonce = 0; nonce < maxIterations; nonce++) {
          if (Date.now() - startTime > timeoutMs) {
            self.postMessage({ type: 'timeout' });
            return;
          }

          const data = prefix + nonce;
          const hash = await sha256(data);
          const leadingZeros = hash.match(/^0*/)?.[0].length || 0;

          if (leadingZeros >= requiredZeros) {
            self.postMessage({
              type: 'solution',
              nonce,
              hash,
              iterations: nonce + 1,
              timeTaken: Date.now() - startTime
            });
            return;
          }

          if (nonce % 10000 === 0) {
            self.postMessage({ type: 'progress', iterations: nonce });
          }
        }

        self.postMessage({ type: 'exhausted' });
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = (e) => {
      const { type, nonce, hash, iterations, timeTaken } = e.data;

      if (type === 'solution') {
        worker.terminate();
        resolve({ nonce, hash, iterations, timeTaken });
      } else if (type === 'progress' && onProgress) {
        onProgress(iterations);
      } else if (type === 'timeout' || type === 'exhausted') {
        worker.terminate();
        resolve(null);
      }
    };

    worker.postMessage({
      prefix: challenge.prefix,
      difficulty: challenge.difficulty,
      maxIterations: challenge.maxIterations,
      timeoutMs: challenge.timeoutMs,
      startTime,
    });
  });
}

// =============================================================================
// REQUEST SIGNING
// =============================================================================

export interface SigningKey {
  keyId: string;
  secret: string;
}

/**
 * Sign a request for enhanced authentication
 */
export async function signRequest(
  key: SigningKey,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{
  signature: string;
  timestamp: number;
  nonce: string;
}> {
  const timestamp = Date.now();
  const nonce = generateNonce();
  const payloadBase64 = body ? btoa(JSON.stringify(body)) : '';

  const signatureData = `${timestamp}.${nonce}.${method}.${path}.${payloadBase64}`;
  const signature = await computeHmac(key.secret, signatureData);

  return { signature, timestamp, nonce };
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// HONEYPOT HELPERS
// =============================================================================

/**
 * Create honeypot field data
 * Returns timestamp to track form load time
 */
export function initializeHoneypot(): { loadTime: number } {
  return { loadTime: Date.now() };
}

/**
 * Validate honeypot before form submission
 */
export function validateHoneypot(
  honeypotFieldValue: string,
  loadTime: number,
  minSubmitTime = 1500
): { valid: boolean; reason: string | null } {
  // Honeypot field should be empty
  if (honeypotFieldValue && honeypotFieldValue.length > 0) {
    return { valid: false, reason: 'Honeypot field was filled' };
  }

  // Check timing
  const elapsed = Date.now() - loadTime;
  if (elapsed < minSubmitTime) {
    return { valid: false, reason: 'Form submitted too quickly' };
  }

  return { valid: true, reason: null };
}

// =============================================================================
// BEHAVIORAL TRACKING
// =============================================================================

export interface BehavioralMetrics {
  typingDuration: number;
  editCount: number;
  pasteEvents: number;
  keystrokeCount: number;
  mouseMovements: number;
}

/**
 * Create a behavioral tracker for form inputs
 */
export function createBehavioralTracker(): {
  onKeyDown: () => void;
  onPaste: () => void;
  onMouseMove: () => void;
  startTyping: () => void;
  stopTyping: () => void;
  getMetrics: () => BehavioralMetrics;
} {
  let typingStartTime: number | null = null;
  let typingDuration = 0;
  let editCount = 0;
  let pasteEvents = 0;
  let keystrokeCount = 0;
  let mouseMovements = 0;

  return {
    onKeyDown: () => {
      keystrokeCount++;
      editCount++;
    },
    onPaste: () => {
      pasteEvents++;
    },
    onMouseMove: () => {
      mouseMovements++;
    },
    startTyping: () => {
      if (!typingStartTime) {
        typingStartTime = Date.now();
      }
    },
    stopTyping: () => {
      if (typingStartTime) {
        typingDuration += Date.now() - typingStartTime;
        typingStartTime = null;
      }
    },
    getMetrics: () => ({
      typingDuration,
      editCount,
      pasteEvents,
      keystrokeCount,
      mouseMovements,
    }),
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computeHmac(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// SESSION STORAGE
// =============================================================================

const DEVICE_ID_KEY = 'bostonia_device_id';
const SIGNING_KEY_KEY = 'bostonia_signing_key';

/**
 * Get or create persistent device ID
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    deviceId = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Store signing key securely
 */
export function storeSigningKey(key: SigningKey): void {
  // In production, consider using more secure storage
  sessionStorage.setItem(SIGNING_KEY_KEY, JSON.stringify(key));
}

/**
 * Get stored signing key
 */
export function getSigningKey(): SigningKey | null {
  const data = sessionStorage.getItem(SIGNING_KEY_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Clear signing key (e.g., on logout)
 */
export function clearSigningKey(): void {
  sessionStorage.removeItem(SIGNING_KEY_KEY);
}
