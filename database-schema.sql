
-- Chicken Track - Fuselage Assembly Schema (Nola Plant)

-- Departments lookup table
CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    name VARCHAR(50) NOT NULL -- 'Automatizzati', 'Pannelli', 'Top', 'Finale'
);

-- Main MSN Units
CREATE TABLE msn_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    msn_code VARCHAR(50) UNIQUE NOT NULL,
    part_number VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    current_department_id INTEGER NOT NULL REFERENCES departments(id),
    is_shipped BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Department specific schedules per MSN
CREATE TABLE msn_department_schedules (
    msn_id UUID REFERENCES msn_units(id) ON DELETE CASCADE,
    department_id INTEGER REFERENCES departments(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    PRIMARY KEY (msn_id, department_id)
);

-- Skins (One-to-Many relationship with MSN)
CREATE TABLE skins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    msn_id UUID NOT NULL REFERENCES msn_units(id) ON DELETE CASCADE,
    skin_type VARCHAR(10) NOT NULL, -- '5384', '5671', '5646', '5651', '5656'
    phase VARCHAR(30) NOT NULL DEFAULT 'MASTICIATURA', -- 'MASTICIATURA', 'MACCHINA', 'COMPLETAMENTO', 'QUALITY_GATE'
    is_completed BOOLEAN DEFAULT FALSE,
    UNIQUE(msn_id, skin_type)
);

-- Discrepancies (Gate Keeper)
CREATE TABLE discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    msn_id UUID NOT NULL REFERENCES msn_units(id) ON DELETE CASCADE,
    department_id INTEGER REFERENCES departments(id),
    defect_type VARCHAR(50),
    description TEXT,
    photo_url TEXT,
    is_open BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initial Data
INSERT INTO departments (id, name) VALUES 
(1, 'Automatizzati'),
(2, 'Pannelli'),
(3, 'Top'),
(4, 'Finale');
