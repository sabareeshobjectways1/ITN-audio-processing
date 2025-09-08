# ASR Medical Tool - Nginx Deployment Guide

## Changes Made

### 1. Route Configuration
- ✅ Set medical-asr as the home route (`/`)
- ✅ Added backward compatibility route (`/medical-asr`)
- ✅ Added fallback route (`/index`)

### 2. Static File Paths Fixed
- ✅ Updated JavaScript paths in medical-asr.pug to use absolute paths (`/mainFunction/...`)
- ✅ Enhanced server.js static file serving
- ✅ Created nginx.conf with proper static file handling

### 3. Nginx Configuration
The nginx.conf file has been created with:
- Static file serving for JS, CSS, and audio files
- Proper proxy configuration for Node.js
- Gzip compression for better performance
- Cache headers for static assets
- Large file upload support for audio files

# ASR Medical Tool - Simple Deployment Guide

## Changes Made

### 1. Route Configuration
- ✅ Set medical-asr as the home route (`/`)
- ✅ Medical ASR tool loads directly on home page

### 2. Static File Paths Fixed
- ✅ Updated JavaScript paths in medical-asr.pug to use absolute paths (`/mainFunction/...`)
- ✅ Enhanced server.js static file serving with proper MIME types
- ✅ Works without nginx configuration

## Simple Deployment (No Nginx Required)

### 1. Start your Node.js application
```bash
npm install
node server.js
```

### 2. Access your application
- Open browser and go to: `http://localhost:5001`
- The medical ASR tool will load directly as the home page

### 3. For production with PM2
```bash
npm install -g pm2
pm2 start server.js --name "asr-medical-tool"
pm2 startup
pm2 save
```

## File Structure
```
/your/project/path/
├── public/
│   ├── mainFunction/
│   │   ├── audiodisplay.js      ← Must be accessible at /mainFunction/audiodisplay.js
│   │   ├── medical-recorder.js  ← Must be accessible at /mainFunction/medical-recorder.js
│   │   └── recorderjs/
│   │       └── recorder.js      ← Must be accessible at /mainFunction/recorderjs/recorder.js
│   ├── duplicateFunction/
│   ├── audio-Brocolli/
│   └── style.css
├── views/
│   └── medical-asr.pug
├── route/
│   └── route.js
└── server.js
```

## Troubleshooting JavaScript Loading Issues

### 1. Check file permissions
```bash
ls -la public/mainFunction/
# Make sure files are readable:
chmod -R 755 public/
```

### 2. Verify files exist
```bash
ls -la public/mainFunction/audiodisplay.js
ls -la public/mainFunction/medical-recorder.js
ls -la public/mainFunction/recorderjs/recorder.js
```

### 3. Test static file serving directly
Open these URLs in browser:
- `http://localhost:5001/mainFunction/audiodisplay.js`
- `http://localhost:5001/mainFunction/medical-recorder.js`
- `http://localhost:5001/mainFunction/recorderjs/recorder.js`

### 4. Check browser console
- Press F12 to open developer tools
- Look for any 404 errors for JavaScript files
- Verify MIME types are correct (should be `application/javascript`)

## Testing
1. ✅ Home route (/) loads the medical ASR tool directly
2. ✅ All JavaScript files load without errors
3. ✅ Audio recording functionality works
4. ✅ File uploads work correctly

## Production Notes
- Static files served directly by Node.js (no nginx required)
- Proper MIME types set for all file types
- Basic caching headers included
- Large file upload support (50MB) configured
