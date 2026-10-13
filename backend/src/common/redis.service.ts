import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

/** Thin JSON cache over Redis. Without REDIS_URL (or when Redis is down) it degrades to no caching. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    this.client = url ? new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null;
    this.client?.on("error", (e) => this.log.warn(`redis: ${e.message}`));
  }

  async cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.client?.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {}
    const value = await load();
    try {
      await this.client?.set(key, JSON.stringify(value), "EX", ttlSec);
    } catch {}
    return value;
  }

  async invalidate(prefix: string) {
    try {
      if (!this.client) return;
      const keys = await this.client.keys(`${prefix}*`);
      if (keys.length) await this.client.del(...keys);
    } catch {}
  }

  async onModuleDestroy() {
    this.client?.disconnect();
  }
}
