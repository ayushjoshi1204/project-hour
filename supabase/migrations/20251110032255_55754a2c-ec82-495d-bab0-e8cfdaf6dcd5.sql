-- Add user_id to employees table to link with auth.users
ALTER TABLE public.employees ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create security definer function to get emp_id for authenticated user
CREATE OR REPLACE FUNCTION public.get_emp_id_for_user(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT emp_id
  FROM public.employees
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all operations on employees" ON public.employees;
DROP POLICY IF EXISTS "Allow all operations on projects" ON public.projects;
DROP POLICY IF EXISTS "Allow all operations on timesheet" ON public.timesheet;

-- Create proper RLS policies for employees table
CREATE POLICY "Users can view their own employee record"
ON public.employees
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all employees"
ON public.employees
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own employee record"
ON public.employees
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all employees"
ON public.employees
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create proper RLS policies for projects table
CREATE POLICY "Authenticated users can view projects"
ON public.projects
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage projects"
ON public.projects
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create proper RLS policies for timesheet table
CREATE POLICY "Users can view their own timesheets"
ON public.timesheet
FOR SELECT
TO authenticated
USING (emp_id = public.get_emp_id_for_user(auth.uid()));

CREATE POLICY "Users can insert their own timesheets"
ON public.timesheet
FOR INSERT
TO authenticated
WITH CHECK (emp_id = public.get_emp_id_for_user(auth.uid()));

CREATE POLICY "Users can update their own timesheets"
ON public.timesheet
FOR UPDATE
TO authenticated
USING (emp_id = public.get_emp_id_for_user(auth.uid()))
WITH CHECK (emp_id = public.get_emp_id_for_user(auth.uid()));

CREATE POLICY "Users can delete their own timesheets"
ON public.timesheet
FOR DELETE
TO authenticated
USING (emp_id = public.get_emp_id_for_user(auth.uid()));

CREATE POLICY "Admins can view all timesheets"
ON public.timesheet
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all timesheets"
ON public.timesheet
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create proper RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));