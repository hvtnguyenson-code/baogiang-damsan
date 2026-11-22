'use strict';
/** Local-only B1 bootstrap inventory rehearsal. Writes ONLY to a fresh
 * random schema in certified loopback /baogiang_test, drops it afterwards.
 * Never use on production or an existing schema. */
const assert=require('node:assert/strict');
const { randomUUID }=require('node:crypto');
const { spawnSync }=require('node:child_process');
const path=require('node:path');
const { PrismaClient, UserStatus }=require('@prisma/client');
const { readSnapshot, summarize }=require('./b1-bootstrap-readonly-preflight.cjs');

async function main(){
 const raw=process.env.TEST_DATABASE_URL;
 if(process.env.NODE_ENV!=='test' ||
    process.env.BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB!=='1' || !raw)
   throw Error('B1_CERTIFIED_TEST_DATABASE_REQUIRED');
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol) ||
    !['localhost','127.0.0.1','::1'].includes(url.hostname) ||
    decodeURIComponent(url.pathname)!=='/baogiang_test')
   throw Error('B1_EXACT_LOOPBACK_TEST_DATABASE_REQUIRED');
 const schema='b1ready_'+randomUUID().replaceAll('-','');
 const root=new PrismaClient({datasources:{db:{url:raw}}});
 let scratch=null,created=false;
 try{
   await root.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
   created=true;
   url.searchParams.set('schema',schema);
   const scratchUrl=url.toString();
   const repo=path.resolve(__dirname,'../..');
   const migration=spawnSync(process.execPath,
     [path.join(repo,'node_modules/prisma/build/index.js'),
      'migrate','deploy','--schema',path.join(repo,'prisma/schema.prisma')],
     {cwd:repo,env:{...process.env,DATABASE_URL:scratchUrl},
      encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
   if(migration.status!==0)throw Error('B1_SCRATCH_MIGRATION_FAILED');
   scratch=new PrismaClient({datasources:{db:{url:scratchUrl}}});
   await scratch.$connect();
   const empty=summarize(await readSnapshot(scratch));
   assert.equal(empty.inventory.activeGrantCount,0);
   assert.equal(empty.canConfirm,false);
   const admin=await scratch.user.create({data:{
     username:'synthetic-admin-'+randomUUID(),passwordHash:'synthetic-fixture-not-for-login',
     status:UserStatus.ACTIVE,mustChangePassword:false}});
   const issuer=await scratch.user.create({data:{
     username:'synthetic-issuer-'+randomUUID(),passwordHash:'synthetic-fixture-not-for-login',
     status:UserStatus.ACTIVE,mustChangePassword:false}});
   const keys=['USER_MANAGE','CAPABILITY_GRANT',...Array.from({length:7},(_,i)=>'B1_PREFLIGHT_SYNTHETIC_'+i)];
   for(const key of keys){
     await scratch.capabilityDefinition.create({data:{
       key,description:'Synthetic B1 preflight fixture',
       allowedScopeTypes:['SCHOOL_WIDE'],isActive:true,isSystem:true}});
     await scratch.capabilityGrant.create({data:{
       userId:admin.id,capabilityKey:key,scopeType:'SCHOOL_WIDE',
       validFrom:new Date('2026-11-01T00:00:00Z'),grantedByUserId:issuer.id}});
   }
   const before=summarize(await readSnapshot(scratch));
   assert.equal(before.inventory.activeGrantCount,9);
   assert.equal(before.inventory.activeLegacyUnlinkedCount,9);
   assert.equal(before.legacyRightsReview.reduce((n,g)=>n+g.activeUnlinkedCount,0),9);
   assert.ok(before.legacyRightsReview.every(g=>g.sourceDecision==='NOT_ESTABLISHED'));
   assert.equal(before.inventory.candidateTechnicalUsersWithTwoGrantsCount,1);
   assert.ok(before.databaseBlockers.includes('LEGACY_ACTIVE_GRANTS_UNLINKED'));
   assert.equal(before.canConfirm,false);
   // Re-link one synthetic grant to prove rights hash is unchanged while
   // separate linkage fingerprint detects the authorized structural change.
   const grant=await scratch.capabilityGrant.findFirstOrThrow({
     where:{userId:admin.id,capabilityKey:'USER_MANAGE'}});
   const coordinate=await scratch.accessCoordinate.create({data:{
     userId:admin.id,capabilityKey:'USER_MANAGE',scopeType:'SCHOOL_WIDE',
     scopeResourceId:null}});
   await scratch.capabilityGrant.update({where:{id:grant.id},data:{coordinateId:coordinate.id}});
   const after=summarize(await readSnapshot(scratch));
   assert.equal(after.inventory.activeGrantCount,9);
   assert.equal(after.inventory.activeLegacyUnlinkedCount,8);
   assert.equal(after.legacyRightsReview.reduce((n,g)=>n+g.activeUnlinkedCount,0),8);
   assert.equal(after.grantRightsFingerprintSha256,before.grantRightsFingerprintSha256);
   assert.notEqual(after.grantLinkageFingerprintSha256,before.grantLinkageFingerprintSha256);
   assert.equal(after.canConfirm,false);
   process.stdout.write(JSON.stringify({
     result:'B1_BOOTSTRAP_SCRATCH_REHEARSAL_PASS',
     postgresVersion:'local', nineSyntheticLegacyGrantsVerified:true,
     rightsFingerprintPreserved:true,linkageChangeDetected:true,
     provenanceNotInferred:true,productionUntouched:true,
     scratchSchema:'GENERATED_AND_CLEANED',
   })+'\n');
 }finally{
   if(scratch)await scratch.$disconnect();
   if(created && /^b1ready_[0-9a-f]{32}$/.test(schema)){
     await root.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');
   }
   await root.$disconnect();
 }
}
main().catch((error)=>{
 const reason=/^B1_[A-Z_]+$/.test(error.message)?error.message:'B1_REHEARSAL_FAILED';
 process.stderr.write(reason+'\n');
 process.exitCode=1;
});
