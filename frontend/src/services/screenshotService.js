import html2canvas from 'html2canvas';
import api, { getStorageBase } from './api';
import activityTracker from './activityTracker';

let intervalId = null;
let timeoutIds = [];
let isScreenshotting = false;
let screenStream = null; // Persistent stream
let hasScreenPermission = false;
let externalMonitorId = null;
let externalMonitorCtx = null;
let externalMonitorCanvas = null;
let lastFrame = null;
let lastExternalClickTs = 0;
let lastExternalMoveTs = 0;
let lastExternalKeyTs = 0;

// Function to get screen permission once and reuse
const getScreenPermission = async () => {
  if (hasScreenPermission && screenStream && screenStream.active) {
    console.log('♻️ Reusing existing screen permission');
    return screenStream;
  }
  
  try {
    console.log('🔐 Requesting screen capture permission...');
    console.log('📋 Please select "Entire Screen" when prompted!');
    
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        mediaSource: 'screen',
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: { ideal: 2, max: 10 }
      },
      audio: false,
      surfaceSwitching: 'include',
      selfBrowserSurface: 'exclude',
      systemAudio: 'exclude'
    });
    
    hasScreenPermission = true;
    
    // Log what type of screen was selected
    const videoTrack = screenStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    console.log('✅ Screen permission granted:', {
      displaySurface: settings.displaySurface,
      width: settings.width,
      height: settings.height,
      deviceId: settings.deviceId
    });
    
    // Handle stream end (user stops sharing)
    videoTrack.addEventListener('ended', () => {
      console.log('🛑 Screen sharing stopped by user');
      hasScreenPermission = false;
      screenStream = null;
    });
    
    return screenStream;
  } catch (error) {
    console.log('❌ Screen permission denied or failed:', error.message);
    console.log('💡 Make sure to select "Entire Screen" not "Application Window"!');
    hasScreenPermission = false;
    screenStream = null;
    throw error;
  }
};

const resizeCanvas = (sourceCanvas, maxWidth, maxHeight) => {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  if (!srcW || !srcH) {
    return { canvas: sourceCanvas, width: srcW, height: srcH };
  }
  const scale = Math.min(maxWidth / srcW, maxHeight / srcH, 1);
  const destW = Math.max(1, Math.round(srcW * scale));
  const destH = Math.max(1, Math.round(srcH * scale));
  if (scale === 1) {
    return { canvas: sourceCanvas, width: srcW, height: srcH };
  }
  const destCanvas = document.createElement('canvas');
  destCanvas.width = destW;
  destCanvas.height = destH;
  const dctx = destCanvas.getContext('2d');
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(sourceCanvas, 0, 0, srcW, srcH, 0, 0, destW, destH);
  return { canvas: destCanvas, width: destW, height: destH };
};

const canvasToBlob = (canvas, quality = 0.6, mime = 'image/jpeg') => new Promise((resolve, reject) => {
  try {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('blob-null'));
      resolve(blob);
    }, mime, quality);
  } catch (e) {
    reject(e);
  }
});

const compressToUnder = async (canvas, maxBytes) => {
  let quality = 0.6;
  let mime = 'image/webp';
  let blob;
  try {
    blob = await canvasToBlob(canvas, quality, mime);
  } catch {
    blob = null;
  }
  let guard = 0;
  while ((!blob || blob.size > maxBytes) && guard < 14) {
    quality = Math.max(0.18, quality - 0.06);
    try {
      blob = await canvasToBlob(canvas, quality, mime);
    } catch {
      blob = null;
      break;
    }
    guard++;
  }
  if (!blob || blob.size > maxBytes) {
    quality = 0.5;
    mime = 'image/jpeg';
    blob = await canvasToBlob(canvas, quality, mime);
    guard = 0;
    while (blob.size > maxBytes && guard < 14) {
      quality = Math.max(0.15, quality - 0.05);
      blob = await canvasToBlob(canvas, quality, mime);
      guard++;
    }
  }
  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  return { blob, ext };
};

