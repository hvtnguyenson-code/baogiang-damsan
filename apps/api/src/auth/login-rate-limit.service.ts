import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { isIP } from 'net';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/app.config';

export interface AcquireSlotOptions {
  ipAddress: string;
  username: string;
  request?: { destroyed?: boolean; closed?: boolean; on?: (event: string, listener: () => void) => unknown };
  now?: number;
}

export interface SlotLease {
  release: (outcome?: { isFailure?: boolean }) => void;
}

interface QueuedLoginRequest {
  id: string;
  ip: string;
  username: string;
  queuedAt: number;
  resolve: (lease: SlotLease) => void;
  reject: (error: unknown) => void;
  timeoutTimer?: NodeJS.Timeout;
  aborted?: boolean;
}

interface IpBucketState {
  totalCount: number;
  failedCount: number;
  resetAt: number;
  lastAdmittedAt: number;
}

interface UserBucketState {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginRateLimitService implements OnModuleDestroy {
  private readonly ipBuckets = new Map<string, IpBucketState>();
  private readonly userBuckets = new Map<string, UserBucketState>();
  private readonly legacyAttempts = new Map<string, { count: number; resetAt: number }>();

  private readonly ipInFlight = new Map<string, number>();
  private readonly ipQueueCounts = new Map<string, number>();
  private readonly queue: QueuedLoginRequest[] = [];
  private globalInFlight = 0;
  private pacingTimer?: NodeJS.Timeout;

  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  onModuleDestroy(): void {
    this.resetForTest();
  }

  resetForTest(): void {
    if (this.pacingTimer) {
      clearTimeout(this.pacingTimer);
      this.pacingTimer = undefined;
    }
    for (const item of this.queue) {
      if (item.timeoutTimer) {
        clearTimeout(item.timeoutTimer);
      }
    }
    this.queue.length = 0;
    this.ipBuckets.clear();
    this.userBuckets.clear();
    this.legacyAttempts.clear();
    this.ipInFlight.clear();
    this.ipQueueCounts.clear();
    this.globalInFlight = 0;
  }

  get trackedKeyCount(): number {
    return this.ipBuckets.size + this.userBuckets.size + this.legacyAttempts.size;
  }

  get trackedIpKeyCount(): number {
    return this.ipBuckets.size;
  }

  get trackedUserKeyCount(): number {
    return this.userBuckets.size;
  }

  get globalInFlightCount(): number {
    return this.globalInFlight;
  }

  get activeQueueLength(): number {
    return this.queue.length;
  }

  getInFlightCountForIp(ip: string): number {
    return this.ipInFlight.get(ip) ?? 0;
  }

  getQueueLengthForIp(ip: string): number {
    return this.ipQueueCounts.get(ip) ?? 0;
  }

  isIpDegraded(ip: string): boolean {
    const bucket = this.ipBuckets.get(ip);
    if (!bucket) return false;
    const threshold = this.config.auth.loginRateLimitIpFailedDegradedThreshold ?? 25;
    return bucket.failedCount >= threshold;
  }

  private pruneExpired(now: number): void {
    for (const [key, item] of this.ipBuckets) {
      if (item.resetAt <= now) this.ipBuckets.delete(key);
    }
    for (const [key, item] of this.userBuckets) {
      if (item.resetAt <= now) this.userBuckets.delete(key);
    }
    for (const [key, item] of this.legacyAttempts) {
      if (item.resetAt <= now) this.legacyAttempts.delete(key);
    }
  }

  private reject(message = 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.'): never {
    throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }

  recordFailedAttempt(ip: string, now = Date.now()): void {
    let bucket = this.ipBuckets.get(ip);
    const windowMs = (this.config.auth.loginRateLimitWindowSeconds ?? 60) * 1000;
    if (!bucket || bucket.resetAt <= now) {
      bucket = { totalCount: 1, failedCount: 1, resetAt: now + windowMs, lastAdmittedAt: 0 };
      this.ipBuckets.set(ip, bucket);
    } else {
      bucket.failedCount += 1;
    }
  }

  consume(key: string, now = Date.now()): void {
    const current = this.legacyAttempts.get(key);
    if (current?.resetAt && current.resetAt <= now) {
      this.legacyAttempts.delete(key);
    }
    const active = this.legacyAttempts.get(key);
    if (!active) {
      const maxKeys = this.config.auth.loginRateLimitMaxKeys ?? 10_000;
      if (this.legacyAttempts.size >= maxKeys) {
        this.pruneExpired(now);
      }
      if (this.legacyAttempts.size >= maxKeys) this.reject();
      this.legacyAttempts.set(key, { count: 1, resetAt: now + (this.config.auth.loginRateLimitWindowSeconds ?? 60) * 1000 });
      return;
    }
    active.count += 1;
    const max = this.config.auth.loginRateLimitMax ?? 10;
    if (active.count > max) this.reject();
  }

