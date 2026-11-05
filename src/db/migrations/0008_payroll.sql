CREATE TYPE "public"."payroll_run_status" AS ENUM('DRAFT', 'FINALIZED');--> statement-breakpoint
CREATE TABLE "payroll_run" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"month" text NOT NULL,
	"status" "payroll_run_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_id" text,
	"finalized_by_id" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"pf_enabled" boolean DEFAULT false NOT NULL,
	"esic_enabled" boolean DEFAULT false NOT NULL,
	"professional_tax_paise" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_settings_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "payslip" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_code" text NOT NULL,
	"employee_name" text NOT NULL,
	"designation" text,
	"working_days" integer NOT NULL,
	"paid_days" double precision NOT NULL,
	"unmarked_days" integer DEFAULT 0 NOT NULL,
	"basic_paise" bigint DEFAULT 0 NOT NULL,
	"hra_paise" bigint DEFAULT 0 NOT NULL,
	"other_paise" bigint DEFAULT 0 NOT NULL,
	"gross_paise" bigint DEFAULT 0 NOT NULL,
	"pf_paise" bigint DEFAULT 0 NOT NULL,
	"esic_paise" bigint DEFAULT 0 NOT NULL,
	"pt_paise" bigint DEFAULT 0 NOT NULL,
	"deductions_paise" bigint DEFAULT 0 NOT NULL,
	"net_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_structure" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"basic_paise" bigint DEFAULT 0 NOT NULL,
	"hra_paise" bigint DEFAULT 0 NOT NULL,
	"other_paise" bigint DEFAULT 0 NOT NULL,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_structure_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_run_id_payroll_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structure" ADD CONSTRAINT "salary_structure_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structure" ADD CONSTRAINT "salary_structure_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_run_company_month_uq" ON "payroll_run" USING btree ("company_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "payslip_run_employee_uq" ON "payslip" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payslip_employee_idx" ON "payslip" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "salary_company_idx" ON "salary_structure" USING btree ("company_id");