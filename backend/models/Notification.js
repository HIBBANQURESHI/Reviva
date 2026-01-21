const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'aging_receivable',
      'upcoming_renewal',
      'recovery_milestone',
      'new_leak_detected',
      'task_assigned',
      'payment_received',
      'invoice_overdue',
      'system_alert'
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  read: {
    type: Boolean,
    default: false,
  },
  readAt: Date,
  link: String, // Deep link to relevant page
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
}, {
  timestamps: true,
});

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);