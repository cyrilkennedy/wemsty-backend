const CircleRole = require('../models/CircleRole.model');

const ROLE_PERMISSION_MAP = {
  owner: [
    'circle.manage',
    'circle.invites.manage',
    'channel.create',
    'channel.pin',
    'message.send',
    'message.moderate',
    'member.manage',
    'role.manage'
  ],
  moderator: [
    'circle.invites.manage',
    'channel.create',
    'channel.pin',
    'message.send',
    'message.moderate',
    'member.manage'
  ],
  member: [
    'message.send'
  ]
};

async function resolvePermissions(membership) {
  if (!membership || membership.status !== 'active') {
    return [];
  }

  const directPermissions = new Set();
  for (const role of membership.roles || []) {
    for (const permission of ROLE_PERMISSION_MAP[role] || []) {
      directPermissions.add(permission);
    }
  }

  const customRoleIds = (membership.roleIds || []).filter(Boolean);
  if (customRoleIds.length > 0) {
    const customRoles = await CircleRole.find({
      _id: { $in: customRoleIds },
      circle: membership.circle
    }).select('permissions');

    for (const role of customRoles) {
      for (const permission of role.permissions || []) {
        directPermissions.add(permission);
      }
    }
  }

  return [...directPermissions];
}

async function hasPermission(membership, permission, platformRole = 'user') {
  if (platformRole === 'admin') {
    return true;
  }

  const permissions = await resolvePermissions(membership);
  return permissions.includes(permission);
}

module.exports = {
  resolvePermissions,
  hasPermission
};
