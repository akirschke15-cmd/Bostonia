/**
 * Fraud Protection Types
 *
 * Core type definitions for the fraud detection and prevention system.
 */

// =============================================================================
// REQUEST FINGERPRINTING
// =============================================================================

export interface RequestFingerprint {
  // Device & Browser
  userAgent: string;
  acceptLanguage: string;
  acceptEncoding: string;
  connection: string;

  // Network
  clientIp: string;
  forwardedFor: string[];
  realIp: string | null;
  cfConnectingIp: string | null;  // Cloudflare

  // TLS Fingerprint (JA3/JA4)
  ja3Hash: string | null;
  ja4Hash: string | null;
  tlsVersion: string | null;
  tlsCipherSuites: string[];

  // Browser-specific headers
  secChUa: string | null;            // Sec-CH-UA
  secChUaPlatform: string | null;    // Sec-CH-UA-Platform
  secChUaMobile: string | null;      // Sec-CH-UA-Mobile
  secFetchMode: string | null;
  secFetchSite: string | null;
  secFetchDest: string | null;

  // Timing
  requestTimestamp: number;
  timezone: string | null;
}

export interface DeviceFingerprint {
  deviceId: string;           // Generated device ID
  browserFingerprint: string; // Client-side fingerprint hash
  screenResolution: string | null;
  colorDepth: number | null;
  platform: string | null;
  plugins: string[];
  fonts: string[];
  webglRenderer: string | null;
  canvasHash: string | null;
  audioHash: string | null;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
}

export interface SessionFingerprint {
  sessionId: string;
  userId: string;
  deviceId: string;
  ipHistory: string[];
  fingerprintHistory: string[];
  createdAt: Date;
  lastActiveAt: Date;
  isValid: boolean;
  bindingHash: string;  // Hash of device + user binding
}

// =============================================================================
// TRUST SCORING
// =============================================================================

export interface TrustScore {
  userId: string;
  score: number;          // 0-100
  tier: TrustTier;
  factors: TrustFactor[];
  lastUpdated: Date;
  history: TrustScoreChange[];
}

export type TrustTier = 'UNTRUSTED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';

export interface TrustFactor {
  name: string;
  weight: number;
  value: number;
  reason: string;
}

export interface TrustScoreChange {
  timestamp: Date;
  previousScore: number;
  newScore: number;
  reason: string;
  factors: TrustFactor[];
}

// Trust score thresholds
export const TRUST_THRESHOLDS: Record<TrustTier, { min: number; max: number }> = {
  UNTRUSTED: { min: 0, max: 19 },
  LOW: { min: 20, max: 39 },
  MEDIUM: { min: 40, max: 59 },
  HIGH: { min: 60, max: 79 },
  VERIFIED: { min: 80, max: 100 },
};

// =============================================================================
// RATE LIMITING
// =============================================================================

export interface AdaptiveRateLimit {
  userId: string;
  trustTier: TrustTier;
  baseLimit: RateLimitConfig;
  currentLimit: RateLimitConfig;
  multiplier: number;
  adjustments: RateLimitAdjustment[];
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
  cooldownSeconds: number;
}

export interface RateLimitAdjustment {
  timestamp: Date;
  reason: string;
  multiplier: number;
  expiresAt: Date;
}

// Endpoint sensitivity levels
export type EndpointSensitivity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const ENDPOINT_LIMITS: Record<EndpointSensitivity, RateLimitConfig> = {
  LOW: {
    requestsPerSecond: 10,
    requestsPerMinute: 300,
    requestsPerHour: 5000,
    burstLimit: 20,
    cooldownSeconds: 1,
  },
  MEDIUM: {
    requestsPerSecond: 5,
    requestsPerMinute: 100,
    requestsPerHour: 2000,
    burstLimit: 10,
    cooldownSeconds: 2,
  },
  HIGH: {
    requestsPerSecond: 2,
    requestsPerMinute: 30,
    requestsPerHour: 500,
    burstLimit: 5,
    cooldownSeconds: 5,
  },
  CRITICAL: {
    requestsPerSecond: 0.5,
    requestsPerMinute: 10,
    requestsPerHour: 100,
    burstLimit: 2,
    cooldownSeconds: 10,
  },
};

