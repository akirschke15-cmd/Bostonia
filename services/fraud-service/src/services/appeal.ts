import { prisma } from '@bostonia/database';
import { logger } from '../lib/logger.js';

type AppealStatus =
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_INFO_REQUESTED'
  | 'DECIDED'
  | 'CLOSED';

type AppealDecision = 'UPHELD' | 'OVERTURNED' | 'PARTIALLY_UPHELD' | 'ESCALATED';

interface SubmitAppealInput {
  caseId: string;
  userId: string;
  contactEmail: string;
  appealReason: string;
  supportingEvidence?: {
    type: 'url' | 'text' | 'file';
    content: string;
    description?: string;
  }[];
}

interface ReviewAppealInput {
  appealId: string;
  reviewerId: string;
  decision: AppealDecision;
  decisionReason: string;
  actionsToReverse?: string[];
  compensationAmount?: number;
  internalNotes?: string;
}

interface Appeal {
  id: string;
  caseId: string;
  appealNumber: string;
  status: AppealStatus;
  userId: string;
  contactEmail: string;
  appealReason: string;
  supportingEvidence: unknown[];
  submittedAt: Date;
  acknowledgedAt?: Date;
  reviewStartedAt?: Date;
  reviewerId?: string;
  internalNotes?: string;
  decision?: AppealDecision;
  decisionReason?: string;
  decidedAt?: Date;
  decidedBy?: string;
  compensationOffered?: number;
  compensationAccepted?: boolean;
}

export class AppealService {
  private appeals: Map<string, Appeal> = new Map();
  private appealCounter = 0;

  /**
   * Submit a new appeal for a fraud case.
   */
  async submitAppeal(input: SubmitAppealInput): Promise<string> {
    // Generate appeal number
    const appealNumber = await this.generateAppealNumber();

    const appeal: Appeal = {
      id: `appeal_${Date.now()}`,
      caseId: input.caseId,
      appealNumber,
      status: 'SUBMITTED',
      userId: input.userId,
      contactEmail: input.contactEmail,
      appealReason: input.appealReason,
      supportingEvidence: input.supportingEvidence || [],
      submittedAt: new Date(),
    };

    this.appeals.set(appeal.id, appeal);

    logger.info(
      {
        appealId: appeal.id,
        appealNumber,
        caseId: input.caseId,
        userId: input.userId,
      },
      'Appeal submitted'
    );

    // Send acknowledgment email
    await this.sendAppealAcknowledgment(appeal);

    // Auto-acknowledge after brief delay
    setTimeout(async () => {
      await this.acknowledgeAppeal(appeal.id);
    }, 60000); // 1 minute delay

    return appeal.id;
  }

  /**
   * Acknowledge receipt of an appeal.
   */
  async acknowledgeAppeal(appealId: string): Promise<void> {
    const appeal = this.appeals.get(appealId);
    if (!appeal) return;

    appeal.status = 'ACKNOWLEDGED';
    appeal.acknowledgedAt = new Date();

    logger.info({ appealId }, 'Appeal acknowledged');

    await this.sendEmail(appeal.contactEmail, {
      subject: `Appeal ${appeal.appealNumber} Received`,
      template: 'appeal_acknowledged',
      data: {
        appealNumber: appeal.appealNumber,
        estimatedReviewTime: '5-7 business days',
      },
    });
  }

  /**
   * Assign an appeal to a reviewer.
   */
  async assignAppeal(appealId: string, reviewerId: string): Promise<void> {
    const appeal = this.appeals.get(appealId);
    if (!appeal) throw new Error('Appeal not found');

    appeal.status = 'UNDER_REVIEW';
    appeal.reviewStartedAt = new Date();
    appeal.reviewerId = reviewerId;

    logger.info({ appealId, reviewerId }, 'Appeal assigned');
  }

  /**
   * Request additional information from appellant.
   */
  async requestAdditionalInfo(appealId: string, requestedInfo: string): Promise<void> {
    const appeal = this.appeals.get(appealId);
    if (!appeal) throw new Error('Appeal not found');

    appeal.status = 'ADDITIONAL_INFO_REQUESTED';
    appeal.internalNotes = `${appeal.internalNotes || ''}\n\n[${new Date().toISOString()}] Requested: ${requestedInfo}`;

    logger.info({ appealId, requestedInfo }, 'Additional info requested');

    await this.sendEmail(appeal.contactEmail, {
      subject: `Additional Information Needed - Appeal ${appeal.appealNumber}`,
      template: 'appeal_info_request',
      data: {
        appealNumber: appeal.appealNumber,
        requestedInfo,
        responseDeadline: new Date(Date.now() + 7 * 86400000),
      },
    });
  }

