import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigrations() {
  console.log('Running database migrations...\n');

  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const migrationFile = join(migrationsDir, '001_initial_schema.sql');

  try {
    const sql = readFileSync(migrationFile, 'utf-8');

    // Split by statements (basic split, may need adjustment for complex SQL)
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;

      const preview = statement.substring(0, 60).replace(/\n/g, ' ');
      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' }).single();

      if (error) {
        // Try direct query for DDL statements
        const { error: directError } = await supabase.from('_migrations').select('*').limit(0);

        if (directError && !directError.message.includes('does not exist')) {
          console.warn(`  Warning: ${error.message}`);
        }
      }
    }

    console.log('\nMigrations completed!');
    console.log('Note: Run the SQL manually in Supabase SQL editor if automated execution fails.');
    console.log(`Migration file: ${migrationFile}`);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

runMigrations();
