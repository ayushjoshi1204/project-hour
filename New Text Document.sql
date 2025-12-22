-- Drop tables in dependency-safe order
DROP TABLE IF EXISTS TimesheetEntries CASCADE;
DROP TABLE IF EXISTS Timesheets CASCADE;
DROP TABLE IF EXISTS Allocations CASCADE;
DROP TABLE IF EXISTS Projects CASCADE;
DROP TABLE IF EXISTS Employees CASCADE;

-- =====================================================================
-- EMPLOYEES TABLE
-- =====================================================================
CREATE TABLE Employees (
    EmployeeID SERIAL PRIMARY KEY,
    EmpID VARCHAR(50) UNIQUE NOT NULL,
    Name VARCHAR(255) NOT NULL,
    Email VARCHAR(255) UNIQUE NOT NULL,
    Password VARCHAR(255) NOT NULL,

    -- Roles: admin, employee, pm
    Role VARCHAR(20) NOT NULL CHECK (Role IN ('admin', 'employee', 'pm')),

    DOJ DATE NOT NULL,

    Status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (Status IN ('active', 'inactive')),

    -- Added from utilization update
    Tribe VARCHAR(64),
    Team VARCHAR(64),
    WorkHoursPerWeek NUMERIC(5,2) DEFAULT 42.5,

    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT employees_tribe_chk
        CHECK (Tribe IS NULL OR Tribe IN ('UKI','Non-UKI')),
    CONSTRAINT employees_team_chk
        CHECK (Team IS NULL OR Team IN ('PM','SA','BA','Developer','Tribe Lead'))
);


-- =====================================================================
-- PROJECTS TABLE
-- =====================================================================
CREATE TABLE Projects (
    ProjectID SERIAL PRIMARY KEY,
    ProjectCode VARCHAR(50) UNIQUE NOT NULL,
    Entity VARCHAR(255) NOT NULL,
    BillingAction VARCHAR(255) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,

    Status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (Status IN ('active', 'inactive', 'completed')),

    -- Added from Add_Project_Tribe migration
    Tribe VARCHAR(64),
    CONSTRAINT projects_tribe_chk
        CHECK (Tribe IS NULL OR Tribe IN ('UKI','Non-UKI')),

    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_project_dates CHECK (EndDate >= StartDate)
);

-- =====================================================================
-- ALLOCATIONS TABLE
-- =====================================================================
CREATE TABLE Allocations (
    AllocationID SERIAL PRIMARY KEY,
    EmployeeID INTEGER NOT NULL REFERENCES Employees(EmployeeID) ON DELETE CASCADE,
    ProjectID INTEGER NOT NULL REFERENCES Projects(ProjectID) ON DELETE CASCADE,

    EmpName VARCHAR(255) NOT NULL,
    Role VARCHAR(255) NOT NULL,

    AllocatedHours DECIMAL(10, 2) NOT NULL CHECK (AllocatedHours >= 0),

    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(EmployeeID, ProjectID)
);

-- =====================================================================
-- TIMESHEETS TABLE
-- =====================================================================
CREATE TABLE Timesheets (
    TimesheetID SERIAL PRIMARY KEY,
    EmployeeID INTEGER NOT NULL REFERENCES Employees(EmployeeID) ON DELETE CASCADE,

    WeekStartDate DATE NOT NULL,
    WeekEndDate DATE NOT NULL,
    
    Status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (Status IN ('draft', 'submitted')),

    SubmittedAt TIMESTAMP,

    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_week_dates CHECK (WeekEndDate >= WeekStartDate),
    UNIQUE(EmployeeID, WeekStartDate)
);

-- =====================================================================
-- TIMESHEET ENTRIES TABLE
-- =====================================================================
CREATE TABLE TimesheetEntries (
    EntryID SERIAL PRIMARY KEY,
    TimesheetID INTEGER NOT NULL REFERENCES Timesheets(TimesheetID) ON DELETE CASCADE,

    -- Updated from non-billable migration
    AllocationID INTEGER REFERENCES Allocations(AllocationID) ON DELETE CASCADE,

    EntryDate DATE NOT NULL,

    Hours DECIMAL(10, 2) NOT NULL
        CHECK (Hours >= 0 AND Hours <= 24),

    Notes TEXT,

    -- Non-billable support
    IsNonBillable BOOLEAN DEFAULT FALSE,
    Activity VARCHAR(255),
    BillingAction VARCHAR(255),

    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure valid state
    CONSTRAINT check_allocation_or_nonbillable CHECK (
        (AllocationID IS NOT NULL)
        OR
        (IsNonBillable = TRUE AND Activity IS NOT NULL AND BillingAction IS NOT NULL)
    )
);

