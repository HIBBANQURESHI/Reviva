const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Contract = require('../models/Contract');
const Leak = require('../models/Leak');
const logger = require('../utils/logger');

class LeakDetectionService {
  /**
   * Run all leak detection algorithms for a company
   */
  async detectLeaks(companyId) {
    logger.info(`Starting leak detection for company ${companyId}`);

    const results = {
      missingPayments: await this.detectMissingPayments(companyId),
      underBilling: await this.detectUnderBilling(companyId),
      failedRenewals: await this.detectFailedRenewals(companyId),
      agingReceivables: await this.detectAgingReceivables(companyId),
    };

    const totalLeaks = Object.values(results).reduce((sum, r) => sum + r.count, 0);
    logger.info(`Detected ${totalLeaks} total leaks for company ${companyId}`);

    return results;
  }

  /**
   * Algorithm 1: Detect missing or delayed payments
   */
  async detectMissingPayments(companyId) {
    try {
      const invoices = await Invoice.find({
        company: companyId,
        status: { $in: ['sent', 'viewed', 'partial', 'overdue'] },
        balance: { $gt: 0 },
      });

      let detectedCount = 0;

      for (const invoice of invoices) {
        const daysOverdue = Math.floor((Date.now() - invoice.dueDate) / (1000 * 60 * 60 * 24));

        // Only create leak if invoice is overdue
        if (daysOverdue > 0) {
          const existingLeak = await Leak.findOne({
            company: companyId,
            leakType: 'missing_payment',
            'sourceReference.invoiceId': invoice.invoiceNumber,
            status: { $nin: ['recovered', 'written_off'] },
          });

          if (!existingLeak) {
            const priority = this.calculatePriority(invoice.balance, daysOverdue);
            const confidence = this.calculateConfidence('missing_payment', daysOverdue);

            await Leak.create({
              company: companyId,
              leakType: 'missing_payment',
              status: 'detected',
              priority,
              amount: invoice.balance,
              currency: invoice.currency,
              confidence,
              sourceSystem: invoice.sourceSystem,
              sourceReference: {
                invoiceId: invoice.invoiceNumber,
                customerId: invoice.customerId,
              },
              rootCause: `Invoice ${invoice.invoiceNumber} is ${daysOverdue} days overdue`,
              description: `Payment missing for invoice ${invoice.invoiceNumber} to ${invoice.customerName}. Outstanding balance: $${invoice.balance.toFixed(2)}`,
              recommendedAction: daysOverdue > 60
                ? 'Escalate to collections or legal team'
                : 'Send payment reminder and follow up with customer',
              aging: daysOverdue,
            });

            detectedCount++;
          } else {
            // Update aging for existing leak
            await Leak.findByIdAndUpdate(existingLeak._id, {
              aging: daysOverdue,
              amount: invoice.balance,
            });
          }
        }
      }

      return { success: true, count: detectedCount };
    } catch (error) {
      logger.error('Missing payment detection error:', error);
      return { success: false, error: error.message, count: 0 };
    }
  }

  /**
   * Algorithm 2: Detect under-billing (actual vs billed amounts)
   */
  async detectUnderBilling(companyId) {
    try {
      const contracts = await Contract.find({
        company: companyId,
        status: 'active',
      });

      let detectedCount = 0;

      for (const contract of contracts) {
        // Get all invoices for this contract period
        const invoices = await Invoice.find({
          company: companyId,
          issueDate: {
            $gte: contract.startDate,
            $lte: contract.endDate,
          },
        });

        const totalBilled = invoices.reduce((sum, inv) => sum + inv.amount, 0);
        const expectedAmount = this.calculateExpectedBilling(contract);

        // Check if under-billed by more than 5%
        const underBilledAmount = expectedAmount - totalBilled;
        const underBilledPercent = (underBilledAmount / expectedAmount) * 100;

        if (underBilledPercent > 5) {
          const existingLeak = await Leak.findOne({
            company: companyId,
            leakType: 'under_billing',
            'sourceReference.contractId': contract.contractNumber,
            status: { $nin: ['recovered', 'written_off'] },
          });

          if (!existingLeak) {
            await Leak.create({
              company: companyId,
              leakType: 'under_billing',
              status: 'detected',
              priority: underBilledAmount > 10000 ? 'high' : 'medium',
              amount: underBilledAmount,
              currency: 'USD',
              confidence: 85,
              sourceSystem: 'manual',
              sourceReference: {
                contractId: contract.contractNumber,
              },
              rootCause: `Contract ${contract.contractNumber} under-billed by ${underBilledPercent.toFixed(1)}%`,
              description: `Expected billing: $${expectedAmount.toFixed(2)}, Actual: $${totalBilled.toFixed(2)}. Difference: $${underBilledAmount.toFixed(2)}`,
              recommendedAction: 'Review contract terms and issue corrective invoice',
            });

            detectedCount++;
          }
        }
      }

      return { success: true, count: detectedCount };
    } catch (error) {
      logger.error('Under-billing detection error:', error);
      return { success: false, error: error.message, count: 0 };
    }
  }