const startExternalActivityMonitor = (stream) => {
  if (externalMonitorId) return;
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.autoplay = true;
  externalMonitorCanvas = document.createElement('canvas');
  externalMonitorCanvas.width = 320;
  externalMonitorCanvas.height = 180;
  externalMonitorCtx = externalMonitorCanvas.getContext('2d');
  const init = () => {
    externalMonitorId = setInterval(() => {
      try {
        externalMonitorCtx.drawImage(video, 0, 0, externalMonitorCanvas.width, externalMonitorCanvas.height);
        const img = externalMonitorCtx.getImageData(0, 0, externalMonitorCanvas.width, externalMonitorCanvas.height);
        const data = img.data;
        let changed = 0;
        if (lastFrame && lastFrame.length === data.length) {
          for (let i = 0; i < data.length; i += 4) {
            const dr = Math.abs(data[i] - lastFrame[i]);
            const dg = Math.abs(data[i + 1] - lastFrame[i + 1]);
            const db = Math.abs(data[i + 2] - lastFrame[i + 2]);
            const diff = (dr + dg + db) / 3;
            if (diff > 30) changed++;
          }
          const total = (data.length / 4);
          const ratio = changed / total;
          const now = Date.now();
          if (ratio > 0.06 && now - lastExternalClickTs > 400) {
            activityTracker.recordExternalClick();
            lastExternalClickTs = now;
          } else if (ratio > 0.04 && now - lastExternalKeyTs > 300) {
            activityTracker.recordExternalTyping();
            lastExternalKeyTs = now;
          } else if (ratio > 0.02 && now - lastExternalMoveTs > 300) {
            activityTracker.recordExternalMovement();
            lastExternalMoveTs = now;
          }
        }
        lastFrame = new Uint8ClampedArray(data);
      } catch {}
    }, 700);
  };
  video.onloadedmetadata = () => {
    video.play().catch(() => {});
    init();
  };
};

