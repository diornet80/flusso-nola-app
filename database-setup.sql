-- Create MSN Units Table
CREATE TABLE IF NOT EXISTS msn_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msn TEXT UNIQUE NOT NULL,
  part_number TEXT NOT NULL DEFAULT 'A321-NOLA',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  wrapping_date DATE,
  planned_shipping_date DATE,
  current_department TEXT NOT NULL,
  dept_schedules JSONB NOT NULL DEFAULT '{}'::jsonb,
  discrepancies JSONB NOT NULL DEFAULT '[]'::jsonb,
  shipped BOOLEAN NOT NULL DEFAULT false,
  shipped_at TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_msn_units_msn ON msn_units(msn);
CREATE INDEX IF NOT EXISTS idx_msn_units_shipped ON msn_units(shipped);
CREATE INDEX IF NOT EXISTS idx_msn_units_current_department ON msn_units(current_department);

-- Enable Row Level Security (RLS)
ALTER TABLE msn_units ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (you can customize this later)
CREATE POLICY "Enable all access for all users" ON msn_units
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_msn_units_updated_at
  BEFORE UPDATE ON msn_units
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
