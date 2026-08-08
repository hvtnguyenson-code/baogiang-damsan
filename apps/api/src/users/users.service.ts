import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma, UserStatus } from '@prisma/client';
import { UserManagementListResponse, UserManagementRecord } from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { StaffProfileDto } from './dto/staff-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userWithProfile = Prisma.validator<Prisma.UserDefaultArgs>()({ include: { profile: true } });
type UserWithProfile = Prisma.UserGetPayload<typeof userWithProfile>;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeStaffCode(value: string): string {
  return value.trim().toUpperCase();
}

export function toUserManagementRecord(user: UserWithProfile): UserManagementRecord {
  return {
    id: user.id,
    username: user.username,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    ...(user.lockedUntil ? { lockedUntil: user.lockedUntil.toISOString() } : {}),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    profile: user.profile ? {
      id: user.profile.id,
      userId: user.profile.userId,
      ...(user.profile.staffCode ? { staffCode: user.profile.staffCode } : {}),
      displayName: user.profile.displayName,
      ...(user.profile.email ? { email: user.profile.email } : {}),
      ...(user.profile.phone ? { phone: user.profile.phone } : {}),
      ...(user.profile.positionTitle ? { positionTitle: user.profile.positionTitle } : {}),
      isTeachingStaff: user.profile.isTeachingStaff,
      createdAt: user.profile.createdAt.toISOString(),
      updatedAt: user.profile.updatedAt.toISOString(),
    } : null,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorUserId: string, meta: RequestMeta): Promise<UserManagementRecord> {
    if ((dto as { profile?: unknown }).profile === null) throw new BadRequestException('Hồ sơ nhân sự không hợp lệ.');
    const username = normalizeUsername(dto.username);
    if (!username) throw new BadRequestException('Tên đăng nhập không được để trống.');
    this.validateProfileForCreate(dto.profile);
    try {
      this.passwords.validatePolicy(dto.password);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Mật khẩu không hợp lệ.');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username,
            passwordHash,
            status: UserStatus.PENDING,
            mustChangePassword: true,
            failedLoginCount: 0,
            lockedUntil: null,
            ...(dto.profile ? { profile: { create: this.profileCreateData(dto.profile) } } : {}),
          },
          include: { profile: true },
        });
        await this.writeAudit('USER_CREATED', user.id, actorUserId, meta, undefined, tx);
        return toUserManagementRecord(user);
      });
    } catch (error) {
      this.rethrowKnownConflict(error);
    }
  }

  async list(query: ListUsersDto): Promise<UserManagementListResponse> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
        include: { profile: true },
      }),
      this.prisma.user.count(),
    ]);
    return { items: items.map(toUserManagementRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<UserManagementRecord> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { profile: true } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    return toUserManagementRecord(user);
  }

  async update(id: string, dto: UpdateUserDto, actorUserId: string, meta: RequestMeta): Promise<UserManagementRecord> {
    if ((dto as { profile?: unknown }).profile === null) throw new BadRequestException('Hồ sơ nhân sự không hợp lệ.');
    if (dto.username === undefined && dto.profile === undefined) {
      throw new BadRequestException('Yêu cầu cập nhật phải có ít nhất một trường thay đổi.');
    }
    if (dto.profile && Object.keys(dto.profile).length === 0 && dto.username === undefined) {
      throw new BadRequestException('Yêu cầu cập nhật phải có ít nhất một trường thay đổi.');
    }
    const username = dto.username === undefined ? undefined : normalizeUsername(dto.username);
    if (username === '') throw new BadRequestException('Tên đăng nhập không được để trống.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { id }, include: { profile: true } });
        if (!existing) throw new NotFoundException('Không tìm thấy người dùng.');
        const profileData = dto.profile ? this.profileUpdateData(dto.profile) : undefined;
        const profileCreated = !!dto.profile && !existing.profile;
        if (profileCreated && !dto.profile?.displayName) {
          throw new BadRequestException('Cần displayName khi tạo hồ sơ nhân sự.');
        }
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(username !== undefined ? { username } : {}),
            ...(dto.profile ? {
              profile: existing.profile
                ? { update: profileData }
                : { create: this.profileCreateData(dto.profile) },
            } : {}),
          },
          include: { profile: true },
        });
        await this.writeAudit('USER_UPDATED', id, actorUserId, meta, {
          changedFields: [
            ...(username !== undefined ? ['username'] : []),
            ...(dto.profile && profileData && Object.keys(profileData).length > 0 ? ['profile'] : []),
          ],
          profileCreated,
        }, tx);
        return toUserManagementRecord(user);
      });
    } catch (error) {
      this.rethrowKnownConflict(error);
    }
  }

  async activate(id: string, actorUserId: string, meta: RequestMeta): Promise<UserManagementRecord> {
    return this.changeState(id, actorUserId, meta, 'USER_ACTIVATED', async (tx, user) => {
      if (user.status === UserStatus.LOCKED) throw new ConflictException('Không thể kích hoạt tài khoản đang ở trạng thái LOCKED.');
      if (user.status === UserStatus.PENDING || user.status === UserStatus.DISABLED) {
        return tx.user.update({ where: { id }, data: { status: UserStatus.ACTIVE }, include: { profile: true } });
      }
      return user;
    });
  }

  async disable(id: string, actorUserId: string, meta: RequestMeta): Promise<UserManagementRecord> {
    return this.changeState(id, actorUserId, meta, 'USER_DISABLED', async (tx, user) => {
      const now = new Date();
      const revoked = await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
      const updated = user.status === UserStatus.DISABLED
        ? user
        : await tx.user.update({ where: { id }, data: { status: UserStatus.DISABLED }, include: { profile: true } });
      await this.writeAudit('USER_DISABLED', id, actorUserId, meta, { previousStatus: user.status, newStatus: UserStatus.DISABLED, revokedSessionCount: revoked.count }, tx);
      return updated;
    }, true);
  }

  async unlock(id: string, actorUserId: string, meta: RequestMeta): Promise<UserManagementRecord> {
    return this.changeState(id, actorUserId, meta, 'USER_UNLOCKED', async (tx, user) => {
      if (user.status !== UserStatus.ACTIVE) throw new ConflictException('Chỉ có thể mở khóa tài khoản ACTIVE.');
      return tx.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 }, include: { profile: true } });
    });
  }

  private async changeState(
    id: string, actorUserId: string, meta: RequestMeta, action: string,
    mutate: (tx: Prisma.TransactionClient, user: UserWithProfile) => Promise<UserWithProfile>,
    auditWritten = false,
  ): Promise<UserManagementRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id }, include: { profile: true } });
      if (!existing) throw new NotFoundException('Không tìm thấy người dùng.');
      const user = await mutate(tx, existing);
      if (!auditWritten) await this.writeAudit(action, id, actorUserId, meta, undefined, tx);
      return toUserManagementRecord(user);
    });
  }

  private validateProfileForCreate(profile?: StaffProfileDto): void {
    if (profile && !profile.displayName) throw new BadRequestException('Cần displayName khi tạo hồ sơ nhân sự.');
  }

  private profileCreateData(profile: StaffProfileDto): Prisma.StaffProfileCreateWithoutUserInput {
    if (!profile.displayName) throw new BadRequestException('Cần displayName khi tạo hồ sơ nhân sự.');
    return { displayName: profile.displayName, ...this.profileUpdateData(profile) };
  }

  private profileUpdateData(profile: StaffProfileDto): {
    staffCode?: string | null;
    displayName?: string;
    email?: string | null;
    phone?: string | null;
    positionTitle?: string | null;
    isTeachingStaff?: boolean;
  } {
    return {
      ...(profile.staffCode !== undefined ? { staffCode: profile.staffCode === null ? null : normalizeStaffCode(profile.staffCode) } : {}),
      ...(profile.displayName !== undefined ? { displayName: profile.displayName } : {}),
      ...(profile.email !== undefined ? { email: profile.email } : {}),
      ...(profile.phone !== undefined ? { phone: profile.phone } : {}),
      ...(profile.positionTitle !== undefined ? { positionTitle: profile.positionTitle } : {}),
      ...(profile.isTeachingStaff !== undefined ? { isTeachingStaff: profile.isTeachingStaff } : {}),
    };
  }

  private async writeAudit(action: string, userId: string, actorUserId: string, meta: RequestMeta, metadata?: Record<string, unknown>, db?: Prisma.TransactionClient): Promise<void> {
    await this.audit.write({ actorUserId, action, entityType: 'User', entityId: userId, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata }, db);
  }

  private rethrowKnownConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Tên đăng nhập hoặc mã nhân sự đã tồn tại.');
    }
    throw error;
  }
}
