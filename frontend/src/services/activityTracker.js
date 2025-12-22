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
    this.lastKeyTime = 0;

    // Session Management
    this.lastSessionPostTs = 0;
    this.sessionPostCooldownMs = 10 * 60 * 1000; // 10 minutes (only used if not forced)
    this.minSessionSeconds = 15; // client-side guard to avoid spam
    this.isFlushing = false; // prevent concurrent flushes
    this.lastFlushedStart = null; // ISO string of last flushed segment start
    this.lastStateChangeTs = 0; // throttle visibility/blur-driven flushes
    
    // Cross-tab tracking
    this.broadcastChannel = new BroadcastChannel('team_manage_activity');
    this.overrideUrl = null;
    this.overrideTitle = null;
    this.lastBroadcastTime = 0;
    
    // Bind methods
    this.handleBroadcastMessage = this.handleBroadcastMessage.bind(this);
    this.reportPresence = this.reportPresence.bind(this);
    this.enableReportingOnly = this.enableReportingOnly.bind(this);

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
    
    // Initialize first minute
    this.initializeMinute(this.currentMinute);
    
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
    
    // console.log('🎯 Enhanced global activity tracking started');
    // console.log('📡 Tracking across all tabs, windows, and applications');
    
    // Initialize session tracking
    this.sessionStart = new Date();
    this.sessionUrl = window.location?.href || '';
    this.sessionTitle = document?.title || '';
    this.sessionKeyboard = 0;
    this.sessionMouse = 0;
    
    // Listen for cross-tab activity
    this.broadcastChannel.addEventListener('message', this.handleBroadcastMessage);
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
    
    // Remove cross-tab listener
    this.broadcastChannel.removeEventListener('message', this.handleBroadcastMessage);
    
    // Clear activity check interval
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
    
    // console.log('🛑 Enhanced activity tracking stopped');
    // console.log('📊 Per-minute data:', this.getMinuteBreakdown());
    
    // Force flush final session
    await this.safePostSession({ __force: true });
    
    this.sessionStart = null;
    this.sessionKeyboard = 0;
    this.sessionMouse = 0;
  }

  enableReportingOnly() {
    // This mode is for tabs that are NOT the main tracker but should report their activity
    if (this.isTracking) return; 
    
    // Prevent duplicate listeners/intervals
    if (this.isReporting) return;
    this.isReporting = true;

    // Listen for visibility and focus to report presence
    document.addEventListener('visibilitychange', this.reportPresence);
    window.addEventListener('focus', this.reportPresence);
    
    // Also report immediately if visible
    if (!document.hidden) {
      this.reportPresence();
    }
    
    // Send heartbeat every 3 seconds while visible
    setInterval(() => {
      if (!document.hidden) {
        this.reportPresence();
      }
    }, 3000);
  }

  reportPresence() {
    if (document.hidden) return;
    
    try {
      this.broadcastChannel.postMessage({
        type: 'ACTIVITY_UPDATE',
        url: window.location.href,
        title: document.title
      });
    } catch (e) {
      // console.error('Broadcast failed', e);
    }
  }

  async handleBroadcastMessage(event) {
    if (!this.isTracking) return;
    
    const { type, url, title } = event.data;
    
    if (type === 'ACTIVITY_UPDATE') {
      // We received a signal that the user is active on another tab in this app
      this.lastBroadcastTime = Date.now();
      
      // If we are hidden (or even if not, but the other tab is claiming focus),
      // we trust the broadcast if it's recent.
      // But typically we only care if we (tracker tab) are hidden.
      if (document.hidden) {
        const oldUrl = this.sessionUrl;
        const oldTitle = this.sessionTitle;
        
        this.overrideUrl = url;
        this.overrideTitle = title;
        
        // If URL changed significantly, we need to segment.
        if (oldUrl !== url || oldTitle !== title) {
           // Ensure we post the OLD session with the OLD url
           this.sessionUrl = oldUrl;
           this.sessionTitle = oldTitle;
           await this.safePostSession({ __force: true });
           // safePostSession will reset sessionUrl to overrideUrl (new) automatically
        } else {
           // No change, just ensure state is sync
           this.sessionUrl = url;
           this.sessionTitle = title;
        }
        
        // Update current minute data immediately
        const md = this.minuteData.get(this.currentMinute);
        if (md) {
          md.url = url;
          md.title = title;
        }
      }
    }
  }

  // Unified Session Posting Logic
  async safePostSession(payload = {}) {
    if (!this.sessionStart) return;
    if (this.isFlushing) return;

    const now = Date.now();
    // Chrome History Style: Only post if forced (URL/Title change, stop, blur) 
    // OR if cooldown passed (fallback).
    // If payload.__force is NOT true, check cooldown.
    if (!payload.__force && (now - this.lastSessionPostTs < this.sessionPostCooldownMs)) {
      return;
    }

    try {
      this.isFlushing = true;
      const end = new Date();
      const start = this.sessionStart;
      const startIso = start.toISOString();
      if (payload.__force && this.lastFlushedStart && this.lastFlushedStart === startIso) {
        return;
      }
      const durationSeconds = Math.max(0, Math.round((end - start) / 1000));
      
      // Only post if meaningful duration
      if (durationSeconds >= this.minSessionSeconds) {
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

        // DISABLED AS PER USER REQUEST - Do not store sessions in DB
        // await api.post('/activity-sessions', data);
        // console.log('🪟 Session segment recorded (SKIPPED POST):', data.window_title);
      }
    } catch (e) {
      // console.log('⚠️ Failed to flush session:', e?.message || e);
    } finally {
      try {
        this.lastFlushedStart = this.sessionStart ? this.sessionStart.toISOString() : null;
      } catch {}
      this.isFlushing = false;
    }

    // Reset session start for the NEXT segment
    this.sessionStart = new Date();
    this.sessionKeyboard = 0;
    this.sessionMouse = 0;
    this.lastSessionPostTs = Date.now();
    
    // Update title/url for the next segment
    if (document.hidden) {
      if (this.overrideUrl) {
        this.sessionUrl = this.overrideUrl;
        this.sessionTitle = this.overrideTitle;
      } else {
        this.sessionUrl = 'System/External';
        this.sessionTitle = 'External Activity / Other App';
      }
    } else {
      this.sessionUrl = this.overrideUrl || window.location?.href || '';
      this.sessionTitle = this.overrideTitle || document?.title || '';
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
          // console.log('⚠️ Cannot access frame (cross-origin):', e.message);
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
                // console.log('⚠️ Cannot access iframe:', e.message);
              }
            }
          });
        });
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
      
    } catch (error) {
      // console.log('⚠️ Error setting up global listeners:', error.message);
    }
  }
  
  async handleVisibilityChange() {
    const now = Date.now();
    if (now - this.lastStateChangeTs < 1500) return;
    this.lastStateChangeTs = now;
    if (document.hidden) {
      // Tab hidden -> End session segment (was Browser)
      await this.safePostSession({ __force: true });
      // Next session starts as External (handled by safePostSession logic)
    } else {
      // Tab visible -> End session segment (was External or Remote Tab)
      await this.safePostSession({ __force: true });
      
      this.overrideUrl = null;
      this.overrideTitle = null;

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
    const now = Date.now();
    if (now - this.lastStateChangeTs < 1500) return;
    this.lastStateChangeTs = now;
    // Window blur -> End session segment
    await this.safePostSession({ __force: true });
  }
  
  checkActivity() {
    if (!this.isTracking) return;
    
    const now = Date.now();
    
    // Check for stale override (no broadcast for 5 seconds)
    if (this.overrideUrl && (now - this.lastBroadcastTime > 5000)) {
      // console.log('⚠️ Override stale, reverting to external');
      this.overrideUrl = null;
      this.overrideTitle = null;
      
      // If we are still hidden, revert to System/External
      if (document.hidden) {
         this.sessionUrl = 'System/External';
         this.sessionTitle = 'External Activity / Other App';
         this.safePostSession({ __force: true });
      }
    }

    // We do NOT periodically flush here anymore for "Chrome History" style,
    // unless the cooldown is met (which is 10 mins).
    // The safePostSession call below handles the cooldown check.
    // If 10 mins passed, it saves.
    this.safePostSession({ __force: false });
    
    // Update minute tracking
    this.updateCurrentMinute();
    
    // Show current activity stats
    const currentStats = this.getFormattedStats();
  //  console.log(`📊 Activity Stats: ${currentStats.keyboardClicksPerMinute}/min keys, ${currentStats.mouseClicksPerMinute}/min clicks, ${currentStats.activityLevel}`);
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
      // console.log(`⏰ Switched to minute: ${this.currentMinute}`);
    }
    // Always keep url/title up to date for the current minute
    const md = this.minuteData.get(this.currentMinute);
    if (md) {
      md.url = this.overrideUrl || window.location?.href || md.url || '';
      md.title = this.overrideTitle || document?.title || md.title || '';
    }
    
    // Check for URL/Title change -> Force Session Segment
    const currentUrl = this.overrideUrl || window.location?.href || '';
    const currentTitle = this.overrideTitle || document?.title || '';
    
    if (this.sessionStart && (currentUrl !== this.sessionUrl || currentTitle !== this.sessionTitle)) {
      // console.log('🪟 URL/Title changed, forcing session segment...');
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
    this.lastKeyTime = Date.now();
    const minuteData = this.minuteData.get(this.currentMinute);
    if (minuteData) {
      minuteData.keyboard++;
      minuteData.url = window.location?.href || minuteData.url || '';
      minuteData.title = document?.title || minuteData.title || '';
    }
    
    // console.log(`⌨️ Key pressed: "${event.key}" (Total: ${this.keyboardClicks})`);
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
    
    // console.log(`🖱️ Mouse event: ${event.type} (Total: ${this.mouseClicks})`);
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
      this.lastMouseMove = now;
      
      if (this.mouseMoveCount % 50 === 0) {
        // console.log(`🖱️ Mouse movements: ${this.mouseMoveCount}`);
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
  }
  
  recordExternalMovement() {
    if (!this.isTracking) return;
    const now = Date.now();
    if (now - this.lastMouseMove > 150) {
      this.updateCurrentMinute();
      this.lastActivity = now;
    this.mouseMoveCount++;
    const minuteData = this.minuteData.get(this.currentMinute);
    if (minuteData) minuteData.movements++;
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
  }
  
  recordExternalTyping() {
    if (!this.isTracking) return;
    const now = Date.now();
    if (now - this.lastClickTime < 300) return;
    if (now - this.lastMouseMove < 150) return;
    this.updateCurrentMinute();
    this.lastActivity = now;
    this.keyboardClicks++;
    this.sessionKeyboard++;
    const md = this.minuteData.get(this.currentMinute);
    if (md) {
      md.keyboard++;
      md.url = this.overrideUrl || window.location?.href || md.url || '';
      md.title = this.overrideTitle || document?.title || md.title || '';
    }
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
    // Return all collected breakdown data regardless of duration calculation
    const boundedBreakdown = minuteBreakdown;
    
    return {
      keyboard_clicks: this.keyboardClicks,
      mouse_clicks: this.mouseClicks,
      activity_percentage: Math.round(activityScore * 100) / 100,
      activity_start_time: this.startTime ? this.startTime.toISOString() : null,
      activity_end_time: endTime.toISOString(),
      duration_minutes: Math.round(durationMinutes * 100) / 100,
      mouse_movements: this.mouseMoveCount,
      minute_breakdown: boundedBreakdown
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
    this.currentMinute = this.getCurrentMinuteKey();
    this.initializeMinute(this.currentMinute);
  }
}

const activityTracker = new ActivityTracker();
export default activityTracker;
