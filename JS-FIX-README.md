# JavaScript Files Not Loading in Nginx - Fix Instructions

## Problem
The JavaScript files in `/mainFunction/` are not loading when the application is served through nginx.

## Files Affected
- `/mainFunction/audiodisplay.js`
- `/mainFunction/recorderjs/recorder.js`  
- `/mainFunction/medical-recorder.js`

## Root Causes & Solutions

### 1. Nginx Configuration Missing
**Problem**: Nginx is not configured to serve static files from the `public` directory.

**Solution**: Use one of the provided nginx configurations:

#### Option A: Simple Configuration (Recommended)
```bash
# Copy the simple nginx config
sudo cp /var/www/asr/nginx-simple.conf /etc/nginx/sites-available/asr-app

# Enable the site
sudo ln -s /etc/nginx/sites-available/asr-app /etc/nginx/sites-enabled/

# Remove default if it exists
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

#### Option B: Full Configuration 
```bash
# Use the complete nginx config with more features
sudo cp /var/www/asr/nginx.conf /etc/nginx/sites-available/asr-app
# Then follow the same steps as Option A
```

### 2. MIME Type Issues
**Problem**: JavaScript files might not have correct MIME type.

**Solution**: The nginx configurations above include proper MIME type handling for JavaScript files.

### 3. File Permissions
**Problem**: Nginx cannot read the files due to permission issues.

**Solution**: 
```bash
# Set proper permissions
chmod -R 755 /var/www/asr/public/
chown -R www-data:www-data /var/www/asr/public/  # If using www-data user
```

### 4. Node.js Server Enhancement
**Problem**: Node.js server not serving static files with correct headers.

**Solution**: Already fixed in `server.js` - static files now served with proper MIME types.

## Testing the Fix

### 1. Direct File Access Test
With your Node.js server running (`node server.js`), test these URLs:
- http://localhost:5001/mainFunction/audiodisplay.js
- http://localhost:5001/mainFunction/medical-recorder.js
- http://localhost:5001/mainFunction/recorderjs/recorder.js

### 2. Browser Console Check
1. Open your application in browser
2. Press F12 to open Developer Tools
3. Check Console tab for any 404 errors
4. Check Network tab to see if JS files are loading with status 200

### 3. MIME Type Verification
In Network tab, click on a JavaScript file and check:
- Status should be `200 OK`
- Content-Type should be `application/javascript`

## Quick Fix Steps

1. **Stop nginx**: `sudo systemctl stop nginx`
2. **Copy config**: `sudo cp /var/www/asr/nginx-simple.conf /etc/nginx/sites-available/asr-app`
3. **Enable site**: `sudo ln -s /etc/nginx/sites-available/asr-app /etc/nginx/sites-enabled/`
4. **Remove default**: `sudo rm -f /etc/nginx/sites-enabled/default`
5. **Test config**: `sudo nginx -t`
6. **Start nginx**: `sudo systemctl start nginx`
7. **Test in browser**: Open application and check console for errors

## Alternative: Run Without Nginx
If nginx continues to cause issues, you can run the application directly:

```bash
# Just run the Node.js server
cd /var/www/asr
node server.js
# Access at http://localhost:5001
```

The Node.js server has been enhanced to properly serve static files with correct MIME types.

## Files Modified/Created
- ✅ `server.js` - Enhanced static file serving
- ✅ `nginx.conf` - Complete nginx configuration 
- ✅ `nginx-simple.conf` - Simple nginx configuration
- ✅ `test-js-files.sh` - Test script for debugging
- ✅ `JS-FIX-README.md` - This fix guide
