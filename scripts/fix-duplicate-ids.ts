
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

const generateId = () => Math.random().toString(36).substr(2, 9);

async function fix() {
    console.log('--- Starting ID Cleanup ---');
    const { data: units, error } = await supabase.from('msn_units').select('id, msn, dept_schedules');
    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    for (const unit of units || []) {
        let needsUpdate = false;
        const schedules = { ...unit.dept_schedules };

        Object.keys(schedules).forEach(dept => {
            const ops = schedules[dept].operations || [];
            if (ops.length === 0) return;

            const ids = ops.map((o: any) => o.id);
            const uniqueIds = new Set(ids);

            if (ids.length !== uniqueIds.size) {
                console.log(`Fixing MSN ${unit.msn} Department ${dept}...`);
                // Regenerate ALL IDs for this department to be absolutely sure they are unique
                schedules[dept].operations = ops.map((op: any) => ({
                    ...op,
                    id: generateId()
                }));
                needsUpdate = true;
            }
        });

        if (needsUpdate) {
            const { error: updateError } = await supabase
                .from('msn_units')
                .update({ dept_schedules: schedules })
                .eq('id', unit.id);

            if (updateError) {
                console.error(`Error updating MSN ${unit.msn}:`, updateError);
            } else {
                console.log(`MSN ${unit.msn} fixed.`);
            }
        }
    }

    console.log('--- Cleanup Complete ---');
}

fix();
