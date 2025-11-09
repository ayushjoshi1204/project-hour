-- Create employees table
CREATE TABLE public.employees (
  emp_id TEXT PRIMARY KEY,
  emp_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create projects table
CREATE TABLE public.projects (
  project_id TEXT PRIMARY KEY,
  billing_action TEXT NOT NULL,
  activity_default TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  allocated_hours NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create timesheet table
CREATE TABLE public.timesheet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id TEXT NOT NULL REFERENCES public.employees(emp_id),
  project_id TEXT NOT NULL REFERENCES public.projects(project_id),
  activity TEXT NOT NULL,
  date DATE NOT NULL,
  hours NUMERIC NOT NULL DEFAULT 0,
  comments TEXT,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create unique constraint for emp_id, project_id, activity per week
CREATE UNIQUE INDEX idx_unique_emp_project_activity_week 
ON public.timesheet(emp_id, project_id, activity, week_start);

-- Create index for better query performance
CREATE INDEX idx_timesheet_emp_week ON public.timesheet(emp_id, week_start, week_end);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required for now)
CREATE POLICY "Allow all operations on employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on timesheet" ON public.timesheet FOR ALL USING (true) WITH CHECK (true);

-- Insert sample employees
INSERT INTO public.employees (emp_id, emp_name) VALUES 
  ('E001', 'John Smith'),
  ('E002', 'Sarah Johnson'),
  ('E003', 'Michael Chen');

-- Insert sample projects
INSERT INTO public.projects (project_id, billing_action, activity_default, start_date, end_date, allocated_hours) VALUES 
  ('P001', 'Billable', 'Development', '2025-01-01', '2025-12-31', 500),
  ('P002', 'Non-Billable', 'Training', '2025-01-01', '2025-12-31', 200),
  ('P003', 'Billable', 'Testing', '2025-01-01', '2025-06-30', 300);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_timesheet_updated_at
BEFORE UPDATE ON public.timesheet
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();