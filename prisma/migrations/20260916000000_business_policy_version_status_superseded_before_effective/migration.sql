-- P1-031A: establish the enum value in its own committed Prisma migration.
ALTER TYPE "BusinessPolicyVersionStatus" ADD VALUE 'SUPERSEDED_BEFORE_EFFECTIVE';
