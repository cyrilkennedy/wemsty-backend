const counters = new Map();
const gauges = new Map();

function increment(name, value = 1) {
  counters.set(name, (counters.get(name) || 0) + value);
}

function setGauge(name, value) {
  gauges.set(name, value);
}

function snapshot() {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges)
  };
}

module.exports = {
  increment,
  setGauge,
  snapshot
};
