import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3001';
const accessToken = __ENV.ACCESS_TOKEN || '';
const postId = __ENV.POST_ID || '';
const conversationId = __ENV.CONVERSATION_ID || '';

export const options = {
  stages: [
    { duration: __ENV.RAMP_UP || '30s', target: Number(__ENV.VUS || 10) },
    { duration: __ENV.HOLD || '1m', target: Number(__ENV.VUS || 10) },
    { duration: __ENV.RAMP_DOWN || '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<1500']
  }
};

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

export default function () {
  const requestHeaders = headers();

  check(http.get(`${baseUrl}/api/health`), {
    'health ok': (response) => response.status === 200
  });

  check(http.get(`${baseUrl}/api/feed/sphere?limit=10`, { headers: requestHeaders }), {
    'sphere feed reachable': (response) => [200, 401, 403].includes(response.status)
  });

  if (accessToken) {
    const post = http.post(`${baseUrl}/api/posts`, JSON.stringify({
      text: `k6 smoke post ${Date.now()}`,
      visibility: 'public',
      sphereEligible: true
    }), { headers: requestHeaders });
    check(post, {
      'create post accepted or rate-limited': (response) => [201, 400, 401, 403, 429].includes(response.status)
    });
  }

  if (accessToken && postId) {
    check(http.post(`${baseUrl}/api/posts/${postId}/like`, '{}', { headers: requestHeaders }), {
      'like endpoint reachable': (response) => [200, 400, 401, 403, 404, 429].includes(response.status)
    });

    check(http.post(`${baseUrl}/api/posts/${postId}/engagement`, JSON.stringify({
      action: 'dwell',
      dwellSeconds: 8,
      source: 'k6_social'
    }), { headers: requestHeaders }), {
      'algorithm engagement reachable': (response) => [200, 400, 401, 403, 404, 429].includes(response.status)
    });
  }

  if (accessToken && conversationId) {
    check(http.post(`${baseUrl}/api/messages/dm/${conversationId}`, JSON.stringify({
      bodyText: `k6 message ${Date.now()}`
    }), { headers: requestHeaders }), {
      'message endpoint reachable': (response) => [200, 201, 400, 401, 403, 404, 429].includes(response.status)
    });
  }

  sleep(1);
}