  async acquireSlot(options: AcquireSlotOptions): Promise<SlotLease> {
    const now = options.now ?? Date.now();
    const { ipAddress } = options;

    if (!ipAddress || isIP(ipAddress) === 0) {
      throw new BadRequestException('Địa chỉ IP máy khách không hợp lệ.');
    }

    const username = options.username?.trim().toLowerCase();
    if (!username) {
      throw new BadRequestException('Tên đăng nhập không được để trống.');
    }

    const windowMs = (this.config.auth.loginRateLimitWindowSeconds ?? 60) * 1000;

    const maxUserKeys = this.config.auth.loginRateLimitMaxUserKeys ?? 10_000;
    const maxIpKeys = this.config.auth.loginRateLimitMaxIpKeys ?? 10_000;

    // 1. Account-level rate limit pre-admission check & increment
    let userBucket = this.userBuckets.get(username);
    if (userBucket && userBucket.resetAt <= now) {
      this.userBuckets.delete(username);
      userBucket = undefined;
    }
    if (!userBucket) {
      if (this.userBuckets.size >= maxUserKeys) {
        this.pruneExpired(now);
      }
      if (this.userBuckets.size >= maxUserKeys) {
        this.reject('Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.');
      }
      userBucket = { count: 1, resetAt: now + windowMs };
      this.userBuckets.set(username, userBucket);
    } else {
      userBucket.count += 1;
      const userMax = this.config.auth.loginRateLimitUserMax ?? 10;
      if (userBucket.count > userMax) {
        this.reject('Quá nhiều lần đăng nhập cho tài khoản này. Vui lòng thử lại sau.');
      }
    }

    // 2. IP-level total request ceiling pre-admission check & increment
    let ipBucket = this.ipBuckets.get(ipAddress);
    if (ipBucket && ipBucket.resetAt <= now) {
      this.ipBuckets.delete(ipAddress);
      ipBucket = undefined;
    }
    if (!ipBucket) {
      if (this.ipBuckets.size >= maxIpKeys) {
        this.pruneExpired(now);
      }
      if (this.ipBuckets.size >= maxIpKeys) {
        this.reject('Quá nhiều yêu cầu đăng nhập từ mạng này. Vui lòng thử lại sau.');
      }
      ipBucket = { totalCount: 1, failedCount: 0, resetAt: now + windowMs, lastAdmittedAt: 0 };
      this.ipBuckets.set(ipAddress, ipBucket);
    } else {
      ipBucket.totalCount += 1;
      const ipTotalMax = this.config.auth.loginRateLimitIpTotalMax ?? 150;
      if (ipBucket.totalCount > ipTotalMax) {
        this.reject('Quá nhiều lần đăng nhập từ địa chỉ mạng này. Vui lòng thử lại sau.');
      }
    }

    // 3. Concurrency check: Can we admit immediately?
    const isDegraded = ipBucket.failedCount >= (this.config.auth.loginRateLimitIpFailedDegradedThreshold ?? 25);
    const maxInFlightForIp = isDegraded
      ? (this.config.auth.loginRateLimitInFlightIpDegraded ?? 1)
      : (this.config.auth.loginRateLimitInFlightIp ?? 3);
    const globalMaxInFlight = this.config.auth.loginRateLimitInFlightGlobal ?? 8;
    const currentIpInFlight = this.ipInFlight.get(ipAddress) ?? 0;
    const ipQueueSize = this.ipQueueCounts.get(ipAddress) ?? 0;
    const globalQueueSize = this.queue.length;

    const degradedPaceMs = this.config.auth.loginRateLimitDegradedPaceMs ?? 1_000;
    const paceSatisfied = !isDegraded || (now - ipBucket.lastAdmittedAt >= degradedPaceMs);

    if (
      globalQueueSize === 0 &&
      ipQueueSize === 0 &&
      this.globalInFlight < globalMaxInFlight &&
      currentIpInFlight < maxInFlightForIp &&
      paceSatisfied
    ) {
      this.admit(ipAddress, now);
      return this.createSlotLease(ipAddress);
    }

    // 4. Must queue request: check queue limits
    const maxQueueGlobal = this.config.auth.loginRateLimitMaxQueueGlobal ?? 120;
    const maxQueuePerIp = this.config.auth.loginRateLimitMaxQueuePerIp ?? 60;

    if (globalQueueSize >= maxQueueGlobal) {
      this.reject('Hàng đợi đăng nhập đã đầy. Vui lòng thử lại sau.');
    }
    if (ipQueueSize >= maxQueuePerIp) {
      this.reject('Quá nhiều yêu cầu đang chờ từ mạng này. Vui lòng thử lại sau.');
    }

    // Enqueue
    this.ipQueueCounts.set(ipAddress, ipQueueSize + 1);

    return new Promise<SlotLease>((resolve, reject) => {
      const reqId = randomUUID();
      const queuedItem: QueuedLoginRequest = {
        id: reqId,
        ip: ipAddress,
        username,
        queuedAt: now,
        resolve,
        reject,
      };

      const timeoutMs = this.config.auth.loginRateLimitQueueTimeoutMs ?? 10_000;
      queuedItem.timeoutTimer = setTimeout(() => {
        this.removeFromQueue(reqId);
        reject(new HttpException('Quá thời gian chờ đăng nhập. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS));
      }, timeoutMs);

      if (options.request && typeof options.request.on === 'function') {
        options.request.on('close', () => {
          if (!queuedItem.aborted) {
            this.removeFromQueue(reqId);
          }
        });
      }

      this.queue.push(queuedItem);
      this.pumpQueue(now);
    });
  }

  private admit(ip: string, now: number): void {
    this.globalInFlight += 1;
    this.ipInFlight.set(ip, (this.ipInFlight.get(ip) ?? 0) + 1);
    const bucket = this.ipBuckets.get(ip);
    if (bucket) {
      bucket.lastAdmittedAt = now;
    }
  }

  private createSlotLease(ip: string): SlotLease {
    let released = false;
    return {
      release: (outcome?: { isFailure?: boolean }) => {
        if (released) return;
        released = true;
        this.globalInFlight = Math.max(0, this.globalInFlight - 1);
        const current = (this.ipInFlight.get(ip) ?? 1) - 1;
        if (current <= 0) {
          this.ipInFlight.delete(ip);
        } else {
          this.ipInFlight.set(ip, current);
        }
        if (outcome?.isFailure) {
          this.recordFailedAttempt(ip);
        }
        this.pumpQueue(Date.now());
      },
    };
  }

  private removeFromQueue(reqId: string): void {
    const idx = this.queue.findIndex((item) => item.id === reqId);
    if (idx >= 0) {
      const [item] = this.queue.splice(idx, 1);
      if (item) {
        item.aborted = true;
        if (item.timeoutTimer) {
          clearTimeout(item.timeoutTimer);
          item.timeoutTimer = undefined;
        }
        const currentQ = (this.ipQueueCounts.get(item.ip) ?? 1) - 1;
        if (currentQ <= 0) {
          this.ipQueueCounts.delete(item.ip);
        } else {
          this.ipQueueCounts.set(item.ip, currentQ);
        }
      }
    }
  }

  private schedulePacingPump(delayMs: number): void {
    if (this.pacingTimer) return;
    this.pacingTimer = setTimeout(() => {
      this.pacingTimer = undefined;
      this.pumpQueue(Date.now());
    }, Math.max(1, delayMs));
  }

  private pumpQueue(now = Date.now()): void {
    const globalMaxInFlight = this.config.auth.loginRateLimitInFlightGlobal ?? 8;
    const degradedThreshold = this.config.auth.loginRateLimitIpFailedDegradedThreshold ?? 25;
    const degradedPaceMs = this.config.auth.loginRateLimitDegradedPaceMs ?? 1_000;
    const inFlightIpDegraded = this.config.auth.loginRateLimitInFlightIpDegraded ?? 1;
    const inFlightIpNormal = this.config.auth.loginRateLimitInFlightIp ?? 3;

    let i = 0;
    while (i < this.queue.length && this.globalInFlight < globalMaxInFlight) {
      const item = this.queue[i]!;
      if (item.aborted) {
        this.queue.splice(i, 1);
        continue;
      }

      const ipBucket = this.ipBuckets.get(item.ip);
      const isDegraded = (ipBucket?.failedCount ?? 0) >= degradedThreshold;
      const maxInFlightForIp = isDegraded ? inFlightIpDegraded : inFlightIpNormal;
      const currentIpInFlight = this.ipInFlight.get(item.ip) ?? 0;

      if (currentIpInFlight >= maxInFlightForIp) {
        i += 1;
        continue;
      }

      if (isDegraded && ipBucket) {
        const elapsed = now - ipBucket.lastAdmittedAt;
        if (elapsed < degradedPaceMs) {
          this.schedulePacingPump(degradedPaceMs - elapsed);
          i += 1;
          continue;
        }
      }

      // Admitted from queue
      this.queue.splice(i, 1);
      const currentQ = (this.ipQueueCounts.get(item.ip) ?? 1) - 1;
      if (currentQ <= 0) {
        this.ipQueueCounts.delete(item.ip);
      } else {
        this.ipQueueCounts.set(item.ip, currentQ);
      }
      if (item.timeoutTimer) {
        clearTimeout(item.timeoutTimer);
        item.timeoutTimer = undefined;
      }

      this.admit(item.ip, now);
      item.resolve(this.createSlotLease(item.ip));
    }
  }
}
