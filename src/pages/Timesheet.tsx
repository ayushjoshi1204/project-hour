import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TimesheetHeader } from "@/components/timesheet/TimesheetHeader";
import { TimesheetTable } from "@/components/timesheet/TimesheetTable";
import { 
  startOfWeek, 
  endOfWeek, 
  addWeeks, 
  format, 
  parseISO,
  eachDayOfInterval,
  isSameDay
} from "date-fns";

export interface TimesheetRow {
  id: string;
  projectId: string;
  billingAction: string;
  activity: string;
  hours: { [key: string]: number };
  comments: string;
}

export interface Project {
  project_id: string;
  billing_action: string;
  activity_default: string | null;
  start_date: string;
  end_date: string;
  allocated_hours: number;
}

const Timesheet = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [empId, setEmpId] = useState("");
  const [empName, setEmpName] = useState("");
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedEmpId = sessionStorage.getItem("empId");
    const storedEmpName = sessionStorage.getItem("empName");

    if (!storedEmpId || !storedEmpName) {
      navigate("/");
      return;
    }

    setEmpId(storedEmpId);
    setEmpName(storedEmpName);
    loadProjects();
  }, [navigate]);

  useEffect(() => {
    if (empId) {
      loadTimesheetData();
    }
  }, [currentWeekStart, empId]);

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("project_id");

      if (error) throw error;
      setProjects(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      });
    }
  };

  const loadTimesheetData = async () => {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    try {
      const { data, error } = await supabase
        .from("timesheet")
        .select("*")
        .eq("emp_id", empId)
        .eq("week_start", weekStartStr)
        .eq("week_end", weekEndStr);

      if (error) throw error;

      if (data && data.length > 0) {
        const groupedData: { [key: string]: TimesheetRow } = {};

        data.forEach((entry: any) => {
          const key = `${entry.project_id}-${entry.activity}`;
          
          if (!groupedData[key]) {
            groupedData[key] = {
              id: key,
              projectId: entry.project_id,
              billingAction: "",
              activity: entry.activity,
              hours: {},
              comments: entry.comments || "",
            };
          }

          groupedData[key].hours[entry.date] = entry.hours;
        });

        const loadedRows = Object.values(groupedData);
        
        // Populate billing actions
        for (const row of loadedRows) {
          const project = projects.find(p => p.project_id === row.projectId);
          if (project) {
            row.billingAction = project.billing_action;
          }
        }

        setRows(loadedRows);
      } else {
        setRows([]);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load timesheet data",
        variant: "destructive",
      });
    }
  };

  const calculateTotalHours = () => {
    return rows.reduce((total, row) => {
      const rowTotal = Object.values(row.hours).reduce((sum, hours) => sum + hours, 0);
      return total + rowTotal;
    }, 0);
  };

  const validateTimesheet = async (): Promise<boolean> => {
    const totalHours = calculateTotalHours();
    
    if (totalHours < 42.5) {
      toast({
        title: "Validation Error",
        description: `Total weekly hours must be at least 42.5. Current total: ${totalHours.toFixed(1)}`,
        variant: "destructive",
      });
      return false;
    }

    // Check for duplicate project-activity combinations
    const combinations = new Set();
    for (const row of rows) {
      if (!row.projectId || !row.activity) {
        toast({
          title: "Validation Error",
          description: "All rows must have a project and activity",
          variant: "destructive",
        });
        return false;
      }

      const key = `${row.projectId}-${row.activity}`;
      if (combinations.has(key)) {
        toast({
          title: "Validation Error",
          description: `Duplicate project-activity combination found: ${row.projectId} - ${row.activity}`,
          variant: "destructive",
        });
        return false;
      }
      combinations.add(key);
    }

    // Check if already submitted
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    const { data: existingData } = await supabase
      .from("timesheet")
      .select("id")
      .eq("emp_id", empId)
      .eq("week_start", weekStartStr)
      .eq("week_end", weekEndStr)
      .limit(1);

    if (existingData && existingData.length > 0) {
      toast({
        title: "Validation Error",
        description: "You have already submitted for this week",
        variant: "destructive",
      });
      return false;
    }

    // Check allocated hours and project date windows
    for (const row of rows) {
      const project = projects.find(p => p.project_id === row.projectId);
      if (!project) continue;

      const rowTotal = Object.entries(row.hours).reduce((sum, [date, hours]) => {
        const entryDate = parseISO(date);
        const projectStart = parseISO(project.start_date);
        const projectEnd = parseISO(project.end_date);

        if (entryDate < projectStart || entryDate > projectEnd) {
          toast({
            title: "Validation Error",
            description: `Project ${row.projectId} is not active during this week`,
            variant: "destructive",
          });
          return sum;
        }

        return sum + hours;
      }, 0);

      if (rowTotal > project.allocated_hours) {
        toast({
          title: "Validation Error",
          description: `Exceeded allocated hours for Project ${row.projectId}`,
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    const isValid = await validateTimesheet();
    if (!isValid) return;

    setIsLoading(true);

    try {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      const entries = rows.flatMap(row => 
        Object.entries(row.hours)
          .filter(([_, hours]) => hours > 0)
          .map(([date, hours]) => ({
            emp_id: empId,
            project_id: row.projectId,
            activity: row.activity,
            date,
            hours,
            comments: row.comments,
            week_start: weekStartStr,
            week_end: weekEndStr,
          }))
      );

      const { error } = await supabase
        .from("timesheet")
        .insert(entries);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Timesheet submitted successfully!",
      });

      setRows([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit timesheet",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    sessionStorage.clear();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <TimesheetHeader
          empId={empId}
          empName={empName}
          currentWeekStart={currentWeekStart}
          onWeekChange={setCurrentWeekStart}
          totalHours={calculateTotalHours()}
          onSubmit={handleSubmit}
          onSignOut={handleSignOut}
          isLoading={isLoading}
        />

        <TimesheetTable
          rows={rows}
          setRows={setRows}
          projects={projects}
          currentWeekStart={currentWeekStart}
        />
      </div>
    </div>
  );
};

export default Timesheet;
