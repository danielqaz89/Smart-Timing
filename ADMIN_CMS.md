# Smart Timing Admin & CMS System

## Overview
Smart Timing now includes a complete Admin Panel and Content Management System (CMS) that allows administrators to control, monitor, and manage the entire application.

## Features

### Authentication & Authorization
- **JWT-based authentication** with secure token management
- **Role-based access control (RBAC)** with three roles:
  - `super_admin`: Full system access, can manage other admins
  - `admin`: Can view and manage users, view analytics
  - `moderator`: Read-only access to users and analytics
- **Secure password hashing** using bcrypt
- **Session management** with 24-hour token expiration

### Dashboard
- **Real-time system statistics**:
  - Total users
  - Total logs
  - Total projects
  - Total hours logged
- **Activity monitoring**:
  - Active users (users with logs)
  - Users with projects
  - Active months
  - Most active users in the last 7 days

### User Management
- **View all users** with comprehensive statistics
- **Search and filter** users
- **User details**: logs, projects, templates, sync history
- **Delete users** (super_admin only) with confirmation
- **User statistics** per user:
  - Total logs and projects
  - Hourly rate
  - Theme preference
  - Last activity date

### Analytics & Reporting
- System-wide analytics dashboard
- User activity tracking
- Project statistics
- Time tracking metrics

### Audit Log
- Complete audit trail of all admin actions
- Track who did what and when
- Filter by action type or admin
- IP address tracking for security

### System Settings (CMS)
- **Key-value settings store** with JSON support
- Version control for settings changes
- Track who updated what settings
- Flexible configuration management

## Database Schema

### Admin Tables

```sql
-- Admin users table
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('super_admin', 'admin', 'moderator')) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Admin audit log table
CREATE TABLE admin_audit_log (
  id SERIAL PRIMARY KEY,
  admin_id INT REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- System settings table (for CMS control)
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB,
  description TEXT,
  updated_by INT REFERENCES admin_users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Backend API Endpoints

### Authentication
- `POST /api/admin/login` - Admin login with JWT token
- `POST /api/admin/register` - Create new admin (super_admin only)
- `GET /api/admin/profile` - Get current admin profile

### User Management
- `GET /api/admin/users` - List all users with stats (supports search, pagination)
- `GET /api/admin/users/:userId` - Get detailed user information
- `DELETE /api/admin/users/:userId` - Delete user (super_admin only)

### Analytics
- `GET /api/admin/analytics` - System-wide analytics and statistics

### Audit Log
- `GET /api/admin/audit-log` - View audit trail (supports filtering)

### System Settings
- `GET /api/admin/settings` - Get all system settings
- `PUT /api/admin/settings/:key` - Update system setting (super_admin only)

## Frontend Admin Panel

### Routes
- `/admin` - Admin login page
- `/admin/dashboard` - Main dashboard with statistics
- `/admin/users` - User management page
- `/admin/analytics` - Analytics page
- `/admin/audit` - Audit log viewer
- `/admin/settings` - System settings CMS

### Components
- `AdminContext.tsx` - Authentication state management
- `AdminLayout.tsx` - Dashboard layout with sidebar navigation
- Admin pages with Material UI components

## Installation & Setup

### Backend Setup

1. Install required npm packages:
```bash
npm install jsonwebtoken bcrypt
```

2. Set environment variables in `.env`:
```env
JWT_SECRET=your-secret-key-change-in-production
DEFAULT_ADMIN_PASSWORD=Admin@123  # Optional, defaults to Admin@123
```

3. Start the backend server:
```bash
npm start
```

The database tables will be auto-created, and a default super admin will be created on first run.

### Frontend Setup

1. The admin frontend is already integrated into the Next.js app.

2. Access the admin panel at:
```
http://localhost:3000/admin
```

3. Default credentials:
- **Username**: `admin`
- **Email**: `admin@smarttiming.com`
- **Password**: `Admin@123`

## Security Best Practices

### For Production Deployment:

1. **Change the JWT secret**:
   ```env
   JWT_SECRET=a-very-long-random-string-at-least-32-characters
   ```

2. **Change the default admin password** immediately after first login.

3. **Set a strong default admin password** via environment variable:
   ```env
   DEFAULT_ADMIN_PASSWORD=YourVeryStrongPassword123!
   ```

4. **Enable HTTPS** for all admin endpoints in production.

5. **Rate limiting**: Consider adding rate limiting to admin login endpoint.

6. **IP whitelisting**: Optionally restrict admin access to specific IP addresses.

7. **Two-factor authentication**: Consider adding 2FA for admin accounts (future enhancement).

## Usage Guide

### Creating a New Admin

1. Log in as a `super_admin`
2. Use the API or create a new endpoint to register admins:
```bash
curl -X POST http://localhost:4000/api/admin/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newadmin",
    "email": "newadmin@example.com",
    "password": "SecurePassword123!",
    "role": "admin"
  }'
```

### Viewing User Details

Navigate to `/admin/users` and click on any user to view:
- All logs
- All projects
- Quick templates
- Sync history
- User settings

### Monitoring System Health

Visit `/admin/dashboard` to see:
- Total users and activity
- Log statistics
- Project statistics
- Recent activity trends

### Viewing Audit Logs

Go to `/admin/audit` to see:
- All admin actions
- Who made changes
- When changes were made
- What was changed

### Managing System Settings

Visit `/admin/settings` to:
- View all system settings
- Update configuration values
- Track setting changes

## Role Permissions

| Feature | super_admin | admin | moderator |
|---------|------------|-------|-----------|
| View Dashboard | ✅ | ✅ | ✅ |
| View Users | ✅ | ✅ | ✅ |
| Delete Users | ✅ | ❌ | ❌ |
| View Analytics | ✅ | ✅ | ✅ |
| View Audit Log | ✅ | ✅ | ❌ |
| Manage Settings | ✅ | ❌ | ❌ |
| Create Admins | ✅ | ❌ | ❌ |

## Future Enhancements

- [ ] Bulk user operations
- [ ] Export reports (CSV, PDF)
- [ ] Email notifications for admin actions
- [ ] Two-factor authentication (2FA)
- [ ] Admin activity dashboard
- [ ] Custom role creation
- [ ] Advanced search and filters
- [ ] Data visualization charts
- [ ] Scheduled reports
- [ ] Real-time notifications

## Troubleshooting

### Cannot log in
- Ensure backend server is running
- Check that JWT_SECRET is set
- Verify default admin was created (check console logs on backend start)

### Token expired error
- Tokens expire after 24 hours
- Log out and log back in to get a new token

### Permission denied
- Check your admin role
- Some features are restricted to super_admin only

### Database errors
- Ensure PostgreSQL is running
- Check DATABASE_URL environment variable
- Verify tables were created (run `npm start` to auto-create)

## Support

For issues or questions about the admin system, please refer to:
- Main README.md for general setup
- WARP.md for development guidelines
- GDPR_IMPLEMENTATION.md for data management

## License

Same as the main Smart Timing application.
