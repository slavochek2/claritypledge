/**
 * Apply RLS fix for point_position_history table
 * Run: npx tsx scripts/apply-rls-fix.ts
 */
import { supabaseAdmin } from '../../e2e/helpers/supabase-admin';

const policySQL = `
CREATE POLICY IF NOT EXISTS "Allow trigger to insert position history"
  ON public.point_position_history
  FOR INSERT
  WITH CHECK (true);
`;

console.log('Applying RLS fix to point_position_history...');
console.log('SQL:', policySQL);

// Use Supabase Admin rpc to execute raw SQL
supabaseAdmin.rpc('exec_sql', { sql_query: policySQL })
  .then(result => {
    if (result.error) {
      console.error('Error via RPC:', result.error);
      console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
      console.log(policySQL);
      process.exit(1);
    }
    console.log('✓ Success!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed:', err.message);
    console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log(policySQL);
    process.exit(1);
  });
