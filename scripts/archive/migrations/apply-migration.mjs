#!/usr/bin/env node
import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const connectionString = 'postgresql://postgres.gfjctyxqlwexxwsmkakq:eGAHIuvnciA3mxWs@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

const client = new Client({ connectionString });

try {
  console.log('Connecting to database...');
  await client.connect();
  console.log('✅ Connected');

  console.log('Reading migration file...');
  const sql = readFileSync('supabase/migrations/20260214_e2e_test_rls_complete_fix.sql', 'utf-8');

  console.log('Applying migration...');
  await client.query(sql);

  console.log('✅ Migration applied successfully!');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
