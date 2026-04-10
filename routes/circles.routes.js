const express = require('express');
const router = express.Router();
const circlesController = require('../controllers/circles.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.get('/', circlesController.listCircles);
router.get('/view/:identifier', authMiddleware.optionalAuth, circlesController.getCircle);

router.use(authMiddleware.protect);

router.get('/me/memberships', circlesController.getMyCircles);
router.post('/', circlesController.createCircle);
router.post('/invites/:code/redeem', circlesController.redeemInvite);
router.get('/:circleId/members', circlesController.getCircleMembers);
router.get('/:circleId/channels', circlesController.getCircleChannels);
router.get('/:circleId/roles', circlesController.listRoles);
router.post('/:circleId/roles', circlesController.createRole);
router.post('/:circleId/roles/assign', circlesController.assignRole);
router.get('/:circleId/invites', circlesController.listInvites);
router.post('/:circleId/invites', circlesController.createInvite);
router.post('/:circleId/join', circlesController.joinCircle);
router.post('/:circleId/leave', circlesController.leaveCircle);
router.post('/:circleId/channels', circlesController.createChannel);
router.post('/:circleId/channels/:channelId/pin', circlesController.pinChannel);
router.post('/:circleId/posts/:postId/pin', circlesController.pinPost);

module.exports = router;
