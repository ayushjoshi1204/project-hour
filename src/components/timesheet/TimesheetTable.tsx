import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimesheetRow, Project } from "@/pages/Timesheet";
import { format, addDays, eachDayOfInterval, endOfWeek } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface TimesheetTableProps {
  rows: TimesheetRow[];
  setRows: React.Dispatch<React.SetStateAction<TimesheetRow[]>>;
  projects: Project[];
  currentWeekStart: Date;
}

export const TimesheetTable = ({
  rows,
  setRows,
  projects,
  currentWeekStart,
}: TimesheetTableProps) => {
  const { toast } = useToast();
  
  const weekDays = eachDayOfInterval({
    start: currentWeekStart,
    end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
  }).slice(0, 7);

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: `row-${Date.now()}`,
        projectId: "",
        billingAction: "",
        activity: "",
        hours: {},
        comments: "",
      },
    ]);
  };

  const deleteRow = (id: string) => {
    setRows(rows.filter((row) => row.id !== id));
  };

  const updateRow = (id: string, field: keyof TimesheetRow, value: any) => {
    setRows(
      rows.map((row) => {
        if (row.id === id) {
          if (field === "projectId") {
            const project = projects.find((p) => p.project_id === value);
            return {
              ...row,
              projectId: value,
              billingAction: project?.billing_action || "",
              activity: project?.activity_default || row.activity,
            };
          }
          return { ...row, [field]: value };
        }
        return row;
      })
    );
  };

  const updateHours = (rowId: string, date: string, value: string) => {
    const hours = parseFloat(value) || 0;
    
    // Validate hours
    if (hours < 0) {
      toast({
        title: "Validation Error",
        description: "Hours cannot be negative",
        variant: "destructive",
      });
      return;
    }
    
    if (hours > 24) {
      toast({
        title: "Validation Error",
        description: "Hours cannot exceed 24 per day",
        variant: "destructive",
      });
      return;
    }
    
    setRows(
      rows.map((row) => {
        if (row.id === rowId) {
          return {
            ...row,
            hours: { ...row.hours, [date]: hours },
          };
        }
        return row;
      })
    );
  };

  const getRowTotal = (row: TimesheetRow) => {
    return Object.values(row.hours).reduce((sum, hours) => sum + hours, 0);
  };

  const getDayTotal = (date: string) => {
    return rows.reduce((sum, row) => sum + (row.hours[date] || 0), 0);
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-background">
        <Button onClick={addRow} variant="default" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Row
        </Button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-table-header border-b border-border">
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[150px]">
                Project ID
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[150px]">
                Billing Action
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[150px]">
                Activity
              </th>
              {weekDays.map((day) => (
                <th
                  key={day.toISOString()}
                  className="px-3 py-3 text-center text-sm font-semibold text-foreground min-w-[80px]"
                >
                  <div>{format(day, "EEE")}</div>
                  <div className="text-xs text-muted-foreground">{format(day, "d")}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-sm font-semibold text-foreground min-w-[100px]">
                Total
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[200px]">
                Comments
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                className="border-b border-border hover:bg-hover-row transition-colors"
              >
                <td className="px-4 py-3">
                  <Select
                    value={row.projectId}
                    onValueChange={(value) => updateRow(row.id, "projectId", value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50">
                      {projects.map((project) => (
                        <SelectItem key={project.project_id} value={project.project_id}>
                          {project.project_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <Input
                    value={row.billingAction}
                    readOnly
                    className="bg-muted"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    value={row.activity}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 200) {
                        updateRow(row.id, "activity", value);
                      } else {
                        toast({
                          title: "Validation Error",
                          description: "Activity must be less than 200 characters",
                          variant: "destructive",
                        });
                      }
                    }}
                    placeholder="Activity"
                    maxLength={200}
                  />
                </td>
                {weekDays.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  return (
                    <td key={day.toISOString()} className="px-3 py-3">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={row.hours[dateStr] || ""}
                        onChange={(e) => updateHours(row.id, dateStr, e.target.value)}
                        className="text-center w-full"
                        placeholder="0"
                      />
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center font-semibold text-foreground">
                  {getRowTotal(row).toFixed(1)}
                </td>
                <td className="px-4 py-3">
                  <Input
                    value={row.comments}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 500) {
                        updateRow(row.id, "comments", value);
                      } else {
                        toast({
                          title: "Validation Error",
                          description: "Comments must be less than 500 characters",
                          variant: "destructive",
                        });
                      }
                    }}
                    placeholder="Add comments"
                    maxLength={500}
                  />
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRow(row.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="bg-table-header font-semibold">
              <td colSpan={4} className="px-4 py-3 text-right text-foreground">
                Daily Total:
              </td>
              {weekDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const total = getDayTotal(dateStr);
                return (
                  <td key={day.toISOString()} className="px-3 py-3 text-center text-foreground">
                    {total.toFixed(1)}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-center text-primary font-bold text-lg">
                {rows.reduce((sum, row) => sum + getRowTotal(row), 0).toFixed(1)}
              </td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
