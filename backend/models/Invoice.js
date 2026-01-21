const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
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
  issueDate: {
    type: Date,
    required: true,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  paidDate: Date,
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
  },
  lineItems: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    amount: Number,
    contractReference: String,
  }],
  payments: [{
    paymentId: String,
    amount: Number,
    paidDate: Date,
    method: String,
    reference: String,
  }],
  totalPaid: {
    type: Number,
    default: 0,
  },
  balance: {
    type: Number,
    default: 0,
  },
  sourceSystem: {
    type: String,
    enum: ['quickbooks', 'manual', 'api'],
    default: 'manual',
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

// Calculate balance before saving
invoiceSchema.pre('save', function(next) {
  this.balance = this.amount - this.totalPaid;
  
  // Update status based on payment
  if (this.balance <= 0) {
    this.status = 'paid';
    if (!this.paidDate) this.paidDate = new Date();
  } else if (this.totalPaid > 0 && this.balance > 0) {
    this.status = 'partial';
  } else if (new Date() > this.dueDate && this.balance > 0) {
    this.status = 'overdue';
  }
  
  next();
});

invoiceSchema.index({ company: 1, status: 1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ invoiceNumber: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);