-- =====================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================

-- Employees
CREATE INDEX idx_employees_empid ON Employees(EmpID);
CREATE INDEX idx_employees_email ON Employees(Email);

-- Projects
CREATE INDEX idx_projects_code ON Projects(ProjectCode);

-- Allocations
CREATE INDEX idx_allocations_employee ON Allocations(EmployeeID);
CREATE INDEX idx_allocations_project ON Allocations(ProjectID);
CREATE INDEX idx_allocations_emp_proj ON Allocations(EmployeeID, ProjectID);

-- Timesheets
CREATE INDEX idx_timesheets_employee ON Timesheets(EmployeeID);
CREATE INDEX idx_timesheets_dates ON Timesheets(WeekStartDate, WeekEndDate);

-- Timesheet Entries
CREATE INDEX idx_tse_timesheet ON TimesheetEntries(TimesheetID);
CREATE INDEX idx_tse_allocation ON TimesheetEntries(AllocationID);
CREATE INDEX idx_tse_alloc_date ON TimesheetEntries(AllocationID, EntryDate);

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- Working days function (used in utilization dashboard)
CREATE OR REPLACE FUNCTION working_days(start_date DATE, end_date DATE)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
    SELECT COUNT(*)::int
    FROM generate_series(start_date, end_date, INTERVAL '1 day') d(day)
    WHERE EXTRACT(ISODOW FROM d.day) < 6;
$$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.UpdatedAt = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON Employees
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON Projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_allocations_updated_at
BEFORE UPDATE ON Allocations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheets_updated_at
BEFORE UPDATE ON Timesheets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheet_entries_updated_at
BEFORE UPDATE ON TimesheetEntries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- END OF FINAL SCHEMA
-- =====================================================================


select * from public.allocations;
select * from public.projects;
select * from public.timesheetentries;
select * from public.employees;





-- dummy data
-- =====================================================================
-- INSERT DUMMY DATA
-- =====================================================================

-- ===========================
-- EMPLOYEES
-- ===========================
INSERT INTO Employees (EmpID, Name, Email, Password, Role, DOJ, Status, Tribe, Team, WorkHoursPerWeek)
VALUES
('E001', 'Ayush Joshi', 'ayush@example.com', 'hashedpassword1', 'admin', '2022-01-10', 'active', 'UKI', 'PM', 42.5),
('E002', 'Rohan Mehta', 'rohan@example.com', 'hashedpassword2', 'employee', '2023-03-12', 'active', 'Non-UKI', 'Developer', 40),
('E003', 'Sneha Patil', 'sneha@example.com', 'hashedpassword3', 'pm', '2021-07-01', 'active', 'UKI', 'BA', 42.5),
('E004', 'Ananya Singh', 'ananya@example.com', 'hashedpassword4', 'employee', '2024-01-05', 'active', 'Non-UKI', 'Developer', 38),
('E005', 'Vikram Rao', 'vikram@example.com', 'hashedpassword5', 'employee', '2022-09-09', 'active', 'UKI', 'SA', 40);

-- ===========================
-- PROJECTS
-- ===========================
INSERT INTO Projects (ProjectCode, Entity, BillingAction, StartDate, EndDate, Status, Tribe)
VALUES
('P1001', 'Accenture UK', 'Billable', '2024-01-01', '2025-12-31', 'active', 'UKI'),
('P1002', 'Accenture India', 'Non-Billable', '2023-05-10', '2025-03-31', 'active', 'Non-UKI'),
('P1003', 'Internal R&D', 'Non-Billable', '2024-06-01', '2026-06-01', 'active', NULL);

-- ===========================
-- ALLOCATIONS
-- ===========================
INSERT INTO Allocations (EmployeeID, ProjectID, EmpName, Role, AllocatedHours)
VALUES
(1, 1, 'Ayush Joshi', 'PM', 20),
(2, 1, 'Rohan Mehta', 'Developer', 40),
(3, 1, 'Sneha Patil', 'BA', 30),
(4, 2, 'Ananya Singh', 'Developer', 35),
(5, 3, 'Vikram Rao', 'SA', 15);

