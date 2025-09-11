/**
 * Registers a standardized /__cache-policy endpoint.
 * Handles: rate limiting (60/min/IP), optional auth gating via REQUIRE_CACHE_POLICY_AUTH.
 * Services pass a function returning policies object to keep service-specific tiers.
 *
 * @param {import('express').Express} app
 * @param {Object} opts
 * @param {string} opts.service Service label (e.g. NudeForge)
 * @param {function():Object} opts.getPolicies function returning policies JSON
 * @param {function(any):void} [opts.logger] optional logger
 * @param {string} [opts.note] optional note string
 */
export function registerCachePolicyEndpoint(app, opts) {
  const { service, getPolicies, logger = console, note } = opts;
  if (!service || typeof getPolicies !== 'function') {
    throw new Error('registerCachePolicyEndpoint requires service and getPolicies()');
  }
  const hitMap = new Map();
  function limited(req) {
    const key = (req.headers['x-forwarded-for'] || req.ip || 'local').toString().split(',')[0].trim();
    const now = Date.now();
    const windowMs = 60_000; const max = 60;
    const arr = hitMap.get(key) || [];
    const recent = arr.filter(ts => now - ts < windowMs);
    recent.push(now);
    hitMap.set(key, recent);
    return recent.length <= max;
  }
  app.get('/__cache-policy', (req, res) => {
    if (!limited(req)) return res.status(429).json({ error: 'Too many requests' });
    if (process.env.REQUIRE_CACHE_POLICY_AUTH === 'true' && !req.session?.user?.id) {
      // Obscure existence when gated
      return res.status(404).json({ error: 'Not found' });
    }
    try {
      const policies = getPolicies();
      res.json({
        etag: app.get('etag') || 'strong',
        service,
        policies,
        note: note || `Adjust caching in service source if modifying policies.`
      });
    } catch (e) {
      logger.error?.('CACHE_POLICY', 'Failed building policies', e);
      res.status(500).json({ error: 'Policy introspection failed' });
    }
  });
}
