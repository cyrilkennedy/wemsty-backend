const mongoose = require('mongoose');

const CircleRoleSchema = new mongoose.Schema({
  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },

  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },

  priority: {
    type: Number,
    default: 0
  },

  permissions: [{
    type: String,
    enum: [
      'circle.manage',
      'circle.invites.manage',
      'channel.create',
      'channel.pin',
      'message.send',
      'message.moderate',
      'member.manage',
      'role.manage'
    ]
  }],

  isSystemRole: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

CircleRoleSchema.index({ circle: 1, slug: 1 }, { unique: true });
CircleRoleSchema.index({ circle: 1, priority: -1 });

module.exports = mongoose.model('CircleRole', CircleRoleSchema);
