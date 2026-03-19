// Simple in-memory TTL cache with lazy eviction
class Cache {
  constructor() {
    this.store = new Map();
  }

  set(key, data, ttlSeconds) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }
}

module.exports = new Cache();
