import dotenv from 'dotenv';
import pkg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pkg;
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function addAdmin() {
  const username = 'danielqazi';
  const email = 'danielqazi89@gmail.com';
  const password = 'Admin@123'; // Change this after first login!
  const role = 'super_admin';

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM admin_users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      console.log(`✅ User already exists: ${email}`);
      console.log('   Use the existing credentials to login.');
      process.exit(0);
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert the new admin user
    const result = await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role`,
      [username, email, passwordHash, role, true]
    );

    console.log('✅ Admin user created successfully!');
    console.log('-----------------------------------');
    console.log(`ID:       ${result.rows[0].id}`);
    console.log(`Username: ${result.rows[0].username}`);
    console.log(`Email:    ${result.rows[0].email}`);
    console.log(`Role:     ${result.rows[0].role}`);
    console.log(`Password: ${password}`);
    console.log('-----------------------------------');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    console.log(`Login at: http://localhost:3000/admin`);

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addAdmin();
