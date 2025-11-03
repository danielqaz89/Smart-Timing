import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedKinoaLogo() {
  try {
    // Read the logo file
    const logoPath = './frontend/public/kinoa-logo.png';
    
    if (!fs.existsSync(logoPath)) {
      console.error('❌ Logo file not found at:', logoPath);
      console.log('Please save the Kinoa logo to frontend/public/kinoa-logo.png first');
      process.exit(1);
    }

    const logoBuffer = fs.readFileSync(logoPath);
    const base64Logo = logoBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Logo}`;

    // Insert/update in database
    const result = await pool.query(`
      INSERT INTO companies (name, logo_base64, display_order, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (name) DO UPDATE SET
        logo_base64 = $2,
        updated_at = NOW()
      RETURNING id, name
    `, ['Kinoa', dataUrl, 1]);

    console.log('✅ Kinoa logo seeded successfully:', result.rows[0]);
    console.log(`📦 Logo size: ${(base64Logo.length / 1024).toFixed(2)} KB`);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error seeding logo:', error);
    process.exit(1);
  }
}

seedKinoaLogo();
