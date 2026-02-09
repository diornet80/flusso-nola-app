
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function debug() {
    const { data: unit } = await supabase.from('msn_units').select('msn, dept_schedules').eq('msn', '13866').single();
    console.log(`MSN: ${unit?.msn}`);
    console.log(`Keys: ${Object.keys(unit?.dept_schedules || {})}`);
    console.log(`Top Ops:`, unit?.dept_schedules?.Top?.operations?.length);
    // Check if there is a 'Top' with different casing or something
    console.log(`Full top object:`, JSON.stringify(unit?.dept_schedules?.Top, null, 2));
}

debug();
