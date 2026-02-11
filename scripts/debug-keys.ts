
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function debug() {
    const { data: units, error } = await supabase.from('msn_units').select('id, msn, dept_schedules');
    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    let foundAny = false;
    units?.forEach(unit => {
        const schedules = unit.dept_schedules || {};
        Object.keys(schedules).forEach(dept => {
            const ops = schedules[dept].operations || [];
            const ids = ops.map((o: any) => o.id);
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                foundAny = true;
                console.log(`\n--- MSN: ${unit.msn} ---`);
                console.log(`[ALERT] Department ${dept} has DUPLICATE IDs! (${ids.length} ops, ${uniqueIds.size} unique)`);
                const seen = new Set();
                const dups = ids.filter((id: any) => {
                    if (seen.has(id)) return true;
                    seen.add(id);
                    return false;
                });
                console.log(`  Duplicate IDs: ${Array.from(new Set(dups)).join(', ')}`);

                // Print the names of the duplicate ops
                const duplicateNames = ops.filter((o: any) => dups.includes(o.id)).map((o: any) => o.name);
                console.log(`  Duplicate Op Names: ${JSON.stringify(duplicateNames, null, 2)}`);
            }
        });
    });

    if (!foundAny) {
        console.log('No duplicate IDs found in any MSN/Department.');
    }
}

debug();
