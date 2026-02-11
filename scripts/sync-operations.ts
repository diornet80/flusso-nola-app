
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const Department = {
    AUTOMATIZZATI: 'Automatizzati',
    PANNELLI: 'Pannelli',
    TOP: 'Top',
    FINALE: 'Finale',
    IMBALLAGGIO: 'Imballaggio'
};

const NEW_OPS = {
    [Department.PANNELLI]: [
        'SIDE PNL LH PRIMARIA',
        'SIDE PNL RH PRIMARIA',
        'STTG FRAME BTT ASSY',
        'HOUSING',
        'JOINT 41 DITTA', // Renamed from ENGITECH
        'BTT CARGO ASSY INST',
        'LINING LH RH',
        'CROWN PRIMARIA',
        'SECONDARIA SIDE LH',
        'SECONDARIA SIDE RH',
        'SECONDARIA CRW',
        'SECONDARIA BTT'
    ],
    [Department.TOP]: [
        'TOP ASSY STRUCTURE (SCALO)',
        'LAP JOINT STRINGER 6LH (SCALO)',
        'LAP JOINT STRINGER 6RH (SCALO)',
        'LAP JOINT STRINGER 32 LH (SCALO)',
        'LAP JOINT STRINGER 32 RH (SCALO)',
        'PAX FLOOR INST ACF (SCALO)',
        'TOP BRACKET INST (F/S SCALO)',
        'TOP BARREL (F/S SCALO)',
        'TOP ASSY EQUIPPED (F/S SCALO)',
        'END WALL INST (F/S SCALO)',
        'END WALL ASSY (F/S SCALO)',
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
    ]
};

async function sync() {
    console.log('--- Starting Database Synchronization ---');

    const { data: units, error } = await supabase
        .from('msn_units')
        .select('*');

    if (error) {
        console.error('Error fetching MSNs:', error);
        return;
    }

    console.log(`Found ${units?.length || 0} MSNs to process.`);

    for (const unit of units || []) {
        let updated = false;
        const newSchedules = { ...unit.dept_schedules };

        // Update PANNELLI
        if (newSchedules[Department.PANNELLI]) {
            const currentOps = newSchedules[Department.PANNELLI].operations || [];
            const usedIds = new Set<string>();
            const updatedOps = NEW_OPS[Department.PANNELLI].map(newName => {
                // Try to find matching existing op (even if renamed)
                const oldName = newName === 'JOINT 41 DITTA' ? 'JOINT 41 ENGITECH' : newName;
                const existing = currentOps.find((o: any) => (o.name === oldName || o.name === newName) && !usedIds.has(o.id));

                const id = existing?.id || Math.random().toString(36).substr(2, 9);
                usedIds.add(id);

                return {
                    id,
                    name: newName,
                    isCompleted: existing?.isCompleted || false,
                    state: existing?.state || 'todo'
                };
            });

            if (JSON.stringify(currentOps) !== JSON.stringify(updatedOps)) {
                newSchedules[Department.PANNELLI].operations = updatedOps;
                updated = true;
            }
        }

        // Update TOP
        if (newSchedules[Department.TOP]) {
            const currentOps = newSchedules[Department.TOP].operations || [];
            const usedIds = new Set<string>();
            const updatedOps = NEW_OPS[Department.TOP].map(newName => {
                const existing = currentOps.find((o: any) => o.name === newName && !usedIds.has(o.id));
                const id = existing?.id || Math.random().toString(36).substr(2, 9);
                usedIds.add(id);

                return {
                    id,
                    name: newName,
                    isCompleted: existing?.isCompleted || false,
                    state: existing?.state || 'todo'
                };
            });

            if (JSON.stringify(currentOps) !== JSON.stringify(updatedOps)) {
                newSchedules[Department.TOP].operations = updatedOps;
                updated = true;
            }
        }

        if (updated) {
            console.log(`Updating MSN ${unit.msn}...`);
            const { error: updateError } = await supabase
                .from('msn_units')
                .update({ dept_schedules: newSchedules })
                .eq('id', unit.id);

            if (updateError) {
                console.error(`Error updating MSN ${unit.msn}:`, updateError);
            }
        }
    }

    console.log('--- Synchronization Complete ---');
}

sync();
