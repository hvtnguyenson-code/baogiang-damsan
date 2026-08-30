const { PrismaClient } = require('@prisma/client');
const { validateCapabilityCatalog, syncCapabilityCatalog, verifyCapabilityCatalog } = require('../../../prisma/capability-catalog.cjs');
async function main() { const prisma = new PrismaClient(); try { validateCapabilityCatalog(); await syncCapabilityCatalog(prisma); const result = await verifyCapabilityCatalog(prisma); process.stdout.write(`${JSON.stringify({ state: 'completed', ...result })}\n`); } finally { await prisma.$disconnect(); } }
main().catch((error) => { console.error('Capability catalog synchronization failed.'); console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
