// Activity tracking service for monitoring keyboard and mouse activity
import api from './api';

class ActivityTracker {
  constructor() {
    this.keyboardClicks = 0;
    this.mouseClicks = 0;
    this.startTime = null;
    this.isTracking = false;
    this.minuteData = new Map(); // Store per-minute data
    this.secondData = new Map();
    this.currentMinute = null;
    this.currentSecond = null;
    this.lastActivity = Date.now();
    this.activityCheckInterval = null;
    
    // Bind event handlers
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleMouseClick = this.handleMouseClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    
    this.lastMouseMove = Date.now();
    this.mouseMoveCount = 0;
    this.isWindowFocused = true;
    this.sessionStart = null;
    this.sessionUrl = '';
    this.sessionTitle = '';
    this.sessionKeyboard = 0;
    this.sessionMouse = 0;

    // Session Management
    this.lastSessionPostTs = 0;
    this.sessionPostCooldownMs = 10 * 60 * 1000; // 10 minutes (only used if not forced)
    
    // Debounce for clicks
    this.lastClickTime = 0;
  }
  
  startTracking() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    this.startTime = new Date();
    this.keyboardClicks = 0;
    this.mouseClicks = 0;
    this.mouseMoveCount = 0;
    this.lastMouseMove = Date.now();
    this.lastActivity = Date.now();
    this.minuteData.clear();
    this.currentMinute = this.getCurrentMinuteKey();
    this.currentSecond = this.getCurrentSecondKey();
    
    // Initialize first minute
    this.initializeMinute(this.currentMinute);
    this.initializeSecond(this.currentSecond);
    
    // Add global event listeners (capture phase for all events)
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('mousedown', this.handleMouseClick, true);
    document.addEventListener('mouseup', this.handleMouseClick, true);
    document.addEventListener('pointerdown', this.handleMouseClick, true);
    document.addEventListener('auxclick', this.handleMouseClick, true);
    document.addEventListener('dblclick', this.handleMouseClick, true);
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('wheel', this.handleWheel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('focus', this.handleFocus, true);
    window.addEventListener('blur', this.handleBlur, true);
    
    // Add listeners to all frames and iframes
    this.addGlobalListeners();
    
    // Start activity monitoring interval
    this.activityCheckInterval = setInterval(() => {
      this.checkActivity();
    }, 5000); // Check every 5 seconds
    
    console.log('🎯 Enhanced global activity tracking started');
    console.log('📡 Tracking across all tabs, windows, and applications');
    
    // Initialize session tracking
    this.sessionStart = new Date();
    this.sessionUrl = window.location?.href || '';
    this.sessionTitle = document?.title || '';
    this.sessionKeyboard = 0;
    this.sessionMouse = 0;
  }
  
  async stopTracking() {
    if (!this.isTracking) return;
    
    this.isTracking = false;
    
    // Remove all event listeners
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('mousedown', this.handleMouseClick, true);
    document.removeEventListener('mouseup', this.handleMouseClick, true);
    document.removeEventListener('pointerdown', this.handleMouseClick, true);
    document.removeEventListener('auxclick', this.handleMouseClick, true);
    document.removeEventListener('dblclick', this.handleMouseClick, true);
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleFocus, true);
    window.removeEventListener('blur', this.handleBlur, true);
    document.removeEventListener('wheel', this.handleWheel, { capture: true });
    
    // Clear activity check interval
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
    
    console.log('🛑 Enhanced activity tracking stopped');
    console.log('📊 Per-minute data:', this.getMinuteBreakdown());
    
    // Force flush final session
    await this.safePostSession({ __force: true });
    
