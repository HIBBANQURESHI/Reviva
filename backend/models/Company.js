const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  domain: {
    type: String,
    required: true,
    unique: true,
  },
  industry: String,
  size: {
    type: String,
    enum: ['small', 'medium', 'large', 'enterprise'],
  },
  settings: {
    timezone: { type: String, default: 'America/New_York' },
    currency: { type: String, default: 'USD' },
    fiscalYearStart: { type: String, default: '01-01' },
  },
  integrations: {
    quickbooks: {
      connected: { type: Boolean, default: false },
      realmId: String,
      accessToken: String,
      refreshToken: String,
      tokenExpiresAt: Date,
      lastSync: Date,
    },
    payoneer: {
      connected: { type: Boolean, default: false },
      accountId: String,
      lastSync: Date,
    },
  },
  billingInfo: {
    accountName: String,
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    swiftCode: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Company', companySchema);