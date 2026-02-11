import { supabase } from '../lib/supabase';
import { MSNUnit, Department } from '../types';

export interface DatabaseMSNUnit {
    id: string;
    msn: string;
    part_number: string;
    start_date: string;
    end_date: string;
    wrapping_date?: string;
    planned_shipping_date?: string;
    current_department: string;
    dept_schedules: any;
    discrepancies: any[];
    shipped: boolean;
    shipped_at?: string;
    created_at: string;
    updated_at: string;
}

// Convert database format to app format
const dbToApp = (dbUnit: DatabaseMSNUnit): MSNUnit => ({
    id: dbUnit.id,
    msn: dbUnit.msn,
    partNumber: dbUnit.part_number,
    startDate: dbUnit.start_date,
    endDate: dbUnit.end_date,
    wrappingDate: dbUnit.wrapping_date,
    plannedShippingDate: dbUnit.planned_shipping_date,
    currentDepartment: dbUnit.current_department as Department,
    deptSchedules: dbUnit.dept_schedules,
    discrepancies: dbUnit.discrepancies,
    shipped: dbUnit.shipped,
    shippedAt: dbUnit.shipped_at
});

// Convert app format to database format
const appToDb = (appUnit: Partial<MSNUnit>): Partial<DatabaseMSNUnit> => {
    const db: any = {};
    if (appUnit.msn !== undefined) db.msn = appUnit.msn;
    if (appUnit.partNumber !== undefined) db.part_number = appUnit.partNumber;
    if (appUnit.startDate !== undefined) db.start_date = appUnit.startDate;
    if (appUnit.endDate !== undefined) db.end_date = appUnit.endDate;
    if (appUnit.wrappingDate !== undefined) db.wrapping_date = appUnit.wrappingDate;
    if (appUnit.plannedShippingDate !== undefined) db.planned_shipping_date = appUnit.plannedShippingDate;
    if (appUnit.currentDepartment !== undefined) db.current_department = appUnit.currentDepartment;
    if (appUnit.deptSchedules !== undefined) db.dept_schedules = appUnit.deptSchedules;
    if (appUnit.discrepancies !== undefined) db.discrepancies = appUnit.discrepancies;
    if (appUnit.shipped !== undefined) db.shipped = appUnit.shipped;
    if (appUnit.shippedAt !== undefined) db.shipped_at = appUnit.shippedAt;
    return db;
};