const captureScreenshot = async (taskId, taskName, projectName, options = {}) => {
  const { allowPermissionPrompt = true } = options;
  try {
    console.log('🎯 Starting screenshot capture process...');
    
    // Try to use persistent screen stream
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      try {
        console.log('📱 Attempting screen capture...');
        let stream = null;
        if (hasScreenPermission && screenStream && screenStream.active) {
          stream = screenStream;
          console.log('♻️ Using existing screen stream without prompt');
        } else if (allowPermissionPrompt) {
          stream = await getScreenPermission();
        } else {
          throw new Error('Permission prompt disabled');
        }
        startExternalActivityMonitor(stream);
        
        // Create video element for frame capture
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        
        console.log('⏳ Waiting for video metadata...');
        // Wait for video to load
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = () => {
            console.log(`📹 Video ready: ${video.videoWidth}x${video.videoHeight}`);
            console.log(`📹 Video state: readyState=${video.readyState}, currentTime=${video.currentTime}`);
            resolve();
          };
          video.onerror = (e) => {
            console.error('❌ Video error:', e);
            reject(e);
          };
          // Add timeout to prevent hanging
          setTimeout(() => reject(new Error('Video load timeout')), 8000);
        });
        
        // Force video to play and wait for first frame
        try {
          await video.play();
          console.log('▶️ Video play() called');
        } catch (playError) {
          console.log('⚠️ Video play failed (this is often normal):', playError.message);
        }
        
        // Wait for video to have actual frame data - simplified approach
        let attempts = 0;
        const maxAttempts = 20; // 2 seconds max
        
        while (attempts < maxAttempts) {
          // Try to capture immediately regardless of currentTime
          if (video.readyState >= 2) {
            console.log(`✅ Video has frame data after ${attempts * 100}ms, proceeding with capture`);
            break;
          }
          
          console.log(`⏳ Attempt ${attempts + 1}: readyState=${video.readyState}`);
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (attempts >= maxAttempts) {
          console.warn('⚠️ Video readyState never improved, but proceeding anyway');
        }
        
        // Small final delay
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Create canvas and capture frame
        const baseCanvas = document.createElement('canvas');
        baseCanvas.width = video.videoWidth || 1920;
        baseCanvas.height = video.videoHeight || 1080;
        const ctx = baseCanvas.getContext('2d');
        
        // Check if video has valid dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          throw new Error('Invalid video dimensions - screen may be blocked');
        }
        
        console.log(`🖼️ Capturing frame from ${baseCanvas.width}x${baseCanvas.height} video`);
        
        // Try multiple capture methods to ensure we get screen content
        let captureSuccess = false;
        
        // Method 1: Direct canvas capture
        try {
          ctx.drawImage(video, 0, 0);
          
          // Quick test - get a small sample to check if we have data
          const testData = ctx.getImageData(0, 0, Math.min(100, baseCanvas.width), Math.min(100, baseCanvas.height));
          let hasPixelData = false;
          
          for (let i = 0; i < testData.data.length; i += 4) {
            if (testData.data[i] !== 0 || testData.data[i + 1] !== 0 || testData.data[i + 2] !== 0) {
              hasPixelData = true;
              break;
            }
          }
          
          if (hasPixelData) {
            console.log('✅ Method 1: Direct capture successful - found pixel data');
            captureSuccess = true;
          } else {
            console.log('⚠️ Method 1: Direct capture gave blank data, trying method 2');
          }
        } catch (captureError) {
          console.log('❌ Method 1: Direct capture failed:', captureError.message);
        }
        
        // Method 2: Force refresh and retry
        if (!captureSuccess) {
          try {
            console.log('🔄 Method 2: Refreshing video and retrying...');
            
            // Clear and redraw
            ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);
            
            // Wait a bit more
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Try capture again
            ctx.drawImage(video, 0, 0);
            
            console.log('✅ Method 2: Retry capture completed');
            captureSuccess = true;
          } catch (retryError) {
            console.log('❌ Method 2: Retry capture failed:', retryError.message);
          }
        }
        
        if (!captureSuccess) {
          console.warn('⚠️ Both capture methods had issues, but proceeding with what we have');
        }
        
        // Check if canvas is blank/black (sample center area for better detection)
        const centerX = Math.floor(baseCanvas.width / 4);
        const centerY = Math.floor(baseCanvas.height / 4);
        const sampleWidth = Math.floor(baseCanvas.width / 2);
        const sampleHeight = Math.floor(baseCanvas.height / 2);
        
        const imageData = ctx.getImageData(centerX, centerY, sampleWidth, sampleHeight);
        const data = imageData.data;
        let nonBlackPixels = 0;
        let totalBrightness = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r + g + b) / 3;
          totalBrightness += brightness;
          
          if (brightness > 30) { // More lenient threshold
            nonBlackPixels++;
          }
        }
        
        const totalPixels = sampleWidth * sampleHeight;
        const nonBlackRatio = nonBlackPixels / totalPixels;
        const avgBrightness = totalBrightness / totalPixels;
        
        console.log(`🔍 Screen analysis: ${(nonBlackRatio * 100).toFixed(1)}% non-black pixels, avg brightness: ${avgBrightness.toFixed(1)}`);
        
        // More lenient detection - only fail if extremely dark
        if (nonBlackRatio < 0.05 && avgBrightness < 15) {
          console.warn('🚫 Captured image appears completely black - trying page capture');
          showNotification('⚠️ Dark Screen', 'Screen appears dark/black. Using page capture instead.', 'warning');
          throw new Error('Extremely dark screen detected');
        }
        
        // Generate filename
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        
        const cleanProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const cleanTaskName = (taskName || 'task').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const filename = `${cleanProjectName}_${cleanTaskName}_${hours}.${minutes}.${seconds}.${day}.${month}.${year}.jpg`;

        const { blob, ext } = await compressToUnder(baseCanvas, 100 * 1024);
        if (!blob || blob.size < 4000) {
          console.warn(`⚠️ Blob too small (${blob ? blob.size : 0} bytes)`);
          throw new Error('Captured image too small');
        }
        const finalName = filename.replace(/\.jpg$/i, `.${ext}`);
        console.log(`📤 Uploading REAL SCREEN (${ext.toUpperCase()}): ${finalName} (${Math.round(blob.size/1024)}KB)`);
        const activityData = activityTracker.getActivityData();
        const formData = new FormData();
        formData.append('image', blob, finalName);
        formData.append('task_id', taskId);
        formData.append('custom_filename', finalName);
        formData.append('project_name', projectName || '');
        formData.append('task_name', taskName || '');
        formData.append('keyboard_clicks', activityData.keyboard_clicks);
        formData.append('mouse_clicks', activityData.mouse_clicks);
        formData.append('activity_percentage', activityData.activity_percentage);
        formData.append('activity_start_time', activityData.activity_start_time);
        formData.append('activity_end_time', activityData.activity_end_time);
        formData.append('minute_breakdown', JSON.stringify(activityData.minute_breakdown));
        await api.post(`/screenshots`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        console.log(`✅ REAL SCREEN capture successful: ${filename}`);
        showNotification('✅ REAL Screen Captured', `Screen + Activity captured: ${activityData.activity_percentage}% active`, 'success');
        try {
          const durationSeconds = Math.round((activityData.duration_minutes || 0) * 60);
          await api.post('/activity-sessions', {
            task_id: taskId,
            app_name: 'screen',
            window_title: document.title || '',
            url: window.location?.href || '',
            start_time: activityData.activity_start_time,
            end_time: activityData.activity_end_time,
            duration_seconds: durationSeconds,
            keyboard_clicks: activityData.keyboard_clicks,
            mouse_clicks: activityData.mouse_clicks,
          });
        } catch (e) {
          console.log('⚠️ Failed to record activity session:', e?.message || e);
        }
        activityTracker.resetTracking();
        return;
        
        // If we get here, screen capture was successful, so return without page capture
        console.log('🎉 Screen capture completed successfully, skipping page capture');
        return;
        
      } catch (screenError) {
        console.log('❌ Screen capture failed:', screenError.message);
        
        // Reset permission if there was an error
        if (screenError.name === 'NotAllowedError') {
          hasScreenPermission = false;
          screenStream = null;
          showNotification('🚫 Permission Required', 'Please allow screen sharing and select "Entire Screen"', 'warning');
        } else {
          console.log('⚠️ Screen capture error, will fallback to page capture:', screenError.message);
          showNotification('⚠️ Screen Issue', 'Screen capture failed. Using page capture.', 'warning');
        }
      }
    }
    
    // Fallback to page capture ONLY if screen capture completely failed
    console.log('📄 Using page capture fallback...');
    
    // Remove problematic images before capture to avoid CORS issues
    const storageBase = getStorageBase();
    const images = Array.from(document.querySelectorAll('img')).filter(img => img.src.startsWith(storageBase));
    const originalSrcs = [];
    images.forEach((img, index) => {
      originalSrcs[index] = img.src;
      img.style.display = 'none'; // Hide images that cause CORS issues
    });
    
    let canvas = null;
    try {
      canvas = await html2canvas(document.body, {
        height: document.body.scrollHeight,
        width: document.body.scrollWidth,
        scrollX: 0,
        scrollY: 0,
        useCORS: false,
        allowTaint: true,
        scale: 1,
        backgroundColor: '#ffffff',
        logging: false,
        ignoreElements: (element) => {
          if (element.tagName === 'IMG' && element.src.startsWith(getStorageBase())) {
            return true;
          }
          return false;
        }
      });
    } catch (pageErr) {
      console.log('⚠️ Page capture failed, generating placeholder:', pageErr?.message || pageErr);
      const w = Math.max(800, window.innerWidth || 1280);
      const h = Math.max(450, window.innerHeight || 720);
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#222';
      ctx.font = '20px system-ui, sans-serif';
      const nowStr = new Date().toLocaleString();
      const urlStr = window.location?.href || '';
      ctx.fillText('Activity Snapshot (Placeholder)', 40, 60);
      ctx.fillText(`Time: ${nowStr}`, 40, 100);
      ctx.fillText(`URL: ${urlStr}`, 40, 140);
      ctx.fillStyle = '#888';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('Screen/page capture failed. Uploading placeholder with activity data.', 40, 180);
    }
    
    // Restore images after capture
    images.forEach((img, index) => {
      img.src = originalSrcs[index];
      img.style.display = '';
    });
    
    // Generate filename
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    
    const cleanProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const cleanTaskName = (taskName || 'task').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `${cleanProjectName}_${cleanTaskName}_${hours}.${minutes}.${seconds}.${day}.${month}.${year}.jpg`;
    
    const { blob, ext } = await compressToUnder(canvas, 100 * 1024);
    const activityData = activityTracker.getActivityData();
    const formData = new FormData();
    const finalName = filename.replace(/\.jpg$/i, `.${ext}`);
    formData.append('image', blob, finalName);
    formData.append('task_id', taskId);
    formData.append('custom_filename', finalName);
    formData.append('project_name', projectName || '');
    formData.append('task_name', taskName || '');
    formData.append('keyboard_clicks', activityData.keyboard_clicks);
    formData.append('mouse_clicks', activityData.mouse_clicks);
    formData.append('activity_percentage', activityData.activity_percentage);
    formData.append('activity_start_time', activityData.activity_start_time);
    formData.append('activity_end_time', activityData.activity_end_time);
    formData.append('minute_breakdown', JSON.stringify(activityData.minute_breakdown));
    await api.post(`/screenshots`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    console.log(`📄 Page capture successful: ${filename}`);
    showNotification('📄 Page Captured', `Page + Activity captured: ${activityData.activity_percentage}% active`, 'info');
    try {
      const durationSeconds = Math.round((activityData.duration_minutes || 0) * 60);
      await api.post('/activity-sessions', {
        task_id: taskId,
        app_name: 'browser',
        window_title: document.title || '',
        url: window.location?.href || '',
        start_time: activityData.activity_start_time,
        end_time: activityData.activity_end_time,
        duration_seconds: durationSeconds,
        keyboard_clicks: activityData.keyboard_clicks,
        mouse_clicks: activityData.mouse_clicks,
      });
    } catch (e) {
      console.log('⚠️ Failed to record activity session (page):', e?.message || e);
    }
    activityTracker.resetTracking();
    
  } catch (error) {
    console.error('❌ Screenshot capture failed completely:', error);
    showNotification('❌ Capture Failed', 'All capture methods failed. Check console.', 'error');
  }
};