    this.sessionStart = null;
    this.sessionKeyboard = 0;
    this.sessionMouse = 0;
  }

  // Unified Session Posting Logic
  async safePostSession(payload = {}) {
    if (!this.sessionStart) return;

    const now = Date.now();
    // Chrome History Style: Only post if forced (URL/Title change, stop, blur) 
    // OR if cooldown passed (fallback).
    // If payload.__force is NOT true, check cooldown.
    if (!payload.__force && (now - this.lastSessionPostTs < this.sessionPostCooldownMs)) {
      return;
    }

    try {
      const end = new Date();
      const start = this.sessionStart;
      const durationSeconds = Math.max(0, Math.round((end - start) / 1000));
      
      // Only post if meaningful duration
      if (durationSeconds > 0) {
        const data = {
          task_id: window.__ACTIVE_TASK_ID__ || window.__LAST_TASK_ID__ || null,
          app_name: 'browser',
          window_title: this.sessionTitle,
          url: this.sessionUrl,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_seconds: durationSeconds,
          keyboard_clicks: this.sessionKeyboard,
          mouse_clicks: this.sessionMouse,
          ...payload // Allow overriding if needed, but mainly we use the class state
        };
        // Remove internal flags from payload before sending
        delete data.__force;

        await api.post('/activity-sessions', data);
        console.log('🪟 Session segment recorded:', data.window_title);
      }
    } catch (e) {
      console.log('⚠️ Failed to flush session:', e?.message || e);
    }

    // Reset session start for the NEXT segment
    this.sessionStart = new Date();
    this.sessionKeyboard = 0;
    this.sessionMouse = 0;
    this.lastSessionPostTs = Date.now();
    
    // Update title/url for the next segment
    if (document.hidden) {
      this.sessionUrl = 'System/External';
      this.sessionTitle = 'External Activity / Other App';
    } else {
      this.sessionUrl = window.location?.href || '';
      this.sessionTitle = document?.title || '';
    }
  }
  
  addGlobalListeners() {
    try {
      // Add listeners to all frames
      const frames = window.frames;
      for (let i = 0; i < frames.length; i++) {
        try {
          const frame = frames[i];
          if (frame.document) {
            frame.document.addEventListener('keydown', this.handleKeyDown, true);
            frame.document.addEventListener('mousedown', this.handleMouseClick, true);
            frame.document.addEventListener('mouseup', this.handleMouseClick, true);
            frame.document.addEventListener('pointerdown', this.handleMouseClick, true);
            frame.document.addEventListener('auxclick', this.handleMouseClick, true);
            frame.document.addEventListener('dblclick', this.handleMouseClick, true);
            frame.document.addEventListener('mousemove', this.handleMouseMove, true);
            frame.document.addEventListener('wheel', this.handleWheel, { capture: true, passive: true });
          }
        } catch (e) {
          console.log('⚠️ Cannot access frame (cross-origin):', e.message);
        }
      }
      
      // Monitor for new iframes being added
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'IFRAME') {
              try {
                node.addEventListener('load', () => {
                  if (node.contentDocument) {
                    node.contentDocument.addEventListener('keydown', this.handleKeyDown, true);
                    node.contentDocument.addEventListener('mousedown', this.handleMouseClick, true);
                    node.contentDocument.addEventListener('mouseup', this.handleMouseClick, true);
                    node.contentDocument.addEventListener('pointerdown', this.handleMouseClick, true);
                    node.contentDocument.addEventListener('auxclick', this.handleMouseClick, true);
                    node.contentDocument.addEventListener('dblclick', this.handleMouseClick, true);
                    node.contentDocument.addEventListener('mousemove', this.handleMouseMove, true);
                    node.contentDocument.addEventListener('wheel', this.handleWheel, { capture: true, passive: true });
                  }
                });
              } catch (e) {
                console.log('⚠️ Cannot access iframe:', e.message);
              }
            }
          });
        });
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
      
    } catch (error) {
      console.log('⚠️ Error setting up global listeners:', error.message);
    }
  }
  
  async handleVisibilityChange() {
    if (document.hidden) {
      // Tab hidden -> End session segment (was Browser)
      await this.safePostSession({ __force: true });
      // Next session starts as External (handled by safePostSession logic)
    } else {
      // Tab visible -> End session segment (was External)
      await this.safePostSession({ __force: true });
      
      this.lastActivity = Date.now();
      // Next session starts as Browser
      this.sessionUrl = window.location?.href || '';
      this.sessionTitle = document?.title || '';
    }
  }
  
  handleFocus() {
    this.isWindowFocused = true;
    this.lastActivity = Date.now();
  }
  
  async handleBlur() {
    this.isWindowFocused = false;
    // Window blur -> End session segment
    await this.safePostSession({ __force: true });
  }
  
  checkActivity() {
    if (!this.isTracking) return;
    
    const now = Date.now();
    // We do NOT periodically flush here anymore for "Chrome History" style,
    // unless the cooldown is met (which is 10 mins).
    // The safePostSession call below handles the cooldown check.
    // If 10 mins passed, it saves.
    this.safePostSession({ __force: false });
    
    // Update minute tracking
    this.updateCurrentMinute();
    
    // Show current activity stats
    const currentStats = this.getFormattedStats();
    console.log(`📊 Activity Stats: ${currentStats.keyboardClicksPerMinute}/min keys, ${currentStats.mouseClicksPerMinute}/min clicks, ${currentStats.activityLevel}`);
  }
  
  getCurrentMinuteKey() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }
  getCurrentSecondKey() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  }
  
  initializeMinute(minuteKey) {
    if (!this.minuteData.has(minuteKey)) {
      this.minuteData.set(minuteKey, {
        keyboard: 0,
        mouse: 0,
        movements: 0,
        timestamp: new Date(),
        url: window.location?.href || '',
        title: document?.title || ''
      });
    }
  }
  initializeSecond(secondKey) {
    if (!this.secondData.has(secondKey)) {
      this.secondData.set(secondKey, {
        keyboard: 0,
        mouse: 0,
        movements: 0,
        timestamp: new Date()
      });
    }
  }
  
  async updateCurrentMinute() {
    const newMinute = this.getCurrentMinuteKey();
    if (newMinute !== this.currentMinute) {
      this.currentMinute = newMinute;
      this.initializeMinute(this.currentMinute);
      console.log(`⏰ Switched to minute: ${this.currentMinute}`);
    }
    const newSecond = this.getCurrentSecondKey();
    if (newSecond !== this.currentSecond) {
      this.currentSecond = newSecond;
      this.initializeSecond(this.currentSecond);
    }
    // Always keep url/title up to date for the current minute
    const md = this.minuteData.get(this.currentMinute);
    if (md) {
      md.url = window.location?.href || md.url || '';
      md.title = document?.title || md.title || '';
    }
    
    // Check for URL/Title change -> Force Session Segment
    const currentUrl = window.location?.href || '';
    const currentTitle = document?.title || '';
    
    if (this.sessionStart && (currentUrl !== this.sessionUrl || currentTitle !== this.sessionTitle)) {
      console.log('🪟 URL/Title changed, forcing session segment...');
      // Update internal state first so the post uses the OLD url/title for the OLD segment
      // Actually, safePostSession uses this.sessionUrl/Title which are currently the OLD ones.
      // After posting, it resets them to current.
      await this.safePostSession({ __force: true });
    }
  }
  
  handleKeyDown(event) {
    if (!this.isTracking) return;
    
    this.updateCurrentMinute();
    this.lastActivity = Date.now();
    
    if (event.repeat) return;
    
    this.keyboardClicks++;
    this.sessionKeyboard++;
    const minuteData = this.minuteData.get(this.currentMinute);
    if (minuteData) {
      minuteData.keyboard++;
      minuteData.url = window.location?.href || minuteData.url || '';
      minuteData.title = document?.title || minuteData.title || '';
    }
    const secondData = this.secondData.get(this.currentSecond);
    if (secondData) {
      secondData.keyboard++;
    }
    
    console.log(`⌨️ Key pressed: "${event.key}" (Total: ${this.keyboardClicks})`);
  }
  
  handleMouseClick(event) {
    if (!this.isTracking) return;
    
    const now = Date.now();
    // Debounce: ignore clicks within 50ms of the last one
    if (now - this.lastClickTime < 50) return;
    this.lastClickTime = now;

    this.updateCurrentMinute();
    this.lastActivity = now;
    
    const isPrimary = event.type === 'mousedown' || event.type === 'mouseup' || event.type === 'pointerdown';
    const isAux = event.type === 'auxclick' || event.type === 'dblclick';
    
    if (isPrimary || isAux) {
      this.mouseClicks++;
      this.sessionMouse++;
    }
    const minuteData = this.minuteData.get(this.currentMinute);
    if (minuteData) {
      if (isPrimary || isAux) minuteData.mouse++;
      minuteData.url = window.location?.href || minuteData.url || '';
      minuteData.title = document?.title || minuteData.title || '';
    }
    const secondData = this.secondData.get(this.currentSecond);
    if (secondData) {
      if (isPrimary || isAux) secondData.mouse++;
    }
    
    console.log(`🖱️ Mouse event: ${event.type} (Total: ${this.mouseClicks})`);
  }
  
  handleMouseMove(event) {
    if (!this.isTracking) return;
    
    const now = Date.now();
    if (now - this.lastMouseMove > 200) {
      this.updateCurrentMinute();
      this.lastActivity = now;
      
      this.mouseMoveCount++;
      const minuteData = this.minuteData.get(this.currentMinute);
      if (minuteData) {
        minuteData.movements++;
      }
      const secondData = this.secondData.get(this.currentSecond);
      if (secondData) {
        secondData.movements++;
      }
      this.lastMouseMove = now;
      
      if (this.mouseMoveCount % 50 === 0) {
        console.log(`🖱️ Mouse movements: ${this.mouseMoveCount}`);
      }
    }
  }

  handleWheel(event) {
    if (!this.isTracking) return;
    this.updateCurrentMinute();
    this.lastActivity = Date.now();
    this.mouseMoveCount++;
    const minuteData = this.minuteData.get(this.currentMinute);
    if (minuteData) {
      minuteData.movements++;
    }
    const secondData = this.secondData.get(this.currentSecond);
    if (secondData) {
      secondData.movements++;
    }
  }
  
  recordExternalMovement() {
    if (!this.isTracking) return;
    const now = Date.now();
    if (now - this.lastMouseMove > 150) {
      this.updateCurrentMinute();
      this.lastActivity = now;
      this.mouseMoveCount++;
      const md = this.minuteData.get(this.currentMinute);
      if (md) md.movements++;
      const sd = this.secondData.get(this.currentSecond);
      if (sd) sd.movements++;
      this.lastMouseMove = now;
    }
  }
  
  recordExternalClick() {
    if (!this.isTracking) return;
    this.updateCurrentMinute();
    this.lastActivity = Date.now();
    this.mouseClicks++;
    const md = this.minuteData.get(this.currentMinute);
    if (md) md.mouse++;
    const sd = this.secondData.get(this.currentSecond);
    if (sd) sd.mouse++;
  }
  
  recordExternalTyping() {
    if (!this.isTracking) return;
    this.updateCurrentMinute();
    this.lastActivity = Date.now();
    this.keyboardClicks++;
    this.sessionKeyboard++;
    const md = this.minuteData.get(this.currentMinute);
    if (md) {
      md.keyboard++;
      md.url = window.location?.href || md.url || '';
      md.title = document?.title || md.title || '';
    }
    const sd = this.secondData.get(this.currentSecond);
    if (sd) sd.keyboard++;
  }
  
  getActivityData() {
    const endTime = new Date();
    const durationMinutes = this.startTime ? (endTime - this.startTime) / 1000 / 60 : 0;
    
    let activityScore = 0;
    
    if (durationMinutes > 0) {
      const keyboardActivity = Math.min((this.keyboardClicks / durationMinutes) / 50, 1);
      const mouseActivity = Math.min(((this.mouseClicks + this.mouseMoveCount / 10) / durationMinutes) / 30, 1);
      activityScore = (keyboardActivity * 0.6 + mouseActivity * 0.4) * 100;
    }
    
    const minuteBreakdown = this.getMinuteBreakdown();
    const maxMinutesFloor = Math.max(0, Math.floor(durationMinutes));
    const targetCount = maxMinutesFloor > 0 ? maxMinutesFloor : (minuteBreakdown.length > 0 ? 1 : 0);
    const boundedBreakdown = targetCount > 0 && minuteBreakdown.length > targetCount
      ? minuteBreakdown.slice(minuteBreakdown.length - targetCount)
      : minuteBreakdown;
    const secondRates = this.getPerSecondRates();
    
    return {
      keyboard_clicks: this.keyboardClicks,
      mouse_clicks: this.mouseClicks,
      activity_percentage: Math.round(activityScore * 100) / 100,
      activity_start_time: this.startTime ? this.startTime.toISOString() : null,
      activity_end_time: endTime.toISOString(),
      duration_minutes: Math.round(durationMinutes * 100) / 100,
      mouse_movements: this.mouseMoveCount,
      minute_breakdown: boundedBreakdown,
      keyboard_per_second: secondRates.keysPerSecond,
      mouse_per_second: secondRates.clicksPerSecond,
      movements_per_second: secondRates.movementsPerSecond
    };
  }
  
  getMinuteBreakdown() {
    const breakdown = [];
    for (const [minute, data] of this.minuteData.entries()) {
      breakdown.push({
        time: minute,
        keyboard_clicks: data.keyboard,
        mouse_clicks: data.mouse,
        mouse_movements: data.movements,
        total_activity: data.keyboard + data.mouse + Math.floor(data.movements / 10),
        timestamp: data.timestamp,
        url: data.url || '',
        title: data.title || ''
      });
    }
    breakdown.sort((a, b) => a.time.localeCompare(b.time));
    return breakdown;
  }

  getPerSecondRates() {
    let totalKeys = 0;
    let totalClicks = 0;
    let totalMovements = 0;
    let secondsCount = 0;

    for (const data of this.secondData.values()) {
        totalKeys += data.keyboard;
        totalClicks += data.mouse;
        totalMovements += data.movements;
        secondsCount++;
    }

    return {
        keysPerSecond: secondsCount > 0 ? (totalKeys / secondsCount).toFixed(2) : 0,
        clicksPerSecond: secondsCount > 0 ? (totalClicks / secondsCount).toFixed(2) : 0,
        movementsPerSecond: secondsCount > 0 ? (totalMovements / secondsCount).toFixed(2) : 0
    };
  }

  getFormattedStats() {
    const data = this.getActivityData();
    const durationMin = data.duration_minutes || 1;
    return {
      keyboardClicksPerMinute: Math.round(this.keyboardClicks / durationMin),
      mouseClicksPerMinute: Math.round(this.mouseClicks / durationMin),
      activityLevel: `${data.activity_percentage}%`
    };
  }
  
  resetTracking() {
    this.startTime = new Date();
    this.keyboardClicks = 0;
    this.mouseClicks = 0;
    this.mouseMoveCount = 0;
    this.minuteData.clear();
    this.secondData.clear();
    this.currentMinute = this.getCurrentMinuteKey();
    this.currentSecond = this.getCurrentSecondKey();
    this.initializeMinute(this.currentMinute);
    this.initializeSecond(this.currentSecond);
  }
}

const activityTracker = new ActivityTracker();
export default activityTracker;