  /**
   * Submit additional evidence for an appeal.
   */
  async addEvidence(
    appealId: string,
    userId: string,
    evidence: { type: string; content: string; description?: string }
  ): Promise<void> {
    const appeal = this.appeals.get(appealId);

    if (!appeal || appeal.userId !== userId) {
      throw new Error('Appeal not found');
    }

    (appeal.supportingEvidence as unknown[]).push({
      ...evidence,
      addedAt: new Date().toISOString(),
    });

    if (appeal.status === 'ADDITIONAL_INFO_REQUESTED') {
      appeal.status = 'UNDER_REVIEW';
    }

    logger.info({ appealId, evidenceType: evidence.type }, 'Evidence added to appeal');
  }

  /**
   * Review and decide on an appeal.
   */
  async reviewAppeal(input: ReviewAppealInput): Promise<void> {
    const appeal = this.appeals.get(input.appealId);
    if (!appeal) throw new Error('Appeal not found');

    appeal.status = 'DECIDED';
    appeal.decision = input.decision;
    appeal.decisionReason = input.decisionReason;
    appeal.decidedAt = new Date();
    appeal.decidedBy = input.reviewerId;
    appeal.internalNotes = input.internalNotes;
    appeal.compensationOffered = input.compensationAmount;

    logger.info(
      {
        appealId: input.appealId,
        decision: input.decision,
        compensationAmount: input.compensationAmount,
      },
      'Appeal decided'
    );

    // Restore trust score if overturned
    if (input.decision === 'OVERTURNED') {
      // In production, update user trust score
      logger.info({ userId: appeal.userId }, 'Trust score partially restored');
    }

    // Send decision notification
    await this.sendDecisionNotification(appeal, input);
  }

  /**
   * Accept or decline compensation offer.
   */
  async respondToCompensation(appealId: string, userId: string, accepted: boolean): Promise<void> {
    const appeal = this.appeals.get(appealId);

    if (!appeal || appeal.userId !== userId) {
      throw new Error('Appeal not found');
    }

    if (!appeal.compensationOffered) {
      throw new Error('No compensation offered for this appeal');
    }

    appeal.compensationAccepted = accepted;
    appeal.status = 'CLOSED';

    if (accepted && appeal.compensationOffered > 0) {
      // In production, credit compensation to user
      logger.info(
        {
          userId,
          amount: appeal.compensationOffered,
        },
        'Compensation accepted and credited'
      );
    }
  }

  /**
   * Get an appeal by ID.
   */
  async getAppeal(appealId: string): Promise<Appeal | null> {
    return this.appeals.get(appealId) || null;
  }

  /**
   * Get appeals for admin dashboard.
   */
  async getAppeals(options: {
    status?: AppealStatus[];
    reviewerId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = options.page || 1;
    const limit = options.limit || 20;

    let appeals = Array.from(this.appeals.values());

    if (options.status) {
      appeals = appeals.filter((a) => options.status!.includes(a.status));
    }

    if (options.reviewerId) {
      appeals = appeals.filter((a) => a.reviewerId === options.reviewerId);
    }

    appeals.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

    const total = appeals.length;
    const paginatedAppeals = appeals.slice((page - 1) * limit, page * limit);

    return { appeals: paginatedAppeals, total, page, limit };
  }

  // Helper methods

  private async generateAppealNumber(): Promise<string> {
    const year = new Date().getFullYear();
    this.appealCounter++;
    return `APL-${year}-${String(this.appealCounter).padStart(5, '0')}`;
  }

  private async sendAppealAcknowledgment(appeal: Appeal): Promise<void> {
    await this.sendEmail(appeal.contactEmail, {
      subject: `Appeal Submitted - ${appeal.appealNumber}`,
      template: 'appeal_submitted',
      data: {
        appealNumber: appeal.appealNumber,
        submittedAt: appeal.submittedAt,
      },
    });
  }

  private async sendDecisionNotification(appeal: Appeal, decision: ReviewAppealInput): Promise<void> {
    const templates: Record<AppealDecision, string> = {
      UPHELD: 'appeal_denied',
      OVERTURNED: 'appeal_approved',
      PARTIALLY_UPHELD: 'appeal_partial',
      ESCALATED: 'appeal_escalated',
    };

    await this.sendEmail(appeal.contactEmail, {
      subject: `Appeal Decision - ${appeal.appealNumber}`,
      template: templates[decision.decision],
      data: {
        appealNumber: appeal.appealNumber,
        decision: decision.decision,
        reason: decision.decisionReason,
        compensation: decision.compensationAmount,
      },
    });
  }

  private async sendEmail(
    to: string,
    email: { subject: string; template: string; data: Record<string, unknown> }
  ): Promise<void> {
    // In production, use email service
    logger.info({ to, subject: email.subject, template: email.template }, 'Sending email');
  }
}

export const appealService = new AppealService();
