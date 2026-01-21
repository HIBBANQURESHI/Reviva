const mongoose = require('mongoose');

const leakSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  leakType: {
    type: String,
    enum: [
      'missing_payment',
      'under_billing',
      'failed_renewal',
      'uncollected_receivable',
      'duplicate_credit',
      'pricing_mismatch',
      'contract_violation'
    ],
    required: true,
  },
  status: {
    type: String,
    enum: ['detected', 'investigating', 'in_recovery', 'recovered', 'written_off'],
    default: 'detected',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'USD',
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 75,
  },
  sourceSystem: {
    type: String,
    enum: ['quickbooks', 'manual_upload', 'erp', 'crm'],
  },
  sourceReference: {
    invoiceId: String,
    customerId: String,
    transactionId: String,
    contractId: String,
  },
  rootCause: String,
  description: String,
  detectedAt: {
    type: Date,
    default: Date.now,
  },
  aging: {
    type: Number, // Days since detection
    default: 0,
  },
  recommendedAction: String,
  recoveryTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecoveryTask',
  },
  recoveredAmount: {
    type: Number,
    default: 0,
  },
  recoveredAt: Date,
  notes: [{
    text: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
});

// Index for efficient queries
leakSchema.index({ company: 1, status: 1, priority: 1 });
leakSchema.index({ detectedAt: -1 });
leakSchema.index({ amount: -1 });

// Calculate aging before saving
leakSchema.pre('save', function(next) {
  if (this.detectedAt) {
    const now = new Date();
    const detected = new Date(this.detectedAt);
    this.aging = Math.floor((now - detected) / (1000 * 60 * 60 * 24));
  }
  next();
});

module.exports = mongoose.model('Leak', leakSchema);