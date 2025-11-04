-- Add danielqazi89@gmail.com as admin user
-- Password will be hashed as: Admin@123 (change after first login!)

-- First, check if user already exists, if not insert
INSERT INTO admin_users (username, email, password_hash, role, is_active)
SELECT 'danielqazi', 'danielqazi89@gmail.com', '$2b$10$YourHashedPasswordHere', 'super_admin', true
WHERE NOT EXISTS (
    SELECT 1 FROM admin_users WHERE email = 'danielqazi89@gmail.com'
);

-- Note: The password hash above is a placeholder. Run the Node.js script below to generate the proper hash.
