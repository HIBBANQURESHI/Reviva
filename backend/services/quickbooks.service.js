const axios = require('axios');
const oauthClient = require('../config/quickbooks');
const Company = require('../models/Company');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const logger = require('../utils/logger');

class QuickBooksService {
  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(companyId) {
    const authUri = oauthClient.authorizeUri({
      scope: [oauthClient.scopes.Accounting, oauthClient.scopes.OpenId],
      state: companyId, // Pass company ID in state
    });
    return authUri;
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleCallback(code, realmId, companyId) {
    try {
      const authResponse = await oauthClient.createToken(code);
      const token = authResponse.getJson();

      // Update company with QuickBooks credentials
      await Company.findByIdAndUpdate(companyId, {
        'integrations.quickbooks.connected': true,
        'integrations.quickbooks.realmId': realmId,
        'integrations.quickbooks.accessToken': token.access_token,
        'integrations.quickbooks.refreshToken': token.refresh_token,
        'integrations.quickbooks.tokenExpiresAt': new Date(Date.now() + token.expires_in * 1000),
        'integrations.quickbooks.lastSync': new Date(),
      });

      logger.info(`QuickBooks connected for company ${companyId}`);
      return true;
    } catch (error) {
      logger.error('QuickBooks OAuth error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token if expired
   */
  async refreshAccessToken(company) {
    try {
      const qbConfig = company.integrations.quickbooks;

      // Check if token needs refresh
      if (new Date() < qbConfig.tokenExpiresAt) {
        return qbConfig.accessToken;
      }

      oauthClient.setToken({
        refresh_token: qbConfig.refreshToken,
      });

      const authResponse = await oauthClient.refresh();
      const token = authResponse.getJson();

      // Update tokens in database
      await Company.findByIdAndUpdate(company._id, {
        'integrations.quickbooks.accessToken': token.access_token,
        'integrations.quickbooks.refreshToken': token.refresh_token,
        'integrations.quickbooks.tokenExpiresAt': new Date(Date.now() + token.expires_in * 1000),
      });

      logger.info(`QuickBooks token refreshed for company ${company._id}`);
      return token.access_token;
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Make API request to QuickBooks
   */
  async makeRequest(company, endpoint, method = 'GET', data = null) {
    try {
      const accessToken = await this.refreshAccessToken(company);
      const realmId = company.integrations.quickbooks.realmId;
      const baseURL = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
        ? 'https://quickbooks.api.intuit.com'
        : 'https://sandbox-quickbooks.api.intuit.com';

      const response = await axios({
        method,
        url: `${baseURL}/v3/company/${realmId}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        data,
      });

      return response.data;
    } catch (error) {
      logger.error('QuickBooks API error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Sync invoices from QuickBooks
   */
  async syncInvoices(company) {
    try {
      logger.info(`Starting invoice sync for company ${company._id}`);

      const response = await this.makeRequest(
        company,
        '/query?query=SELECT * FROM Invoice MAXRESULTS 1000'
      );

      const qbInvoices = response.QueryResponse?.Invoice || [];
      let syncedCount = 0;

      for (const qbInv of qbInvoices) {
        const invoiceData = {
          company: company._id,
          invoiceNumber: qbInv.DocNumber,
          customerId: qbInv.CustomerRef?.value,
          customerName: qbInv.CustomerRef?.name,
          amount: parseFloat(qbInv.TotalAmt || 0),
          currency: qbInv.CurrencyRef?.value || 'USD',
          issueDate: new Date(qbInv.TxnDate),
          dueDate: new Date(qbInv.DueDate),
          status: this.mapQBStatus(qbInv.Balance, qbInv.TotalAmt),
          totalPaid: parseFloat(qbInv.TotalAmt) - parseFloat(qbInv.Balance || 0),
          balance: parseFloat(qbInv.Balance || 0),
          sourceSystem: 'quickbooks',
          quickbooksId: qbInv.Id,
          lineItems: (qbInv.Line || []).map(line => ({
            description: line.Description,
            quantity: line.SalesItemLineDetail?.Qty,
            unitPrice: line.SalesItemLineDetail?.UnitPrice,
            amount: parseFloat(line.Amount || 0),
          })),
        };

        await Invoice.findOneAndUpdate(
          { quickbooksId: qbInv.Id, company: company._id },
          invoiceData,
          { upsert: true, new: true }
        );

        syncedCount++;
      }

      await Company.findByIdAndUpdate(company._id, {
        'integrations.quickbooks.lastSync': new Date(),
      });

      logger.info(`Synced ${syncedCount} invoices for company ${company._id}`);
      return { success: true, count: syncedCount };
    } catch (error) {
      logger.error('Invoice sync error:', error);
      throw error;
    }
  }

  /**
   * Sync payments from QuickBooks
   */
  async syncPayments(company) {
    try {
      logger.info(`Starting payment sync for company ${company._id}`);

      const response = await this.makeRequest(
        company,
        '/query?query=SELECT * FROM Payment MAXRESULTS 1000'
      );

      const qbPayments = response.QueryResponse?.Payment || [];
      let syncedCount = 0;

      for (const qbPmt of qbPayments) {
        const paymentData = {
          company: company._id,
          paymentId: `QB-${qbPmt.Id}`,
          customerId: qbPmt.CustomerRef?.value,
          customerName: qbPmt.CustomerRef?.name,
          amount: parseFloat(qbPmt.TotalAmt || 0),
          currency: qbPmt.CurrencyRef?.value || 'USD',
          paymentDate: new Date(qbPmt.TxnDate),
          paymentMethod: this.mapPaymentMethod(qbPmt.PaymentMethodRef?.name),
          status: 'completed',
          reference: qbPmt.PaymentRefNum,
          sourceSystem: 'quickbooks',
          quickbooksId: qbPmt.Id,
        };

        // Link payment to invoice if available
        if (qbPmt.Line && qbPmt.Line[0]?.LinkedTxn) {
          const linkedInvoiceId = qbPmt.Line[0].LinkedTxn[0]?.TxnId;
          const invoice = await Invoice.findOne({ quickbooksId: linkedInvoiceId });
          if (invoice) {
            paymentData.invoiceId = invoice._id;
          }
        }

        await Payment.findOneAndUpdate(
          { quickbooksId: qbPmt.Id, company: company._id },
          paymentData,
          { upsert: true, new: true }
        );

        syncedCount++;
      }

      logger.info(`Synced ${syncedCount} payments for company ${company._id}`);
      return { success: true, count: syncedCount };
    } catch (error) {
      logger.error('Payment sync error:', error);
      throw error;
    }
  }

  /**
   * Full sync - invoices and payments
   */
  async fullSync(company) {
    const results = {
      invoices: await this.syncInvoices(company),
      payments: await this.syncPayments(company),
    };
    return results;
  }

  /**
   * Helper: Map QuickBooks status to our status
   */
  mapQBStatus(balance, total) {
    const bal = parseFloat(balance || 0);
    const tot = parseFloat(total || 0);

    if (bal <= 0) return 'paid';
    if (bal < tot) return 'partial';
    return 'sent';
  }

  /**
   * Helper: Map payment method
   */
  mapPaymentMethod(qbMethod) {
    const method = (qbMethod || '').toLowerCase();
    if (method.includes('ach') || method.includes('bank')) return 'ach';
    if (method.includes('wire')) return 'wire';
    if (method.includes('check')) return 'check';
    return 'other';
  }
}

module.exports = new QuickBooksService();