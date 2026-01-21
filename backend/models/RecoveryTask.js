const mongoose = require('mongoose');

const recoveryTaskSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  leak: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leak',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: String,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'awaiting_response', 'resolved', 'escalated', 'closed'],
    default: 'pending',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  dueDate: Date,
  activities: [{
    type: { type: String, enum: ['note', 'email', 'call', 'status_change', 'assignment'] },
    description: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],
  outreachAttempts: {
    type: Number,
    default: 0,
  },
  lastOutreachDate: Date,
  nextFollowUpDate: Date,
  recoveredAmount: {
    type: Number,
    default: 0,
  },
  resolvedAt: Date,
  resolution: String,
}, {
  timestamps: true,
});

recoveryTaskSchema.index({ company: 1, status: 1 });
recoveryTaskSchema.index({ assignedTo: 1 });
recoveryTaskSchema.index({ dueDate: 1 });

module.exports = mongoose.model('RecoveryTask', recoveryTaskSchema);