// Helper function to show notifications
const showNotification = (title, message, type = 'info') => {
  const notification = document.createElement('div');
  let bgColor, textColor, borderColor, icon;
  
  switch (type) {
    case 'success':
      bgColor = '#d4edda';
      textColor = '#155724';
      borderColor = '#c3e6cb';
      icon = '✅';
      break;
    case 'error':
      bgColor = '#f8d7da';
      textColor = '#721c24';
      borderColor = '#f5c6cb';
      icon = '❌';
      break;
    case 'warning':
      bgColor = '#fff3cd';
      textColor = '#856404';
      borderColor = '#ffeaa7';
      icon = '⚠️';
      break;
    default:
      bgColor = '#d1ecf1';
      textColor = '#0c5460';
      borderColor = '#bee5eb';
      icon = 'ℹ️';
  }
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${bgColor};
    color: ${textColor};
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid ${borderColor};
    z-index: 10000;
    max-width: 350px;
    font-family: system-ui, sans-serif;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    animation: slideInRight 0.3s ease;
  `;
  
  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
      <span style="font-size: 1.2rem;">${icon}</span>
      <div>
        <strong>${title}</strong><br>
        <small>${message}</small>
      </div>
    </div>
  `;
  
  // Add animation styles
  if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }
  }, 4000);
};

