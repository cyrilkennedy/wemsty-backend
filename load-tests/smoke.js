import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3001';
const accessToken = __ENV.ACCESS_TOKEN || '';

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000']
  }
};

function authHeaders() {
  if (!accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${accessToken}`
  };
}

export default function () {
  const headers = authHeaders();

  const health = http.get(`${baseUrl}/api/health`);
  check(health, {
    'health responds': (response) => response.status === 200
  });

  const sphereFeed = http.get(`${baseUrl}/api/feed/sphere?limit=10`, { headers });
  check(sphereFeed, {
    'sphere feed is reachable': (response) => [200, 401, 403].includes(response.status)
  });

  const homeFeed = http.get(`${baseUrl}/api/feed/home?limit=10`, { headers });
  check(homeFeed, {
    'home feed is reachable or auth-protected': (response) => [200, 401, 403].includes(response.status)
  });

  const queues = http.get(`${baseUrl}/api/queues`);
  check(queues, {
    'queue dashboard is protected': (response) => [401, 403].includes(response.status)
  });

  sleep(1);
}
