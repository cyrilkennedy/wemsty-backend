// config/kafka.js - Kafka configuration for event streaming

const { Kafka, logLevel } = require('kafkajs');

class KafkaManager {
  constructor() {
    this.kafka = null;
    this.producer = null;
    this.consumers = new Map();
    this.isConnected = false;
    this.admin = null;
  }

  async connect() {
    try {
      const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
      
      this.kafka = new Kafka({
        clientId: process.env.KAFKA_CLIENT_ID || 'wemsty-backend',
        brokers,
        retry: {
          initialRetryTime: 100,
          retries: 8
        },
        logLevel: process.env.NODE_ENV === 'production' ? logLevel.WARN : logLevel.INFO
      });

      // Create admin client
      this.admin = this.kafka.admin();
      await this.admin.connect();
      console.log('✅ Kafka admin connected');

      // Create producer
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true
      });
      await this.producer.connect();
      console.log('✅ Kafka producer connected');

      this.isConnected = true;
      return this;
    } catch (error) {
      console.error('❌ Kafka connection failed:', error.message);
      throw error;
    }
  }

  async createTopics(topics = []) {
    if (!this.admin) {
      throw new Error('Kafka admin not connected');
    }

    const topicConfigs = topics.map(topic => ({
      topic,
      numPartitions: parseInt(process.env.KAFKA_PARTITIONS || '3', 10),
      replicationFactor: parseInt(process.env.KAFKA_REPLICATION || '1', 10)
    }));

    try {
      await this.admin.createTopics({
        topics: topicConfigs,
        waitForLeaders: true
      });
      console.log(`✅ Created ${topics.length} Kafka topics`);
    } catch (error) {
      // Topics might already exist, which is fine
      if (error.code !== 'TOPIC_ALREADY_EXISTS') {
        console.error('❌ Error creating Kafka topics:', error.message);
        throw error;
      }
    }
  }

  async produceEvent(topic, messages, options = {}) {
    if (!this.producer || !this.isConnected) {
      console.warn('⚠️  Kafka not connected, event not produced');
      return false;
    }

    try {
      const formattedMessages = messages.map(msg => ({
        key: msg.key ? msg.key.toString() : null,
        value: JSON.stringify(msg.value),
        headers: msg.headers || {}
      }));

      const result = await this.producer.send({
        topic,
        messages: formattedMessages,
        ...options
      });

      return result;
    } catch (error) {
      console.error(`❌ Error producing to topic ${topic}:`, error.message);
      throw error;
    }
  }

  async consumeEvents(topic, groupId, onMessage, options = {}) {
    if (!this.isConnected) {
      console.warn('⚠️  Kafka not connected, consumer not started');
      return;
    }

    const consumerKey = `${topic}-${groupId}`;
    
    // Don't create duplicate consumers
    if (this.consumers.has(consumerKey)) {
      console.log(`⚠️  Consumer ${consumerKey} already exists`);
      return;
    }

    try {
      const consumer = this.kafka.consumer({
        groupId,
        ...options
      });

      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });

      await consumer.run({
        autoCommit: options.autoCommit !== false,
        autoCommitInterval: options.autoCommitInterval || 5000,
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const value = JSON.parse(message.value.toString());
            const key = message.key ? message.key.toString() : null;
            const headers = message.headers || {};

            await onMessage({
              topic,
              partition,
              offset: message.offset,
              key,
              value,
              headers,
              timestamp: message.timestamp
            });
          } catch (error) {
            console.error(`❌ Error processing message from ${topic}:`, error.message);
            // Don't throw - continue processing other messages
          }
        }
      });

      this.consumers.set(consumerKey, consumer);
      console.log(`✅ Kafka consumer started: ${consumerKey}`);
    } catch (error) {
      console.error(`❌ Error starting consumer ${consumerKey}:`, error.message);
      throw error;
    }
  }

  async disconnect() {
    this.isConnected = false;

    // Disconnect all consumers
    for (const [key, consumer] of this.consumers) {
      try {
        await consumer.disconnect();
        console.log(`✅ Kafka consumer disconnected: ${key}`);
      } catch (error) {
        console.error(`❌ Error disconnecting consumer ${key}:`, error.message);
      }
    }
    this.consumers.clear();

    // Disconnect producer
    if (this.producer) {
      try {
        await this.producer.disconnect();
        console.log('✅ Kafka producer disconnected');
      } catch (error) {
        console.error('❌ Error disconnecting producer:', error.message);
      }
    }

    // Disconnect admin
    if (this.admin) {
      try {
        await this.admin.disconnect();
        console.log('✅ Kafka admin disconnected');
      } catch (error) {
        console.error('❌ Error disconnecting admin:', error.message);
      }
    }
  }

  // Helper methods for common event types
  async emitUserEvent(eventType, userId, payload = {}) {
    return this.produceEvent('user-events', [{
      key: userId,
      value: {
        eventType,
        userId,
        timestamp: new Date().toISOString(),
        ...payload
      }
    }]);
  }

  async emitPostEvent(eventType, postId, userId, payload = {}) {
    return this.produceEvent('post-events', [{
      key: postId,
      value: {
        eventType,
        postId,
        userId,
        timestamp: new Date().toISOString(),
        ...payload
      }
    }]);
  }

  async emitCommunityEvent(eventType, communityId, userId, payload = {}) {
    return this.produceEvent('community-events', [{
      key: communityId,
      value: {
        eventType,
        communityId,
        userId,
        timestamp: new Date().toISOString(),
        ...payload
      }
    }]);
  }

  async emitMessageEvent(eventType, messageId, channelId, userId, payload = {}) {
    return this.produceEvent('message-events', [{
      key: channelId,
      value: {
        eventType,
        messageId,
        channelId,
        userId,
        timestamp: new Date().toISOString(),
        ...payload
      }
    }]);
  }

  async emitNotificationEvent(eventType, userId, payload = {}) {
    return this.produceEvent('notification-events', [{
      key: userId,
      value: {
        eventType,
        userId,
        timestamp: new Date().toISOString(),
        ...payload
      }
    }]);
  }

  async emitModerationEvent(eventType, targetId, targetType, actorId, payload = {}) {
    return this.produceEvent('moderation-events', [{
      key: `${targetType}:${targetId}`,
      value: {
        eventType,
        targetId,
        targetType,
        actorId,
        timestamp: new Date().toISOString(),
        ...payload
      }
    }]);
  }

  async emitSearchIndexEvent(eventType, entityType, entityId, payload = {}) {
    return this.produceEvent('search-index-events', [{
      key: entityId,
      value: {
        eventType,
        entityType,
        entityId,
        timestamp: new Date().toISOString(),
        ...payload
      }
    }]);
  }
}

// Singleton instance
const kafkaManager = new KafkaManager();

// Initialize default topics
const DEFAULT_TOPICS = [
  'user-events',
  'post-events',
  'community-events',
  'message-events',
  'notification-events',
  'moderation-events',
  'search-index-events'
];

module.exports = {
  kafkaManager,
  DEFAULT_TOPICS
};