// =============================================================================
// CHALLENGE-RESPONSE
// =============================================================================

export type ChallengeType =
  | 'CAPTCHA'           // Traditional CAPTCHA
  | 'PROOF_OF_WORK'     // Computational challenge
  | 'HONEYPOT'          // Invisible trap fields
  | 'TIMING'            // Request timing analysis
  | 'BEHAVIOR'          // Mouse/keyboard patterns
  | 'MFA'               // Multi-factor authentication
  | 'EMAIL_VERIFY'      // Email verification
  | 'SMS_VERIFY';       // SMS verification

export interface Challenge {
  id: string;
  type: ChallengeType;
  difficulty: number;       // 1-10
  payload: unknown;         // Challenge-specific data
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface ChallengeResult {
  challengeId: string;
  success: boolean;
  timeTaken: number;        // Milliseconds
  response: unknown;
  metadata: Record<string, unknown>;
}

export interface ProofOfWorkChallenge {
  prefix: string;           // String prefix to find hash for
  difficulty: number;       // Number of leading zeros required
  algorithm: 'sha256' | 'sha3';
  maxIterations: number;
  timeoutMs: number;
}

export interface ProofOfWorkSolution {
  nonce: number;
  hash: string;
  iterations: number;
  timeTaken: number;
}

// =============================================================================
// WEBSOCKET PROTECTION
// =============================================================================

export interface WebSocketSession {
  socketId: string;
  userId: string;
  deviceId: string;
  connectionTime: Date;
  lastActivity: Date;
  messageCount: number;
  rateLimitState: WebSocketRateLimit;
  suspicionScore: number;
  flags: WebSocketFlag[];
}

export interface WebSocketRateLimit {
  messagesPerSecond: number;
  messagesPerMinute: number;
  maxMessageSize: number;
  connectionDuration: number;  // Max connection time in seconds
  reconnectCooldown: number;   // Seconds before allowing reconnect
}

export type WebSocketFlag =
  | 'RAPID_RECONNECT'
  | 'MESSAGE_BURST'
  | 'LARGE_PAYLOAD'
  | 'INVALID_HEARTBEAT'
  | 'CONNECTION_POOLING'
  | 'SUSPICIOUS_PATTERN';

export interface WebSocketMetrics {
  connectionRate: number;       // Connections per minute
  disconnectRate: number;
  messageRate: number;
  errorRate: number;
  averageLatency: number;
  uniqueDevices: number;
  poolingDetected: boolean;
}

// =============================================================================
// PAYLOAD ANALYSIS
// =============================================================================

export interface MessageAnalysis {
  messageId: string;
  userId: string;
  content: string;

  // Pattern detection
  isCopyPaste: boolean;
  copyPasteConfidence: number;
  isTemplated: boolean;
  templateId: string | null;

  // Similarity analysis
  similarityScore: number;      // 0-1, similarity to recent messages
  similarMessages: string[];    // IDs of similar messages

  // Behavioral markers
  typingSpeed: number | null;   // Characters per second
  editCount: number;
  pasteEvents: number;

  // Content classification
  contentType: MessageContentType;
  spamScore: number;            // 0-1
  automationScore: number;      // 0-1, likelihood of automation

  // Risk assessment
  riskLevel: RiskLevel;
  flags: ContentFlag[];
}

export type MessageContentType =
  | 'NORMAL'
  | 'SPAM'
  | 'PROMOTIONAL'
  | 'TEMPLATE'
  | 'AUTOMATED'
  | 'SUSPICIOUS';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ContentFlag =
  | 'REPETITIVE'
  | 'RAPID_FIRE'
  | 'COPY_PASTE'
  | 'TEMPLATE_MATCH'
  | 'URL_SPAM'
  | 'CONTACT_INFO_SPAM'
  | 'PROMOTIONAL_CONTENT'
  | 'AUTOMATED_PATTERN'
  | 'SEMANTIC_DUPLICATE';

// =============================================================================
// RESPONSE MANIPULATION
// =============================================================================

export interface ResponsePolicy {
  userId: string;
  policy: ResponsePolicyType;
  reason: string;
  appliedAt: Date;
  expiresAt: Date | null;
  parameters: ResponsePolicyParams;
}

export type ResponsePolicyType =
  | 'NORMAL'              // Standard response
  | 'DELAYED'             // Add artificial delay
  | 'DEGRADED'            // Limited functionality
  | 'SHADOW_BANNED'       // Accept but don't count/process
  | 'BLOCKED';            // Reject with error

export interface ResponsePolicyParams {
  // Delayed response params
  minDelay?: number;      // Milliseconds
  maxDelay?: number;

