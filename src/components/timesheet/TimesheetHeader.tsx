import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { format, addWeeks, endOfWeek } from "date-fns";
import xyzLogo from "@/assets/xyz-company-logo.png";

interface TimesheetHeaderProps {
  empId: string;
  empName: string;
  currentWeekStart: Date;
  onWeekChange: (date: Date) => void;
  totalHours: number;
  onSubmit: () => void;
  onSignOut: () => void;
  isLoading: boolean;
}

export const TimesheetHeader = ({
  empId,
  empName,
  currentWeekStart,
  onWeekChange,
  totalHours,
  onSubmit,
  onSignOut,
  isLoading,
}: TimesheetHeaderProps) => {
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={xyzLogo} alt="XYZ Company" className="h-12 w-auto" />
          <div className="border-l border-border pl-4">
            <h1 className="text-2xl font-bold text-foreground">Timesheet Management System</h1>
            <p className="text-sm text-muted-foreground">XYZ Company</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onSignOut}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">Employee ID</Label>
          <div className="bg-label-bg rounded-md px-4 py-2.5 font-medium text-foreground">
            {empId}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">Employee Name</Label>
          <div className="bg-label-bg rounded-md px-4 py-2.5 font-medium text-foreground">
            {empName}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">Total Hours</Label>
          <div className={`rounded-md px-4 py-2.5 font-bold text-lg ${
            totalHours >= 42.5 ? "bg-success text-success-foreground" : "bg-destructive/10 text-destructive"
          }`}>
            {totalHours.toFixed(1)} / 42.5
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onWeekChange(addWeeks(currentWeekStart, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <div className="text-center min-w-[280px]">
            <div className="text-sm text-muted-foreground mb-1">Week Of</div>
            <div className="text-lg font-semibold text-foreground">
              {format(currentWeekStart, "d MMM yyyy")} → {format(weekEnd, "d MMM yyyy")}
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => onWeekChange(addWeeks(currentWeekStart, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Button
          onClick={onSubmit}
          disabled={isLoading || totalHours < 42.5}
          size="lg"
          className="min-w-[120px]"
        >
          {isLoading ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </div>
  );
};
