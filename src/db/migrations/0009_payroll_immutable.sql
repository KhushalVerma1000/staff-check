-- A finalized payroll run, and every payslip in it, can no longer be changed.
-- The app already refuses; this makes the database refuse too, so a bug or a hand-run query cannot rewrite pay history.
-- (Deleting a whole company still cascades, because DELETE is not blocked here.)

CREATE FUNCTION payroll_run_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN
    RAISE EXCEPTION 'payroll run % is finalized and cannot be changed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER payroll_run_guard BEFORE UPDATE ON "payroll_run"
  FOR EACH ROW EXECUTE FUNCTION payroll_run_guard();--> statement-breakpoint

CREATE FUNCTION payslip_guard() RETURNS trigger AS $$
DECLARE
  run_status payroll_run_status;
  run_ref text;
BEGIN
  run_ref := CASE WHEN TG_OP = 'INSERT' THEN NEW.run_id ELSE OLD.run_id END;
  SELECT status INTO run_status FROM payroll_run WHERE id = run_ref;
  IF run_status = 'FINALIZED' THEN
    RAISE EXCEPTION 'payslips of finalized payroll run % cannot be changed', run_ref USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER payslip_guard BEFORE INSERT OR UPDATE ON "payslip"
  FOR EACH ROW EXECUTE FUNCTION payslip_guard();