export const startScreenshotting = async (taskId, taskName, projectName) => {
  if (isScreenshotting) {
    stopScreenshotting();
  }
  
  isScreenshotting = true;
  
  console.log(`🚀 Starting screenshot automation for Task ID: ${taskId}`);
  
  // Start activity tracking
  window.__ACTIVE_TASK_ID__ = taskId;
  window.__LAST_TASK_ID__ = taskId;
  activityTracker.startTracking();
  console.log('📊 Activity tracking started');
  try {
    window.postMessage({
      type: 'TM_SET_TRACK_TASK',
      taskId,
      token: localStorage.getItem('token'),
      apiBase: (process.env.REACT_APP_API_URL || 'http://localhost:8000/api'),
    }, '*');
  } catch {}
  try {
    const stream = await getScreenPermission();
    startExternalActivityMonitor(stream);
  } catch (e) {
    console.log('Screen permission not granted yet');
  }
  
  console.log('⏰ Scheduling screenshots: first at 1min, then every 10min');
  const firstTimeout = setTimeout(() => {
    if (!isScreenshotting) return;
    console.log('📸 1-minute capture triggered');
    captureScreenshot(taskId, taskName, projectName);
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    intervalId = setInterval(() => {
      if (isScreenshotting) {
        console.log('📸 10-minute interval capture triggered');
        captureScreenshot(taskId, taskName, projectName);
      }
    }, 10 * 60 * 1000);
  }, 60 * 1000);
  timeoutIds.push(firstTimeout);
};

