import { createClient } from '@supabase/supabase-js';

const url = 'https://owvooxzbezanycvcpngi.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93dm9veHpiZXphbnljdmNwbmdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMzc4MzAsImV4cCI6MjA4NTYxMzgzMH0.vdwL4KEj6JBKLW8rtPcaxDPhcfbfldgVdpN8Ghx_Liw';

const supabase = createClient(url, key);

async function testUpsert() {
    console.log('Testing connection...');

    const testData = {
        msn: 'TEST-999',
        part_number: 'A321-TEST',
        start_date: '2026-01-01',
        end_date: '2026-02-01',
        current_department: 'AUTOMATIZZATI',
        dept_schedules: {},
        discrepancies: [],
        shipped: false
    };

    const { data, error } = await supabase
        .from('msn_units')
        .upsert([testData], { onConflict: 'msn' })
        .select();

    if (error) {
        console.error('❌ Error:', error);
    } else {
        console.log('✅ Success! Data:', data);
    }
}

testUpsert();
