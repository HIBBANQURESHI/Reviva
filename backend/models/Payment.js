const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  paymentId: {
    type: String,
    required: true,
    unique: true,
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
  },
  customerId: String,
  customerName: String,
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'USD',
  },
  paymentDate: {
    type: Date,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['ach', 'wire', 'check', 'other'],
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'completed',
  },
  reference: String,
  sourceSystem: {
    type: String,
    enum: ['quickbooks', 'payoneer', 'manual'],
  },
  quickbooksId: String,
  reconciled: {
    type: Boolean,
    default: false,
  },
  reconciledAt: Date,
  notes: String,
}, {
  timestamps: true,
});

paymentSchema.index({ company: 1, status: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ invoiceId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);