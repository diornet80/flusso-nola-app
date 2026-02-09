
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
    const { data: units } = await supabase.from('msn_units').select('msn, dept_schedules');
    const faulty = units?.filter(u => (u.dept_schedules?.Top?.operations?.length || 0) !== 21);
    console.log(`Units with != 21 Top ops: ${faulty?.length || 0}`);
    faulty?.slice(0, 5).forEach(u => {
        console.log(`MSN: ${u.msn}, Ops: ${u.dept_schedules?.Top?.operations?.length || 0}`);
    });
}

check();
