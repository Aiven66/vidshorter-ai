const { HttpsProxyAgent } = require('https-proxy-agent');

const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(PROXY_URL);

// Patch global fetch to use proxy
const originalFetch = globalThis.fetch;
if (originalFetch) {
  globalThis.fetch = function(url, options = {}) {
    options.agent = agent;
    return originalFetch.call(this, url, options);
  };
}

// Patch https module
const https = require('https');
const originalRequest = https.request;
https.request = function(options, callback) {
  if (typeof options === 'string' || options instanceof URL) {
    options = new URL(options.toString());
  }
  if (typeof options === 'object' && !options.agent) {
    options.agent = agent;
  }
  return originalRequest.call(this, options, callback);
};

const originalGet = https.get;
https.get = function(options, callback) {
  if (typeof options === 'string' || options instanceof URL) {
    options = new URL(options.toString());
  }
  if (typeof options === 'object' && !options.agent) {
    options.agent = agent;
  }
  return originalGet.call(this, options, callback);
};