  // Degraded service params
  featureRestrictions?: string[];
  maxMessageLength?: number;
  maxMessagesPerHour?: number;

  // Shadow ban params
  affectsEarnings?: boolean;
  affectsAnalytics?: boolean;

  // Block params
  errorCode?: string;
  errorMessage?: string;
}

// =============================================================================
// FRAUD DETECTION EVENTS
// =============================================================================

export interface FraudEvent {
  id: string;
  timestamp: Date;
  eventType: FraudEventType;
  severity: FraudSeverity;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string;
  deviceFingerprint: string | null;
  details: Record<string, unknown>;
  action: FraudAction;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  notes: string | null;
}

export type FraudEventType =
  | 'BRUTE_FORCE'
  | 'CREDENTIAL_STUFFING'
  | 'ACCOUNT_TAKEOVER'
  | 'BOT_DETECTION'
  | 'SCRAPING'
  | 'API_ABUSE'
  | 'PAYMENT_FRAUD'
  | 'REVENUE_MANIPULATION'
  | 'FAKE_ENGAGEMENT'
  | 'MULTI_ACCOUNTING'
  | 'DEVICE_SPOOFING'
  | 'IP_SPOOFING'
  | 'SESSION_HIJACKING'
  | 'REPLAY_ATTACK';

export type FraudSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FraudAction =
  | 'LOG_ONLY'
  | 'CHALLENGE'
  | 'RATE_LIMIT'
  | 'DELAY'
  | 'DEGRADE'
  | 'SHADOW_BAN'
  | 'TEMPORARY_BAN'
  | 'PERMANENT_BAN'
  | 'NOTIFY_ADMIN';

// =============================================================================
// REQUEST SIGNING
// =============================================================================

export interface SignedRequest {
  timestamp: number;
  nonce: string;
  signature: string;
  publicKeyId: string;
  payload: string;         // Base64 encoded
}

export interface RequestSigningConfig {
  algorithm: 'HMAC-SHA256' | 'RSA-SHA256' | 'Ed25519';
  timestampTolerance: number;  // Max age of request in seconds
  nonceExpiry: number;         // Nonce validity in seconds
  requireSignature: boolean;
}

// =============================================================================
// DETECTION PATTERNS
// =============================================================================

export interface DetectionPattern {
  id: string;
  name: string;
  type: 'REGEX' | 'ML' | 'RULE' | 'STATISTICAL';
  config: Record<string, unknown>;
  threshold: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationIndicator {
  name: string;
  weight: number;
  detected: boolean;
  confidence: number;
  evidence: string;
}

// Known automation indicators
export const AUTOMATION_INDICATORS: AutomationIndicator[] = [
  { name: 'navigator.webdriver', weight: 0.9, detected: false, confidence: 0, evidence: '' },
  { name: 'headless_browser', weight: 0.8, detected: false, confidence: 0, evidence: '' },
  { name: 'phantom_js', weight: 0.9, detected: false, confidence: 0, evidence: '' },
  { name: 'selenium', weight: 0.9, detected: false, confidence: 0, evidence: '' },
  { name: 'puppeteer', weight: 0.8, detected: false, confidence: 0, evidence: '' },
  { name: 'playwright', weight: 0.8, detected: false, confidence: 0, evidence: '' },
  { name: 'missing_plugins', weight: 0.4, detected: false, confidence: 0, evidence: '' },
  { name: 'inconsistent_timing', weight: 0.6, detected: false, confidence: 0, evidence: '' },
  { name: 'missing_mouse_events', weight: 0.5, detected: false, confidence: 0, evidence: '' },
  { name: 'perfect_timing', weight: 0.7, detected: false, confidence: 0, evidence: '' },
];
