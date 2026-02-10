
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

const newTopOps = [
    'TOP ASSY STRUCTURE',
    'LAP JOINT STRINGER 6LH',
    'LAP JOINT STRINGER 6RH',
    'LAP JOINT STRINGER 32 LH',
    'LAP JOINT STRINGER 32 RH',
    'PAX FLOOR INST ACF',
    'TOP BRACKET INSTL',
    'TOP BARREL',
    'TOP ASSY EQUIPPED',
    'END WALL INSTL',
    'END WALL ASSY',
    'FLOOR BEAM ASSY 35.0 ACF',
    'FLOOR BEAM ASSY 35.1 ACF',
    'FLOOR BEAM ASSY 35.2 ACF',
    'FLOOR BEAM ASSY 35.3 ACF',
    'FLOOR BEAM ASSY 35.4 ACF',
    'FLOOR BEAM ASSY 35.5 ACF',
    'FLOOR BEAM ASSY 35.6 ACF',
    'FLOOR BEAM ASSY 35.7 ACF',
    'PAX FLOOR ACF BRACKET INSTL',
    'PAX FLOOR ASSY EQUIPPED ACF',
];

// Mapping from old names (with suffixes) to new names
const nameMapping: Record<string, string> = {
    'TOP ASSY STRUCTURE (SCALO)': 'TOP ASSY STRUCTURE',
    'LAP JOINT STRINGER 6LH (SCALO)': 'LAP JOINT STRINGER 6LH',
    'LAP JOINT STRINGER 6RH (SCALO)': 'LAP JOINT STRINGER 6RH',
    'LAP JOINT STRINGER 32 LH (SCALO)': 'LAP JOINT STRINGER 32 LH',
    'LAP JOINT STRINGER 32 RH (SCALO)': 'LAP JOINT STRINGER 32 RH',
    'PAX FLOOR INST ACF (SCALO)': 'PAX FLOOR INST ACF',
    'TOP BRACKET INST (F/S SCALO)': 'TOP BRACKET INSTL',
    'TOP BRACKET INSTL (F/S SCALO)': 'TOP BRACKET INSTL',
    'TOP BARREL (F/S SCALO)': 'TOP BARREL',
    'TOP ASSY EQUIPPED (F/S SCALO)': 'TOP ASSY EQUIPPED',
    'END WALL INST (F/S SCALO)': 'END WALL INSTL',
    'END WALL INSTL (F/S SCALO)': 'END WALL INSTL',
    'END WALL ASSY (F/S SCALO)': 'END WALL ASSY',
};

async function updateTopOps() {
    console.log('Fetching MSNs...');
    const { data: msns, error } = await supabase.from('msn_units').select('*');

    if (error) {
        console.error('Error fetching MSNs:', error);
        return;
    }

    console.log(`Found ${msns.length} MSNs. Updating TOP operations...`);

    let updatedCount = 0;

    for (const msn of msns) {
        const currentSchedule = msn.dept_schedules?.Top;

        if (!currentSchedule || !currentSchedule.operations) {
            console.log(`Skipping MSN ${msn.msn} (no TOP schedule)`);
            continue;
        }

        const oldOps = currentSchedule.operations;
        const newOpsObjects = newTopOps.map(newOpName => {
            // Find matching old operation
            // 1. Try exact match
            let oldOp = oldOps.find((o: any) => o.name === newOpName);

            // 2. Try mapped match
            if (!oldOp) {
                // Find if any old op maps to this new name
                const oldNameEntry = Object.entries(nameMapping).find(([old, newN]) => newN === newOpName);
                if (oldNameEntry) {
                    oldOp = oldOps.find((o: any) => o.name === oldNameEntry[0]);
                }
            }

            // 3. Try fuzzy match (contains)
            if (!oldOp) {
                oldOp = oldOps.find((o: any) => newOpName.includes(o.name) || o.name.includes(newOpName));
            }

            return {
                name: newOpName,
                state: oldOp ? oldOp.state : 'todo',
                isCompleted: oldOp ? oldOp.isCompleted : false,
                lastUpdated: oldOp ? oldOp.lastUpdated : undefined
            };
        });

        // Update MSN
        const { error: updateError } = await supabase
            .from('msn_units')
            .update({
                dept_schedules: {
                    ...msn.dept_schedules,
                    Top: {
                        ...currentSchedule,
                        operations: newOpsObjects
                    }
                }
            })
            .eq('id', msn.id);

        if (updateError) {
            console.error(`Error updating MSN ${msn.msn}:`, updateError);
        } else {
            updatedCount++;
        }
    }

    console.log(`Updated ${updatedCount} MSNs successfully.`);
}

updateTopOps();