  /**
   * Algorithm 3: Detect failed renewals
   */
  async detectFailedRenewals(companyId) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Find contracts that expired recently without renewal
      const expiredContracts = await Contract.find({
        company: companyId,
        status: 'active',
        endDate: {
          $gte: thirtyDaysAgo,
          $lte: now,
        },
      });

      let detectedCount = 0;

      for (const contract of expiredContracts) {
        // Check if renewal contract exists
        const renewalExists = await Contract.findOne({
          company: companyId,
          clientCompanyName: contract.clientCompanyName,
          startDate: { $gte: contract.endDate },
        });

        if (!renewalExists) {
          const existingLeak = await Leak.findOne({
            company: companyId,
            leakType: 'failed_renewal',
            'sourceReference.contractId': contract.contractNumber,
            status: { $nin: ['recovered', 'written_off'] },
          });

          if (!existingLeak) {
            const potentialRevenue = contract.pricing.baseFee;

            await Leak.create({
              company: companyId,
              leakType: 'failed_renewal',
              status: 'detected',
              priority: 'high',
              amount: potentialRevenue,
              currency: 'USD',
              confidence: 70,
              sourceSystem: 'manual',
              sourceReference: {
                contractId: contract.contractNumber,
              },
              rootCause: `Contract ${contract.contractNumber} expired without renewal`,
              description: `Contract with ${contract.clientCompanyName} expired on ${contract.endDate.toDateString()}. No renewal detected.`,
              recommendedAction: 'Contact client immediately to discuss renewal terms',
            });

            detectedCount++;
          }
        }
      }

      return { success: true, count: detectedCount };
    } catch (error) {
      logger.error('Failed renewal detection error:', error);
      return { success: false, error: error.message, count: 0 };
    }
  }

  /**
   * Algorithm 4: Detect aging receivables (uncollected for extended period)
   */
  async detectAgingReceivables(companyId) {
    try {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const oldInvoices = await Invoice.find({
        company: companyId,
        status: { $in: ['sent', 'viewed', 'partial', 'overdue'] },
        balance: { $gt: 0 },
        dueDate: { $lte: sixtyDaysAgo },
      });

      let detectedCount = 0;

      for (const invoice of oldInvoices) {
        const existingLeak = await Leak.findOne({
          company: companyId,
          leakType: 'uncollected_receivable',
          'sourceReference.invoiceId': invoice.invoiceNumber,
          status: { $nin: ['recovered', 'written_off'] },
        });

        if (!existingLeak) {
          const daysAging = Math.floor((Date.now() - invoice.dueDate) / (1000 * 60 * 60 * 24));

          await Leak.create({
            company: companyId,
            leakType: 'uncollected_receivable',
            status: 'detected',
            priority: 'critical',
            amount: invoice.balance,
            currency: invoice.currency,
            confidence: 90,
            sourceSystem: invoice.sourceSystem,
            sourceReference: {
              invoiceId: invoice.invoiceNumber,
              customerId: invoice.customerId,
            },
            rootCause: `Invoice ${invoice.invoiceNumber} uncollected for ${daysAging} days`,
            description: `Critical aging receivable from ${invoice.customerName}. Outstanding: $${invoice.balance.toFixed(2)}`,
            recommendedAction: 'Immediate escalation to legal/collections team',
            aging: daysAging,
          });

          detectedCount++;
        }
      }

      return { success: true, count: detectedCount };
    } catch (error) {
      logger.error('Aging receivable detection error:', error);
      return { success: false, error: error.message, count: 0 };
    }
  }

  /**
   * Helper: Calculate priority based on amount and aging
   */
  calculatePriority(amount, daysOverdue) {
    if (amount > 50000 || daysOverdue > 90) return 'critical';
    if (amount > 10000 || daysOverdue > 60) return 'high';
    if (amount > 5000 || daysOverdue > 30) return 'medium';
    return 'low';
  }

  /**
   * Helper: Calculate confidence score
   */
  calculateConfidence(leakType, daysOverdue) {
    // Base confidence
    let confidence = 70;

    // Increase confidence with aging
    if (daysOverdue > 90) confidence = 95;
    else if (daysOverdue > 60) confidence = 90;
    else if (daysOverdue > 30) confidence = 85;
    else if (daysOverdue > 15) confidence = 80;

    return confidence;
  }

  /**
   * Helper: Calculate expected billing from contract
   */
  calculateExpectedBilling(contract) {
    const monthsInContract = Math.ceil(
      (contract.endDate - contract.startDate) / (30 * 24 * 60 * 60 * 1000)
    );

    if (contract.billingFrequency === 'monthly') {
      return contract.pricing.baseFee * monthsInContract;
    } else if (contract.billingFrequency === 'quarterly') {
      return contract.pricing.baseFee * Math.ceil(monthsInContract / 3);
    } else {
      return contract.pricing.baseFee;
    }
  }
}

module.exports = new LeakDetectionService();