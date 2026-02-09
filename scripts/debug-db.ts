
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function debug() {
    const { data: units } = await supabase.from('msn_units').select('msn, dept_schedules').limit(5);
    units?.forEach(u => {
        console.log(`MSN: ${u.msn}`);
        const topOps = u.dept_schedules?.Top?.operations || [];
        console.log(`Top Ops Count: ${topOps.length}`);
        if (topOps.length > 0) {
            console.log(`First Op: ${topOps[0].name}`);
            console.log(`Last Op: ${topOps[topOps.length - 1].name}`);
        }
        console.log('---');
    });
}

debug();
