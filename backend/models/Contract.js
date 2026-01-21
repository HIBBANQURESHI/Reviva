const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  contractNumber: {
    type: String,
    required: true,
    unique: true,
  },
  clientCompanyName: {
    type: String,
    required: true,
  },
  contractType: {
    type: String,
    enum: ['annual', 'quarterly', 'monthly', 'custom'],
    default: 'annual',
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'renewed', 'cancelled'],
    default: 'draft',
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  pricing: {
    baseFee: {
      type: Number,
      required: true,
    },
    commissionPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    minimumCommission: Number,
    maximumCommission: Number,
  },
  paymentTerms: {
    type: String,
    enum: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt'],
    default: 'Net 30',
  },
  billingFrequency: {
    type: String,
    enum: ['monthly', 'quarterly', 'annually'],
    default: 'monthly',
  },
  autoRenewal: {
    type: Boolean,
    default: false,
  },
  renewalNoticeDays: {
    type: Number,
    default: 30,
  },
  totalRecoveredRevenue: {
    type: Number,
    default: 0,
  },
  totalCommissionEarned: {
    type: Number,
    default: 0,
  },
  invoices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
  }],
  documents: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  notes: String,
}, {
  timestamps: true,
});

contractSchema.index({ company: 1, status: 1 });
contractSchema.index({ endDate: 1 });

module.exports = mongoose.model('Contract', contractSchema);