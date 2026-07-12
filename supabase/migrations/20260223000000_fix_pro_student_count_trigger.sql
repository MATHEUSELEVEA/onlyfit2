-- Fix the trigger function to use 'tenant_id' instead of 'pro_id' for 'pro_subscriptions' table
CREATE OR REPLACE FUNCTION fn_update_pro_student_count()
RETURNS trigger AS $$
BEGIN
    -- Increment on new active relationship
    IF (TG_OP = 'INSERT' AND NEW.status = 'active') THEN
        INSERT INTO pro_subscriptions (tenant_id, active_students_count)
        VALUES (NEW.coach_id, 1)
        ON CONFLICT (tenant_id) 
        DO UPDATE SET 
            active_students_count = pro_subscriptions.active_students_count + 1,
            billing_model = CASE 
                WHEN pro_subscriptions.active_students_count + 1 >= 30 THEN 'unlimited' 
                ELSE 'per_student' 
            END,
            updated_at = NOW();
            
    -- Decrement on status change from active
    ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status != 'active') THEN
        UPDATE pro_subscriptions 
        SET 
            active_students_count = GREATEST(0, active_students_count - 1),
            billing_model = CASE 
                WHEN GREATEST(0, active_students_count - 1) >= 30 THEN 'unlimited' 
                ELSE 'per_student' 
            END,
            updated_at = NOW()
        WHERE tenant_id = NEW.coach_id;
        
    -- Increment on status change to active
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'active' AND NEW.status = 'active') THEN
        UPDATE pro_subscriptions 
        SET 
            active_students_count = active_students_count + 1,
            billing_model = CASE 
                WHEN active_students_count + 1 >= 30 THEN 'unlimited' 
                ELSE 'per_student' 
            END,
            updated_at = NOW()
        WHERE tenant_id = NEW.coach_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
