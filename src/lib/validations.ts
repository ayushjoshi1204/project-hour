import { z } from "zod";

// Authentication validation schemas
export const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  empId: z
    .string()
    .trim()
    .min(1, "Employee ID is required")
    .max(20, "Employee ID too long")
    .regex(/^E[0-9]+$/, "Employee ID must start with 'E' followed by numbers"),
  empName: z
    .string()
    .trim()
    .min(1, "Employee name is required")
    .max(100, "Employee name too long")
    .regex(/^[a-zA-Z\s]+$/, "Employee name can only contain letters and spaces"),
});

// Timesheet validation schemas
export const timesheetRowSchema = z.object({
  projectId: z.string().trim().min(1, "Project is required"),
  billingAction: z.string().trim().max(100, "Billing action too long"),
  activity: z.string().trim().min(1, "Activity is required").max(200, "Activity too long"),
  hours: z.number().min(0, "Hours cannot be negative").max(24, "Hours cannot exceed 24 per day"),
  comments: z.string().max(500, "Comments too long").optional(),
});

export type SignInFormData = z.infer<typeof signInSchema>;
export type SignUpFormData = z.infer<typeof signUpSchema>;
export type TimesheetRowData = z.infer<typeof timesheetRowSchema>;
