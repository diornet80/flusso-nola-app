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
const appToDb = (appUnit: Partial<MSNUnit>): Partial<DatabaseMSNUnit> => ({
    msn: appUnit.msn,
    part_number: appUnit.partNumber,
    start_date: appUnit.startDate,
    end_date: appUnit.endDate,
    wrapping_date: appUnit.wrappingDate,
    planned_shipping_date: appUnit.plannedShippingDate,
    current_department: appUnit.currentDepartment,
    dept_schedules: appUnit.deptSchedules,
    discrepancies: appUnit.discrepancies,
    shipped: appUnit.shipped,
    shipped_at: appUnit.shippedAt
});

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
    }
};