export const captureNow = async (taskId, taskName, projectName, options = {}) => {
  try {
    await captureScreenshot(taskId, taskName, projectName, options);
  } catch (e) {
    console.error('captureNow failed:', e);
  }
};

export const stopScreenshotting = () => {
  isScreenshotting = false;
  
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  
  timeoutIds.forEach(id => clearTimeout(id));
  timeoutIds = [];
  
  // Stop activity tracking
  activityTracker.stopTracking();
  window.__ACTIVE_TASK_ID__ = null;
  try {
    window.postMessage({ type: 'TM_STOP_TRACK_TASK' }, '*');
  } catch {}
  console.log('📊 Activity tracking stopped');
  if (externalMonitorId) {
    clearInterval(externalMonitorId);
    externalMonitorId = null;
  }
  externalMonitorCtx = null;
  externalMonitorCanvas = null;
  lastFrame = null;
  // Keep screen sharing stream alive so future captures don't prompt again
  // Use releaseScreenPermission() to manually revoke
};

export const releaseScreenPermission = () => {
  try {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
  } catch {}
  hasScreenPermission = false;
  screenStream = null;
  console.log('🔐 Screen permission released');
};

export const getScreenshots = async (taskId) => {
  const response = await api.get(`/tasks/${taskId}/screenshots`);
  const d = response.data;
  return Array.isArray(d) ? d : (d?.data || []);
};

// Get all screenshots (for admin/manager)
export const getAllScreenshots = async (filters = {}, page = 1) => {
  const params = new URLSearchParams();
  if (filters.period) params.append('period', filters.period);
  if (filters.user_id) params.append('user_id', filters.user_id);
  if (filters.task_id) params.append('task_id', filters.task_id);
  if (page) params.append('page', String(page));
  const response = await api.get(`/screenshots/all?${params.toString()}`);
  return response.data;
};

// Get user's own screenshots
export const getUserScreenshots = async (filters = {}, page = 1) => {
  const params = new URLSearchParams();
  if (filters.period) params.append('period', filters.period);
  if (filters.task_id) params.append('task_id', filters.task_id);
  if (page) params.append('page', String(page));
  const response = await api.get(`/screenshots/my?${params.toString()}`);
  return response.data;
};

export const deleteScreenshot = async (id) => {
  return await api.delete(`/screenshots/${id}`);
};
