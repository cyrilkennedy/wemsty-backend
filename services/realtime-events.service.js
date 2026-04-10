const { EventEmitter } = require('events');

const realtimeEvents = new EventEmitter();

realtimeEvents.setMaxListeners(100);

module.exports = realtimeEvents;
