const runHealthTests = require('./health.test');
const runSessionHardeningTests = require('./session-hardening.test');
const runPaymentWebhookTests = require('./payment-webhook.test');
const runMaintenanceTests = require('./maintenance.test');
const runQueueTests = require('./queue.test');
const runFeedWorkerTests = require('./feed-worker.test');
const runNotificationFanoutTests = require('./notification-fanout.test');
const runRealtimeTests = require('./realtime.test');
const runAlgoliaTests = require('./algolia.test');
const runPaystackClientTests = require('./paystack-client.test');
const runWorkerProcessorTests = require('./worker-processors.test');
const runEmailConfigTests = require('./email-config.test');
const runPasswordResetTests = require('./password-reset.test');
const runInteractionUniquenessTests = require('./interaction-uniqueness.test');
const runMediaAssetTests = require('./media-asset.test');
const runProfileSupportEndpointTests = require('./profile-support-endpoints.test');
const runAlgorithmTests = require('./algorithm.test');

async function main() {
  await runHealthTests();
  await runSessionHardeningTests();
  await runPaymentWebhookTests();
  await runMaintenanceTests();
  await runQueueTests();
  await runFeedWorkerTests();
  await runNotificationFanoutTests();
  await runRealtimeTests();
  await runAlgoliaTests();
  await runPaystackClientTests();
  await runWorkerProcessorTests();
  await runEmailConfigTests();
  await runPasswordResetTests();
  await runInteractionUniquenessTests();
  await runMediaAssetTests();
  await runProfileSupportEndpointTests();
  await runAlgorithmTests();
  console.log('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
