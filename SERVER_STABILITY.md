# Server Stability Guide

## Overview
Smart Timing backend has been enhanced with comprehensive stability features to ensure reliable operation in production environments.

## Key Stability Features

### 1. Database Connection Pool Management
- **Connection pooling**: Max 20 concurrent connections
- **Idle timeout**: 30 seconds to free unused connections
- **Connection timeout**: 10 seconds max for new connections
- **Keep-alive**: Maintains connection health
- **Error handling**: Pool errors logged without crashing server

### 2. Error Handling
- **Uncaught exceptions**: Logged but don't crash server
- **Unhandled promise rejections**: Logged for debugging
- **Global error handler**: Catches all route errors
- **JSON parsing errors**: Returns 400 with clear message
- **Request ID tracking**: Every request gets unique ID for debugging

### 3. Graceful Shutdown
- **Signal handlers**: SIGTERM and SIGINT handled gracefully
- **Connection draining**: Waits for active requests to complete
- **Database cleanup**: Properly closes all database connections
- **Timeout protection**: Forces shutdown after 30 seconds if stuck

### 4. Request Logging
Every request is logged with:
- Timestamp
- HTTP method and path
- Unique request ID
- Response status code
- Response time in milliseconds

Example log:
```
[2025-11-04T21:05:51.372Z] GET /api/health [ID: 1762290351372-mm1w4h]
[INFO] GET /api/health 200 - 128ms [ID: 1762290351372-mm1w4h]
```

### 5. Health Monitoring
**Endpoint**: `GET /api/health`

Returns comprehensive server status:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-04T21:05:51.496Z",
  "uptime_seconds": 1234,
  "database": "connected",
  "memory": {
    "used": 79,
    "total": 213,
    "unit": "MB"
  },
  "port": "4000",
  "node_version": "v24.7.0"
}
```

Use this endpoint for:
- Load balancer health checks
- Monitoring systems (Datadog, New Relic, etc.)
- Automated alerts
- Status dashboards

### 6. Security Features
- **JSON payload limit**: 10MB to prevent memory issues
- **Production mode**: Hides error stack traces in production
- **Request validation**: Validates incoming JSON

## Environment Variables

### Required
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for admin JWT tokens

### Optional
- `PORT`: Server port (default: 4000)
- `NODE_ENV`: Environment (development/production)
- `DEFAULT_ADMIN_PASSWORD`: Default admin password
- `FRONTEND_ORIGINS`: Comma-separated CORS origins
- `FRONTEND_ORIGIN_SUFFIXES`: Dynamic origin suffixes (e.g., .vercel.app)

## Deployment Best Practices

### Render Configuration
1. **Build Command**: `npm install`
2. **Start Command**: `node server.js`
3. **Health Check Path**: `/api/health`
4. **Environment Variables**: Set all required vars in dashboard

### Monitoring
Monitor these metrics:
- Response times (should be < 500ms for most endpoints)
- Memory usage (watch for leaks)
- Database connection pool usage
- Error rates
- Uptime

### Logs
The server logs to stdout. In Render:
- Go to Logs tab to view real-time logs
- Filter by ERROR for issues
- Use request IDs to trace specific requests

### Auto-Restart
Render automatically restarts on crashes, but with our stability improvements:
- Server handles most errors gracefully
- Database connection issues are logged but don't crash
- Memory leaks are monitored via health endpoint

## Testing Locally

Use the included test script:
```bash
./test-server.sh
```

Or manually:
```bash
# Set required environment variables
export DATABASE_URL="your-connection-string"
export PORT=4000
export JWT_SECRET="your-secret"

# Start server
node server.js

# In another terminal, test health
curl http://localhost:4000/api/health

# Graceful shutdown
# Press Ctrl+C (sends SIGINT)
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 4000
lsof -i :4000

# Kill it
kill -9 <PID>
```

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check if database is accessible
- Review firewall/network rules
- Check connection pool settings

### High Memory Usage
- Check `/api/health` memory stats
- Review logs for memory-intensive operations
- Consider increasing server resources
- Check for memory leaks in custom code

### Slow Response Times
- Check database query performance
- Review request logs for slow endpoints
- Monitor database connection pool usage
- Consider adding indexes to database

## Performance Tuning

### Connection Pool
Adjust in `server.js`:
```javascript
const pool = new Pool({ 
  max: 20, // Increase for high traffic
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

### Request Logging
To disable verbose logging in production:
```javascript
// In server.js, comment out the logging middleware
// app.use((req, res, next) => { ... });
```

## Production Checklist

Before deploying:
- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET` (32+ characters)
- [ ] Change `DEFAULT_ADMIN_PASSWORD`
- [ ] Configure proper `FRONTEND_ORIGINS`
- [ ] Set up health check monitoring
- [ ] Configure log aggregation
- [ ] Test graceful shutdown
- [ ] Set up automated backups
- [ ] Document incident response procedures

## Support
For issues, check:
1. Server logs (request IDs help trace issues)
2. `/api/health` endpoint status
3. Database connectivity
4. Environment variable configuration