-- ===========================
-- TIMESHEETS
-- ===========================
INSERT INTO Timesheets (EmployeeID, WeekStartDate, WeekEndDate, Status, SubmittedAt)
VALUES
(1, '2025-01-06', '2025-01-12', 'submitted', CURRENT_TIMESTAMP),
(2, '2025-01-06', '2025-01-12', 'submitted', CURRENT_TIMESTAMP),
(3, '2025-01-06', '2025-01-12', 'submitted', CURRENT_TIMESTAMP),
(4, '2025-01-06', '2025-01-12', 'submitted', CURRENT_TIMESTAMP),
(5, '2025-01-06', '2025-01-12', 'submitted', CURRENT_TIMESTAMP);

-- ===========================
-- TIMESHEET ENTRIES (Billable)
-- ===========================
INSERT INTO TimesheetEntries (TimesheetID, AllocationID, EntryDate, Hours, Notes, IsNonBillable)
VALUES
(1, 1, '2025-01-06', 5.0, 'Project planning', FALSE),
(1, 1, '2025-01-07', 4.5, 'Client alignment', FALSE),

(2, 2, '2025-01-06', 8.0, 'API development', FALSE),
(2, 2, '2025-01-07', 7.0, 'Bug fixes', FALSE),

(3, 3, '2025-01-06', 6.0, 'Requirement analysis', FALSE),
(3, 3, '2025-01-07', 6.0, 'Documentation', FALSE),

(4, 4, '2025-01-06', 7.0, 'UI development', FALSE),
(4, 4, '2025-01-07', 6.5, 'Component integration', FALSE);

-- ===========================
-- TIMESHEET ENTRIES (Non-Billable)
-- ===========================
INSERT INTO TimesheetEntries (TimesheetID, AllocationID, EntryDate, Hours, Notes, IsNonBillable, Activity, BillingAction)
VALUES
(5, NULL, '2025-01-06', 4.0, 'Induction training', TRUE, 'Training', 'Non-Billable'),
(5, NULL, '2025-01-07', 3.5, 'Internal meetings', TRUE, 'Internal Meeting', 'Non-Billable'),
(1, NULL, '2025-01-08', 2.0, 'POC Research', TRUE, 'R&D', 'Non-Billable');



-- remove the team check constraint
ALTER TABLE Employees
DROP CONSTRAINT IF EXISTS employees_team_chk;

-- operation manager check
INSERT INTO Employees 
(EmpID, Name, Email, Password, Role, DOJ, Status, Tribe, Team, WorkHoursPerWeek)
VALUES
(
    'E999',                      -- EmpID
    'John Doe',                 -- Name
    'john.doe@example.com',     -- Email
    'hashedpassword123',        -- Password (replace with your bcrypt hash)
    'employee',                 -- Role
    '2025-01-01',               -- DOJ
    'active',                   -- Status
    'UKI',                      -- Tribe
    'Operation Manager',        -- Team 
    42.5                          -- Work hours
);

BEGIN;

-- 1️⃣ Add allocation_month column if not exists
ALTER TABLE allocations
ADD COLUMN IF NOT EXISTS allocation_month INT;

-- 2️⃣ Add allocation_year column if not exists
ALTER TABLE allocations
ADD COLUMN IF NOT EXISTS allocation_year INT;

-- 3️⃣ Add constraint for valid month (1–12)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'allocation_month_range'
    ) THEN
        ALTER TABLE allocations
        ADD CONSTRAINT allocation_month_range
        CHECK (
            allocation_month IS NULL
            OR allocation_month BETWEEN 1 AND 12
        );
    END IF;
END $$;

-- 4️⃣ Add constraint for valid year (2000–2100)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'allocation_year_range'
    ) THEN
        ALTER TABLE allocations
        ADD CONSTRAINT allocation_year_range
        CHECK (
            allocation_year IS NULL
            OR allocation_year BETWEEN 2000 AND 2100
        );
    END IF;
END $$;

-- 5️⃣ Optional index for faster queries (month/year filters)
CREATE INDEX IF NOT EXISTS idx_allocations_month_year
ON allocations (allocation_year, allocation_month);

COMMIT;

ROLLBACK;



