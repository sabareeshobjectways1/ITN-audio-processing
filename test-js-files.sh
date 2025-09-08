#!/bin/bash

echo "Testing JavaScript file accessibility..."

# Test if files exist
echo "Checking if files exist:"
ls -la /var/www/asr/public/mainFunction/audiodisplay.js
ls -la /var/www/asr/public/mainFunction/medical-recorder.js  
ls -la /var/www/asr/public/mainFunction/recorderjs/recorder.js

echo ""
echo "Setting proper permissions..."
chmod -R 755 /var/www/asr/public/

echo ""
echo "Testing direct file access (if server is running)..."
echo "Try these URLs in your browser:"
echo "http://localhost:5001/mainFunction/audiodisplay.js"
echo "http://localhost:5001/mainFunction/medical-recorder.js"
echo "http://localhost:5001/mainFunction/recorderjs/recorder.js"

echo ""
echo "If using nginx, make sure to:"
echo "1. Copy nginx.conf to /etc/nginx/sites-available/asr-app"
echo "2. Create symlink: sudo ln -s /etc/nginx/sites-available/asr-app /etc/nginx/sites-enabled/"
echo "3. Test nginx config: sudo nginx -t"
echo "4. Restart nginx: sudo systemctl restart nginx"
