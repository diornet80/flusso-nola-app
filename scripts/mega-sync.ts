
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

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
        'JOINT 41 DITTA',
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
    ],
    [Department.FINALE]: [
        'Verniciatura',
        'Applicazione Olio',
        'Gestione Discrepanze Finali',
        'Controlli Laser',
        'Controlli Finali Post-Vernice'
    ],
    [Department.IMBALLAGGIO]: [
        'Wrapping'
    ]
};

async function megaSync() {
    console.log('--- Starting MEGA Database Synchronization ---');

    const { data: units, error } = await supabase.from('msn_units').select('*');
    if (error) {
        console.error('Error fetching MSNs:', error);
        return;
    }

    console.log(`Processing ${units?.length} units...`);

    for (const unit of units || []) {
        let updated = false;
        const newSchedules = { ...unit.dept_schedules };

        for (const dept of [Department.PANNELLI, Department.TOP, Department.FINALE, Department.IMBALLAGGIO]) {
            if (!newSchedules[dept]) {
                // If department is missing, create it
                newSchedules[dept] = {
                    startDate: unit.start_date,
                    endDate: unit.end_date,
                    operations: [],
                    qualityStatus: 'OK'
                };
            }

            const currentOps = newSchedules[dept].operations || [];
            const targetOpsList = NEW_OPS[dept as keyof typeof NEW_OPS];

            // Force update if count doesn't match OR if it's the Top department (to be sure)
            if (currentOps.length !== targetOpsList.length || dept === Department.TOP) {
                const usedIds = new Set<string>();
                const updatedOps = targetOpsList.map(newName => {
                    const oldName = newName === 'JOINT 41 DITTA' ? 'JOINT 41 ENGITECH' : newName;

                    // Find matching op that HASN'T been used yet
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

                newSchedules[dept].operations = updatedOps;
                updated = true;
            }
        }

        if (updated) {
            console.log(`FORCE UPDATING MSN ${unit.msn}...`);
            const { error: updateError } = await supabase
                .from('msn_units')
                .update({ dept_schedules: newSchedules })
                .eq('id', unit.id);

            if (updateError) console.error(`Error updating MSN ${unit.msn}:`, updateError);
        }
    }

    console.log('--- MEGA Synchronization Complete ---');
}

megaSync();
