const express = require('express');
const router = express.Router();
const messagingController = require('../controllers/messaging.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware.protect);

router.get('/channels/:circleId/:channelId', messagingController.getChannelMessages);
router.post('/channels/:circleId/:channelId', messagingController.sendChannelMessage);
router.get('/reads', messagingController.getReadStates);
router.post('/reads', messagingController.updateReadState);
router.get('/dm/conversations', messagingController.listDMConversations);
router.post('/dm/conversations/:userId', messagingController.getOrCreateConversation);
router.get('/dm/conversations/:conversationId/messages', messagingController.getDMMessages);
router.post('/dm/conversations/:conversationId/messages', messagingController.sendDMMessage);

module.exports = router;
