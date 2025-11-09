import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import xyzLogo from "@/assets/xyz-company-logo.png";

const SignIn = () => {
  const [empId, setEmpId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!empId.trim()) {
      toast({
        title: "Error",
        description: "Please enter your Employee ID",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("emp_id", empId.trim())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: "Error",
          description: "Employee ID not found",
          variant: "destructive",
        });
        return;
      }

      // Store employee info in session storage
      sessionStorage.setItem("empId", data.emp_id);
      sessionStorage.setItem("empName", data.emp_name);

      toast({
        title: "Success",
        description: `Welcome, ${data.emp_name}!`,
      });

      navigate("/timesheet");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign in",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <img src={xyzLogo} alt="XYZ Company" className="h-20 w-auto" />
          </div>
          <CardTitle className="text-2xl font-bold">Timesheet Management System</CardTitle>
          <CardDescription className="text-base">
            XYZ Company - Enter your Employee ID to access your timesheet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="empId">Employee ID</Label>
              <Input
                id="empId"
                placeholder="E.g., E001"
                value={empId}
                onChange={(e) => setEmpId(e.target.value.toUpperCase())}
                disabled={isLoading}
                className="text-base"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              Sample IDs: E001, E002, E003
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignIn;
