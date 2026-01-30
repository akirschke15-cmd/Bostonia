/**
 * Network Analysis for Fraud Detection
 *
 * Analyzes user-creator interaction graphs to detect:
 * - Suspicious clustering of users around specific creators
 * - Collusion rings (creators using fake accounts to inflate metrics)
 * - Coordinated inauthentic behavior
 */

import type {
  InteractionEdge,
  UserCluster,
  CollusionRing,
  CollusionEvidence,
} from '../models/schemas.js';

// =============================================================================
// TYPES
// =============================================================================

interface UserNode {
  userId: string;
  createdAt: Date;
  ipHashes: string[];
  deviceFingerprints: string[];
  totalSpend: number;
  totalMessages: number;
  conversationCount: number;
  activityHours: number[]; // 24-element histogram
  behavioralVector: number[]; // Feature embedding
}

interface CreatorNode {
  creatorId: string;
  characterIds: string[];
  totalRevenue: number;
  uniqueUsers: number;
  newAccountRatio: number; // % of revenue from accounts < 7 days old
}

interface InteractionGraph {
  users: Map<string, UserNode>;
  creators: Map<string, CreatorNode>;
  edges: InteractionEdge[];
}

interface ClusteringResult {
  clusters: UserCluster[];
  outliers: string[];
  metrics: {
    silhouetteScore: number;
    daviesBouldinIndex: number;
    totalClusters: number;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const THRESHOLDS = {
  // Clustering
  MIN_CLUSTER_SIZE: 3,
  MAX_CLUSTER_DISTANCE: 0.5,
  IP_SHARING_WEIGHT: 3.0,
  DEVICE_SHARING_WEIGHT: 2.5,
  ACTIVITY_CORRELATION_WEIGHT: 2.0,

  // Collusion detection
  NEW_ACCOUNT_AGE_DAYS: 7,
  NEW_ACCOUNT_REVENUE_THRESHOLD: 0.3, // 30% revenue from new accounts
  REGISTRATION_TIME_WINDOW_HOURS: 24,
  MIN_COLLUSION_CONFIDENCE: 0.6,

  // Velocity checks
  MAX_NEW_USERS_PER_HOUR: 10,
  MAX_MESSAGES_PER_MINUTE: 5,
  MAX_SPEND_PER_DAY_NEW_ACCOUNT: 100, // dollars
};

// =============================================================================
// NETWORK ANALYZER CLASS
// =============================================================================

export class NetworkAnalyzer {
  /**
   * Build interaction graph from raw data
   */
  public buildGraph(
    edges: InteractionEdge[],
    users: UserNode[],
    creators: CreatorNode[]
  ): InteractionGraph {
    const userMap = new Map<string, UserNode>();
    const creatorMap = new Map<string, CreatorNode>();

    for (const user of users) {
      userMap.set(user.userId, user);
    }

    for (const creator of creators) {
      creatorMap.set(creator.creatorId, creator);
    }

    return { users: userMap, creators: creatorMap, edges };
  }

  /**
   * Detect suspicious user clusters using DBSCAN-style clustering
   */
  public detectClusters(graph: InteractionGraph): ClusteringResult {
    const users = Array.from(graph.users.values());
    const n = users.length;

    if (n < THRESHOLDS.MIN_CLUSTER_SIZE) {
      return {
        clusters: [],
        outliers: users.map((u) => u.userId),
        metrics: { silhouetteScore: 0, daviesBouldinIndex: 0, totalClusters: 0 },
      };
    }

    // Calculate distance matrix
    const distances: number[][] = [];
    for (let i = 0; i < n; i++) {
      distances[i] = [];
      for (let j = 0; j < n; j++) {
        distances[i][j] = i === j ? 0 : this.calculateUserDistance(users[i], users[j]);
      }
    }

    // Simple density-based clustering
    const clusters: UserCluster[] = [];
    const visited = new Set<number>();
    const clustered = new Set<number>();

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      visited.add(i);

      // Find neighbors
      const neighbors = this.getNeighbors(distances, i, THRESHOLDS.MAX_CLUSTER_DISTANCE);

      if (neighbors.length >= THRESHOLDS.MIN_CLUSTER_SIZE - 1) {
        // Start a new cluster
        const clusterIndices = new Set([i, ...neighbors]);

        // Expand cluster
        for (const neighborIdx of neighbors) {
          if (visited.has(neighborIdx)) continue;
          visited.add(neighborIdx);

          const neighborNeighbors = this.getNeighbors(
            distances,
            neighborIdx,
            THRESHOLDS.MAX_CLUSTER_DISTANCE
          );

          if (neighborNeighbors.length >= THRESHOLDS.MIN_CLUSTER_SIZE - 1) {
            neighborNeighbors.forEach((nn) => clusterIndices.add(nn));
          }
        }

        // Mark as clustered
        clusterIndices.forEach((idx) => clustered.add(idx));

        // Create cluster object
        const clusterUsers = Array.from(clusterIndices).map((idx) => users[idx]);
        const cluster = this.createClusterObject(clusterUsers, graph);
        clusters.push(cluster);
      }
    }

    // Find outliers
    const outliers = users
      .filter((_, i) => !clustered.has(i))
      .map((u) => u.userId);

    // Calculate metrics
    const metrics = this.calculateClusteringMetrics(clusters, distances, users);

    return { clusters, outliers, metrics };
  }

  /**
   * Detect potential collusion rings
   */
  public detectCollusionRings(
    graph: InteractionGraph,
    clusters: UserCluster[]
  ): CollusionRing[] {
    const rings: CollusionRing[] = [];

    // For each creator, check for suspicious patterns
    for (const [creatorId, creator] of graph.creators) {
      const evidence: CollusionEvidence[] = [];
      let confidenceScore = 0;

      // 1. Check new account revenue concentration
      const creatorEdges = graph.edges.filter((e) => e.creatorId === creatorId);
      const newAccountRevenue = this.calculateNewAccountRevenue(creatorEdges, graph.users);

      if (newAccountRevenue.ratio > THRESHOLDS.NEW_ACCOUNT_REVENUE_THRESHOLD) {
        evidence.push({
          type: 'registration_pattern',
          description: `${(newAccountRevenue.ratio * 100).toFixed(1)}% of revenue from accounts < 7 days old`,
          strength: Math.min(1, newAccountRevenue.ratio * 1.5),
          dataPoints: newAccountRevenue,
        });
        confidenceScore += 0.25;
      }

      // 2. Check for clusters focused on this creator
      const relatedClusters = clusters.filter((c) =>
        c.sharedCreators.includes(creatorId)
      );

      for (const cluster of relatedClusters) {
        if (cluster.clusterRiskScore > 50) {
          evidence.push({
            type: 'network_pattern',
            description: `Suspicious cluster of ${cluster.size} users focused on this creator`,
            strength: cluster.clusterRiskScore / 100,
            dataPoints: {
              clusterId: cluster.id,
              clusterSize: cluster.size,
              riskScore: cluster.clusterRiskScore,
            },
          });
          confidenceScore += 0.3;
        }
      }

      // 3. Check registration time patterns
      const registrationPattern = this.analyzeRegistrationTimes(creatorEdges, graph.users);
      if (registrationPattern.suspicious) {
        evidence.push({
          type: 'timing_correlation',
          description: registrationPattern.description,
          strength: registrationPattern.strength,
          dataPoints: registrationPattern.details,
        });
        confidenceScore += 0.2;
      }

      // 4. Check behavioral similarity among creator's users
      const behaviorPattern = this.analyzeBehavioralSimilarity(creatorEdges, graph.users);
      if (behaviorPattern.suspicious) {
        evidence.push({
          type: 'behavioral_similarity',
          description: behaviorPattern.description,
          strength: behaviorPattern.strength,
          dataPoints: behaviorPattern.details,
        });
        confidenceScore += 0.25;
      }

      // Create collusion ring if confidence is high enough
      if (confidenceScore >= THRESHOLDS.MIN_COLLUSION_CONFIDENCE && evidence.length >= 2) {
        const suspectUserIds = creatorEdges
          .filter((e) => {
            const user = graph.users.get(e.userId);
            return user && this.isNewAccount(user);
          })
          .map((e) => e.userId);

        rings.push({
          id: `ring_${creatorId}_${Date.now()}`,
          creatorId,
          suspectUserIds,
          evidence,
          totalSuspiciousRevenue: creatorEdges
            .filter((e) => suspectUserIds.includes(e.userId))
            .reduce((sum, e) => sum + e.totalSpend, 0),
          detectionMethod: 'network_analysis',
          confidenceScore: Math.min(1, confidenceScore),
          detectedAt: new Date(),
          status: 'detected',
        });
      }
    }

    return rings;
  }

  /**
   * Analyze velocity patterns for suspicious activity
   */
  public analyzeVelocity(
    userId: string,
    recentActivity: Array<{ timestamp: Date; type: string; amount?: number }>
  ): { suspicious: boolean; flags: string[]; score: number } {
    const flags: string[] = [];
    let score = 0;

    // Group by hour
    const hourlyActivity = new Map<string, number>();
    const minuteActivity = new Map<string, number>();

    for (const activity of recentActivity) {
      const hourKey = activity.timestamp.toISOString().slice(0, 13);
      const minuteKey = activity.timestamp.toISOString().slice(0, 16);

      hourlyActivity.set(hourKey, (hourlyActivity.get(hourKey) || 0) + 1);
      if (activity.type === 'message') {
        minuteActivity.set(minuteKey, (minuteActivity.get(minuteKey) || 0) + 1);
      }
    }

    // Check hourly velocity
    for (const [hour, count] of hourlyActivity) {
      if (count > THRESHOLDS.MAX_NEW_USERS_PER_HOUR * 2) {
        flags.push(`Excessive activity in ${hour}: ${count} actions`);
        score += 30;
      }
    }

    // Check message velocity
    for (const [minute, count] of minuteActivity) {
      if (count > THRESHOLDS.MAX_MESSAGES_PER_MINUTE) {
        flags.push(`Message spam detected: ${count} messages/minute at ${minute}`);
        score += 40;
      }
    }

    // Check spending velocity
    const totalSpend = recentActivity
      .filter((a) => a.amount)
      .reduce((sum, a) => sum + (a.amount || 0), 0);
    const dayCount = Math.ceil(
      (Date.now() - recentActivity[0]?.timestamp.getTime() || 1) / (24 * 60 * 60 * 1000)
    );
    const avgDailySpend = totalSpend / Math.max(1, dayCount);

    if (avgDailySpend > THRESHOLDS.MAX_SPEND_PER_DAY_NEW_ACCOUNT) {
      flags.push(`High spending rate: $${avgDailySpend.toFixed(2)}/day`);
      score += 25;
    }

    return {
      suspicious: flags.length > 0,
      flags,
      score: Math.min(100, score),
    };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Calculate distance between two users based on multiple factors
   */
  private calculateUserDistance(user1: UserNode, user2: UserNode): number {
    let distance = 1; // Start at max distance

    // IP sharing (very strong signal)
    const sharedIps = user1.ipHashes.filter((ip) => user2.ipHashes.includes(ip));
    if (sharedIps.length > 0) {
      distance -= sharedIps.length * 0.2 * THRESHOLDS.IP_SHARING_WEIGHT;
    }

    // Device fingerprint sharing
    const sharedDevices = user1.deviceFingerprints.filter(
      (d) => user2.deviceFingerprints.includes(d)
    );
    if (sharedDevices.length > 0) {
      distance -= sharedDevices.length * 0.15 * THRESHOLDS.DEVICE_SHARING_WEIGHT;
    }

    // Activity time correlation
    const activityCorrelation = this.calculateCorrelation(
      user1.activityHours,
      user2.activityHours
    );
    if (activityCorrelation > 0.8) {
      distance -= (activityCorrelation - 0.8) * THRESHOLDS.ACTIVITY_CORRELATION_WEIGHT;
    }

    // Behavioral vector similarity (if available)
    if (user1.behavioralVector.length > 0 && user2.behavioralVector.length > 0) {
      const behaviorSimilarity = this.cosineSimilarity(
        user1.behavioralVector,
        user2.behavioralVector
      );
      distance -= behaviorSimilarity * 0.3;
    }

    // Registration time proximity
    const registrationGap = Math.abs(
      user1.createdAt.getTime() - user2.createdAt.getTime()
    );
    const registrationGapHours = registrationGap / (60 * 60 * 1000);
    if (registrationGapHours < THRESHOLDS.REGISTRATION_TIME_WINDOW_HOURS) {
      distance -= (1 - registrationGapHours / THRESHOLDS.REGISTRATION_TIME_WINDOW_HOURS) * 0.2;
    }

    return Math.max(0, distance);
  }

  /**
   * Get neighbor indices within distance threshold
   */
  private getNeighbors(distances: number[][], idx: number, threshold: number): number[] {
    const neighbors: number[] = [];
    for (let i = 0; i < distances[idx].length; i++) {
      if (i !== idx && distances[idx][i] < threshold) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  /**
   * Create cluster object from user nodes
   */
  private createClusterObject(users: UserNode[], graph: InteractionGraph): UserCluster {
    const userIds = users.map((u) => u.userId);

    // Find shared characteristics
    const allIps = users.flatMap((u) => u.ipHashes);
    const ipCounts = this.countOccurrences(allIps);
    const sharedIpHashes = Object.entries(ipCounts)
      .filter(([_, count]) => count > 1)
      .map(([ip]) => ip);

    const allDevices = users.flatMap((u) => u.deviceFingerprints);
    const deviceCounts = this.countOccurrences(allDevices);
    const sharedDeviceFingerprints = Object.entries(deviceCounts)
      .filter(([_, count]) => count > 1)
      .map(([device]) => device);

    // Find shared creators
    const creatorCounts: Record<string, number> = {};
    for (const edge of graph.edges) {
      if (userIds.includes(edge.userId)) {
        creatorCounts[edge.creatorId] = (creatorCounts[edge.creatorId] || 0) + 1;
      }
    }
    const sharedCreators = Object.entries(creatorCounts)
      .filter(([_, count]) => count > users.length * 0.5)
      .map(([creatorId]) => creatorId);

    // Calculate activity correlation
    const activityCorrelation = this.calculateGroupActivityCorrelation(users);

    // Calculate registration time spread
    const timestamps = users.map((u) => u.createdAt.getTime());
    const registrationTimeSpread = (Math.max(...timestamps) - Math.min(...timestamps)) / (60 * 60 * 1000);

    // Calculate risk score
    const riskFactors: string[] = [];
    let riskScore = 0;

    if (sharedIpHashes.length > 0) {
      riskFactors.push(`Shared IPs: ${sharedIpHashes.length}`);
      riskScore += sharedIpHashes.length * 15;
    }
    if (sharedDeviceFingerprints.length > 0) {
      riskFactors.push(`Shared devices: ${sharedDeviceFingerprints.length}`);
      riskScore += sharedDeviceFingerprints.length * 12;
    }
    if (activityCorrelation > 0.8) {
      riskFactors.push(`High activity correlation: ${(activityCorrelation * 100).toFixed(0)}%`);
      riskScore += 20;
    }
    if (registrationTimeSpread < THRESHOLDS.REGISTRATION_TIME_WINDOW_HOURS) {
      riskFactors.push(`Accounts created within ${registrationTimeSpread.toFixed(1)} hours`);
      riskScore += 25;
    }
    if (sharedCreators.length === 1) {
      riskFactors.push(`All users interact with single creator`);
      riskScore += 15;
    }

    return {
      id: `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userIds,
      size: users.length,
      centroid: this.calculateCentroid(users),
      density: users.length / (users.length + 1), // Simplified density
      silhouetteScore: 0, // Calculate separately if needed
      sharedIpHashes,
      sharedDeviceFingerprints,
      sharedCreators,
      sharedBehavioralPatterns: [], // Would need more analysis
      activityCorrelation,
      registrationTimeSpread,
      clusterRiskScore: Math.min(100, riskScore),
      riskFactors,
      detectedAt: new Date(),
      status: 'pending_review',
    };
  }

  /**
   * Calculate new account revenue statistics
   */
  private calculateNewAccountRevenue(
    edges: InteractionEdge[],
    users: Map<string, UserNode>
  ): { ratio: number; totalRevenue: number; newAccountRevenue: number; newAccountCount: number } {
    let totalRevenue = 0;
    let newAccountRevenue = 0;
    let newAccountCount = 0;

    for (const edge of edges) {
      totalRevenue += edge.totalSpend;
      const user = users.get(edge.userId);
      if (user && this.isNewAccount(user)) {
        newAccountRevenue += edge.totalSpend;
        newAccountCount++;
      }
    }

    return {
      ratio: totalRevenue > 0 ? newAccountRevenue / totalRevenue : 0,
      totalRevenue,
      newAccountRevenue,
      newAccountCount,
    };
  }

  /**
   * Analyze registration time patterns
   */
  private analyzeRegistrationTimes(
    edges: InteractionEdge[],
    users: Map<string, UserNode>
  ): { suspicious: boolean; description: string; strength: number; details: Record<string, unknown> } {
    const registrationTimes: Date[] = [];

    for (const edge of edges) {
      const user = users.get(edge.userId);
      if (user) {
        registrationTimes.push(user.createdAt);
      }
    }

    if (registrationTimes.length < 3) {
      return { suspicious: false, description: '', strength: 0, details: {} };
    }

    // Sort and find clusters of registrations
    registrationTimes.sort((a, b) => a.getTime() - b.getTime());

    let maxBurstSize = 1;
    let currentBurstSize = 1;
    const BURST_WINDOW_MS = THRESHOLDS.REGISTRATION_TIME_WINDOW_HOURS * 60 * 60 * 1000;

    for (let i = 1; i < registrationTimes.length; i++) {
      const gap = registrationTimes[i].getTime() - registrationTimes[i - 1].getTime();
      if (gap < BURST_WINDOW_MS) {
        currentBurstSize++;
        maxBurstSize = Math.max(maxBurstSize, currentBurstSize);
      } else {
        currentBurstSize = 1;
      }
    }

    const burstRatio = maxBurstSize / registrationTimes.length;
    const suspicious = maxBurstSize >= 3 && burstRatio > 0.3;

    return {
      suspicious,
      description: suspicious
        ? `${maxBurstSize} accounts registered within ${THRESHOLDS.REGISTRATION_TIME_WINDOW_HOURS} hours`
        : '',
      strength: suspicious ? Math.min(1, burstRatio * 1.5) : 0,
      details: { maxBurstSize, burstRatio, totalAccounts: registrationTimes.length },
    };
  }

  /**
   * Analyze behavioral similarity among users
   */
  private analyzeBehavioralSimilarity(
    edges: InteractionEdge[],
    users: Map<string, UserNode>
  ): { suspicious: boolean; description: string; strength: number; details: Record<string, unknown> } {
    const vectors: number[][] = [];

    for (const edge of edges) {
      const user = users.get(edge.userId);
      if (user && user.behavioralVector.length > 0) {
        vectors.push(user.behavioralVector);
      }
    }

    if (vectors.length < 3) {
      return { suspicious: false, description: '', strength: 0, details: {} };
    }

    // Calculate pairwise similarities
    const similarities: number[] = [];
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        similarities.push(this.cosineSimilarity(vectors[i], vectors[j]));
      }
    }

    const meanSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const suspicious = meanSimilarity > 0.85;

    return {
      suspicious,
      description: suspicious
        ? `Users have ${(meanSimilarity * 100).toFixed(0)}% behavioral similarity (expected < 85%)`
        : '',
      strength: suspicious ? meanSimilarity : 0,
      details: { meanSimilarity, comparisonCount: similarities.length },
    };
  }

  /**
   * Check if user is a "new" account
   */
  private isNewAccount(user: UserNode): boolean {
    const ageMs = Date.now() - user.createdAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    return ageDays < THRESHOLDS.NEW_ACCOUNT_AGE_DAYS;
  }

  /**
   * Calculate Pearson correlation
   */
  private calculateCorrelation(arr1: number[], arr2: number[]): number {
    if (arr1.length !== arr2.length || arr1.length === 0) return 0;

    const n = arr1.length;
    const mean1 = arr1.reduce((a, b) => a + b, 0) / n;
    const mean2 = arr2.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = arr1[i] - mean1;
      const diff2 = arr2[i] - mean2;
      numerator += diff1 * diff2;
      denom1 += diff1 * diff1;
      denom2 += diff2 * diff2;
    }

    const denom = Math.sqrt(denom1 * denom2);
    return denom > 0 ? numerator / denom : 0;
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length || vec1.length === 0) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denom > 0 ? dotProduct / denom : 0;
  }

  /**
   * Count occurrences in array
   */
  private countOccurrences(arr: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return counts;
  }

  /**
   * Calculate group activity correlation
   */
  private calculateGroupActivityCorrelation(users: UserNode[]): number {
    if (users.length < 2) return 0;

    const correlations: number[] = [];
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        correlations.push(
          this.calculateCorrelation(users[i].activityHours, users[j].activityHours)
        );
      }
    }

    return correlations.length > 0
      ? correlations.reduce((a, b) => a + b, 0) / correlations.length
      : 0;
  }

  /**
   * Calculate centroid of behavioral vectors
   */
  private calculateCentroid(users: UserNode[]): number[] {
    const vectors = users.filter((u) => u.behavioralVector.length > 0).map((u) => u.behavioralVector);

    if (vectors.length === 0) return [];

    const dim = vectors[0].length;
    const centroid: number[] = new Array(dim).fill(0);

    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += vec[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= vectors.length;
    }

    return centroid;
  }

  /**
   * Calculate clustering quality metrics
   */
  private calculateClusteringMetrics(
    clusters: UserCluster[],
    distances: number[][],
    users: UserNode[]
  ): { silhouetteScore: number; daviesBouldinIndex: number; totalClusters: number } {
    // Simplified metrics - would need full implementation for production
    return {
      silhouetteScore: clusters.length > 0 ? 0.5 : 0, // Placeholder
      daviesBouldinIndex: clusters.length > 0 ? 1.0 : 0, // Placeholder
      totalClusters: clusters.length,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const networkAnalyzer = new NetworkAnalyzer();