export const databaseService = {
    // Fetch all MSN units
    async fetchAllMSNs(): Promise<MSNUnit[]> {
        try {
            const { data, error } = await supabase
                .from('msn_units')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []).map(dbToApp);
        } catch (error) {
            console.error('Error fetching MSNs:', error);
            throw error;
        }
    },

    // Create a new MSN unit
    async createMSN(msnData: Omit<MSNUnit, 'id'>): Promise<MSNUnit> {
        try {
            const dbData = appToDb(msnData);
            const { data, error } = await supabase
                .from('msn_units')
                .insert([dbData])
                .select()
                .single();

            if (error) throw error;
            return dbToApp(data);
        } catch (error) {
            console.error('Error creating MSN:', error);
            throw error;
        }
    },

    // Update an existing MSN unit
    async updateMSN(id: string, updates: Partial<MSNUnit>): Promise<MSNUnit> {
        try {
            const dbUpdates = appToDb(updates);
            const { data, error } = await supabase
                .from('msn_units')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return dbToApp(data);
        } catch (error) {
            console.error('Error updating MSN:', error);
            throw error;
        }
    },

    // Delete an MSN unit
    async deleteMSN(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('msn_units')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error deleting MSN:', error);
            throw error;
        }
    },

    // Mark MSN as shipped
    async shipMSN(id: string): Promise<MSNUnit> {
        try {
            const { data, error } = await supabase
                .from('msn_units')
                .update({
                    shipped: true,
                    shipped_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return dbToApp(data);
        } catch (error) {
            console.error('Error shipping MSN:', error);
            throw error;
        }
    },

    // Unship MSN
    async unshipMSN(id: string): Promise<MSNUnit> {
        try {
            const { data, error } = await supabase
                .from('msn_units')
                .update({
                    shipped: false,
                    shipped_at: null
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return dbToApp(data);
        } catch (error) {
            console.error('Error unshipping MSN:', error);
            throw error;
        }
    },

    // Batch create/update MSNs (for import)
    async upsertMSNs(msns: Partial<MSNUnit>[]): Promise<MSNUnit[]> {
        try {
            const dbData = msns.map(appToDb);
            const { data, error } = await supabase
                .from('msn_units')
                .upsert(dbData, { onConflict: 'msn' })
                .select();

            if (error) throw error;
            return (data || []).map(dbToApp);
        } catch (error) {
            console.error('Error upserting MSNs:', error);
            throw error;
        }
    },

    // Sync Finale Operations
    async syncFinaleOperations(newOperationNames: string[]): Promise<void> {
        try {
            console.log("Starting Finale Operations Sync...");
            // 1. Fetch all
            const { data: allMsns, error: fetchError } = await supabase
                .from('msn_units')
                .select('*');

            if (fetchError) throw fetchError;
            if (!allMsns || allMsns.length === 0) return;

            const updates = allMsns.map((dbUnit: DatabaseMSNUnit) => {
                const msn = dbToApp(dbUnit);
                const finaleSchedule = msn.deptSchedules?.[Department.FINALE];

                if (!finaleSchedule) return null; // Should not happen if data is consistent

                // Create new operations list
                // Try to preserve state if name matches exactly. Use a copy to "consume" matches.
                const availableOps = [...(finaleSchedule.operations || [])];

                const newOps = newOperationNames.map(name => {
                    const existingIndex = availableOps.findIndex((op: any) => op.name === name);
                    if (existingIndex !== -1) {
                        const [foundOp] = availableOps.splice(existingIndex, 1);
                        return foundOp; // Keep ID, state, etc.
                    } else {
                        return {
                            id: Math.random().toString(36).substr(2, 9),
                            name: name,
                            isCompleted: false,
                            state: 'todo' as const // Default for new
                        };
                    }
                });

                const newSchedule = {
                    ...finaleSchedule,
                    operations: newOps
                };

                const newDeptSchedules = {
                    ...msn.deptSchedules,
                    [Department.FINALE]: newSchedule
                };

                return appToDb({ ...msn, deptSchedules: newDeptSchedules });
            }).filter(u => u !== null);

            if (updates.length > 0) {
                const { error: upsertError } = await supabase
                    .from('msn_units')
                    .upsert(updates as any, { onConflict: 'msn' }); // Cast because appToDb returns Partial but upsert expects records
                if (upsertError) throw upsertError;
            }
            console.log(`Synced operations for ${updates.length} MSNs.`);

        } catch (error) {
            console.error('Error syncing Finale operations:', error);
            throw error;
        }
    },

    // Sync Finale Updates from Excel
    async syncFinaleUpdates(updates: any[]): Promise<void> {
        try {
            console.log("Starting Finale Updates Sync...", updates.length);
            const allMsns = await this.fetchAllMSNs();
            const updatesToSave: any[] = [];

            for (const update of updates) {
                const msnUnit = allMsns.find(u => u.msn === update.msn);
                if (msnUnit) {
                    const schedule = msnUnit.deptSchedules?.[Department.FINALE];
                    if (schedule && schedule.operations) {
                        const newOperations = schedule.operations.map((op: any) => {
                            const updateForOp = update.operationUpdates.find(
                                (u: any) => u.operationName.toUpperCase() === op.name.toUpperCase()
                            );
                            if (updateForOp) {
                                return {
                                    ...op,
                                    isCompleted: updateForOp.isCompleted,
                                    state: updateForOp.state,
                                    // Optionally update percentage if we have it?
                                    // The parser returns percentage.
                                    // But Operation type might not have percentage?
                                    // Let's assume we map standard fields.
                                };
                            }
                            return op;
                        });

                        const newSchedule = { ...schedule, operations: newOperations };
                        const newDeptSchedules = {
                            ...msnUnit.deptSchedules,
                            [Department.FINALE]: newSchedule
                        };

                        updatesToSave.push(appToDb({ ...msnUnit, deptSchedules: newDeptSchedules }));
                    }
                }
            }

            if (updatesToSave.length > 0) {
                const { error } = await supabase
                    .from('msn_units')
                    .upsert(updatesToSave, { onConflict: 'msn' });
                if (error) throw error;
            }
            console.log(`Synced Excel updates for ${updatesToSave.length} MSNs.`);

        } catch (error) {
            console.error('Error syncing Finale updates:', error);
            throw error;
        }
    }
};
