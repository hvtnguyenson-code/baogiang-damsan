const { PrismaClient } = require('@prisma/client');
const { CAPABILITIES, syncCapabilityCatalog } = require('./capability-catalog.cjs');

async function seedCapabilityCatalog(prisma) { return syncCapabilityCatalog(prisma); }
async function main() {
  const prisma = new PrismaClient();
  try { await seedCapabilityCatalog(prisma); console.log(`Seeded ${CAPABILITIES.length} capability definitions.`); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error('Capability catalog seed failed.'); console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
module.exports = { CAPABILITIES, seedCapabilityCatalog };
