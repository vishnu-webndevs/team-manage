import React, { useEffect, useRef, useState } from 'react';
import { timeTrackService, taskService, projectService } from '../services';
import { startScreenshotting, stopScreenshotting, getScreenshots, captureNow } from '../services/screenshotService';
import activityTracker from '../services/activityTracker';
import ScreenshotNotification from '../components/ScreenshotNotification';
import api, { getStorageUrl } from '../services/api';
import html2canvas from 'html2canvas';
import '../styles/timetracker.css';

const formatTime = (s) => {
  // Handle NaN, null, undefined, or negative values
  if (isNaN(s) || s == null || s < 0) {
    return '00:00:00';
  }
  
  const totalSeconds = Math.floor(s);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const TimeTracker = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [time, setTime] = useState(0);
  const [todayTotalTime, setTodayTotalTime] = useState(0); // Today's total tracked time
  const [taskTodayTotalTime, setTaskTodayTotalTime] = useState(0);
  const [taskTimeLimit, setTaskTimeLimit] = useState(0); // Task time limit in seconds
  const [taskCapSeconds, setTaskCapSeconds] = useState(0);
  const [taskTrackedSeconds, setTaskTrackedSeconds] = useState(0);
  const [taskRemainingSeconds, setTaskRemainingSeconds] = useState(0);
  const [resumedTime, setResumedTime] = useState(0); // Time to resume from
  const [activeTimeTrack, setActiveTimeTrack] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [history, setHistory] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [startForm, setStartForm] = useState({ task_id: '', project_id: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [selectedTaskName, setSelectedTaskName] = useState('');
  const [activityStats, setActivityStats] = useState({ keyboard: 0, mouse: 0, activity: 0 });
  const timerRef = useRef(null);
  const screenshotListRef = useRef(null);
  const activityUpdateRef = useRef(null);
  const isTrackingRef = useRef(false);
  const autoStopTimeoutRef = useRef(null);
  const [taskRemainingMap, setTaskRemainingMap] = useState({});
  const warned90Ref = useRef(false);
  const hardStopTimeoutRef = useRef(null);
  const activeTrackIdRef = useRef(null);
  const isStoppingRef = useRef(false);

  const showToast = (title, message, type = 'warning') => {
    const el = document.createElement('div');
    let bg = '#fff3cd', fg = '#856404', border = '#ffeaa7';
    if (type === 'success') { bg = '#d4edda'; fg = '#155724'; border = '#c3e6cb'; }
    if (type === 'error') { bg = '#f8d7da'; fg = '#721c24'; border = '#f5c6cb'; }
    el.style.cssText = `position:fixed;top:20px;right:20px;background:${bg};color:${fg};padding:12px 14px;border-radius:8px;border:1px solid ${border};z-index:10000;max-width:360px;font-family:system-ui,sans-serif;box-shadow:0 4px 15px rgba(0,0,0,.1)`;
    el.innerHTML = `<strong>${title}</strong><br><small>${message}</small>`;
    document.body.appendChild(el);
    setTimeout(() => { if (document.body.contains(el)) document.body.removeChild(el); }, 4000);
  };

  useEffect(() => {
    const loadRemaining = async () => {
      const map = {};
      const list = tasks.slice(0, 100);
      const workers = list.map(async (t) => {
        try {
          const res = await timeTrackService.getRemaining(parseInt(t.id), { period: 'total' });
          map[t.id] = Math.max(0, Number(res.data?.remaining_seconds ?? 0));
        } catch {
          const cap = getTaskTimeLimit(t.id);
          map[t.id] = cap;
        }
      });
      await Promise.allSettled(workers);
      setTaskRemainingMap(map);
    };
    if (tasks && tasks.length) {
      loadRemaining();
    } else {
      setTaskRemainingMap({});
    }
  }, [tasks]);

  useEffect(() => {
    const handler = (e) => {
      const r = e.reason;
      const msg = typeof r === 'string' ? r : (r && (r.message || r.toString()));
      if (msg && String(msg).includes('message channel closed before a response')) {
        e.preventDefault();
        console.log('Ignored extension async response error');
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const dbg = params.get('debugLimitSeconds');
      if (dbg) {
        const v = Math.max(0, parseInt(dbg));
        if (!isNaN(v) && v > 0) {
          localStorage.setItem('TM_DEBUG_SHORT_LIMIT_SECONDS', String(v));
          console.log(`TM_DEBUG_SHORT_LIMIT_SECONDS set to ${v}s`);
        }
      }
    } catch {}
  }, []);

  // Calculate today's total tracking time
  const calculateTodayTotal = (historyData, filterTaskId = null) => {
    const today = new Date().toDateString();
    return historyData
      .filter(track => {
        const trackDate = new Date(track.start_time).toDateString();
        const matchesTask = !filterTaskId || String(track.task_id) === String(filterTaskId);
        return trackDate === today && track.end_time && matchesTask;
      })
      .reduce((total, track) => {
        const start = new Date(track.start_time).getTime();
        const end = new Date(track.end_time).getTime();
        return total + Math.floor((end - start) / 1000);
      }, 0);
  };

  // Get task time limit from task data
  const getTaskTimeLimit = (taskId) => {
    const task = tasks.find(t => t.id === parseInt(taskId));
    if (task && task.estimated_hours) {
      return task.estimated_hours * 3600; // Convert hours to seconds
    }
    return 0;
  };

  const fetchRemainingForTask = async (taskId) => {
    try {
      const res = await timeTrackService.getRemaining(parseInt(taskId), { period: 'total' });
      const remaining = res.data?.remaining_seconds ?? 0;
      const base = Math.max(0, Number(remaining) || 0);
      const override = Math.max(0, parseInt(localStorage.getItem('TM_DEBUG_SHORT_LIMIT_SECONDS') || '0'));
      return override > 0 ? override : base;
    } catch {
      // Fallback to full limit
      const base = getTaskTimeLimit(taskId);
      const override = Math.max(0, parseInt(localStorage.getItem('TM_DEBUG_SHORT_LIMIT_SECONDS') || '0'));
      return override > 0 ? override : base;
    }
  };

  const refreshTaskLimitInfo = async (taskId) => {
    if (!taskId) {
      setTaskCapSeconds(0);
      setTaskTrackedSeconds(0);
      setTaskRemainingSeconds(0);
      setTaskTimeLimit(0);
      return;
    }
    try {
      const res = await timeTrackService.getRemaining(parseInt(taskId), { period: 'total' });
      let cap = Math.max(0, Number(res.data?.cap_seconds ?? 0));
      let tracked = Math.max(0, Number(res.data?.tracked_seconds ?? 0));
      let remaining = Math.max(0, Number(res.data?.remaining_seconds ?? 0));
      const override = Math.max(0, parseInt(localStorage.getItem('TM_DEBUG_SHORT_LIMIT_SECONDS') || '0'));
      if (override > 0) { cap = override; remaining = override; }
      setTaskCapSeconds(cap);
      setTaskTrackedSeconds(tracked);
      setTaskRemainingSeconds(remaining);
      setTaskTimeLimit(remaining);
    } catch {
      let cap = getTaskTimeLimit(taskId);
      const override = Math.max(0, parseInt(localStorage.getItem('TM_DEBUG_SHORT_LIMIT_SECONDS') || '0'));
      if (override > 0) cap = override;
      setTaskCapSeconds(cap);
      setTaskTrackedSeconds(0);
      setTaskRemainingSeconds(cap);
      setTaskTimeLimit(cap);
    }
  };

  // Save current timer state to localStorage
  const saveTimerState = () => {
    if (activeTimeTrack) {
      const state = {
        activeTimeTrack,
        time,
        isTracking,
        startForm,
        timestamp: Date.now()
      };
      localStorage.setItem('timerState', JSON.stringify(state));
    }
  };

  // Load timer state from localStorage
  const loadTimerState = () => {
    try {
      const saved = localStorage.getItem('timerState');
      if (saved) {
        const state = JSON.parse(saved);
        const now = Date.now();
        const elapsed = Math.floor((now - state.timestamp) / 1000);
        
        // Validate state data
        if (!state.activeTimeTrack || 
            typeof state.time !== 'number' || 
            isNaN(state.time) ||
            !state.timestamp ||
            elapsed < 0) {
          console.log('🚫 Invalid timer state found, clearing...');
          clearTimerState();
          return false;
        }
        
        // If more than 1 hour ago, don't resume
        if (elapsed >= 3600) {
          console.log('⏰ Timer state too old (>1h), clearing...');
          clearTimerState();
          return false;
        }
        
        // Only resume if was actually tracking
        if (state.isTracking && state.activeTimeTrack) {
          const resumeTime = Math.max(0, state.time + elapsed); // Ensure non-negative
          
          setActiveTimeTrack(state.activeTimeTrack);
          setStartForm(state.startForm || { task_id: '', project_id: '', description: '' });
          setResumedTime(resumeTime);
          setTime(resumeTime);
          setIsTracking(true);
          
          console.log(`🔄 Resuming timer from ${formatTime(state.time)} + ${formatTime(elapsed)} = ${formatTime(resumeTime)}`);
          return true;
        }
      }
    } catch (error) {
      console.log('❌ Error loading timer state:', error);
      clearTimerState();
    }
    return false;
  };

  // Clear saved timer state
  const clearTimerState = () => {
    localStorage.removeItem('timerState');
  };

  const loadActive = async () => {
    try {
      // First check if we have resumable state from localStorage
      const hasResumableState = loadTimerState();
      
      if (hasResumableState) {
        console.log('✅ Timer resumed from localStorage - not auto-starting');
        return; // Exit early, timer already resumed
      }
      
      // Only check server if no resumable state
      const res = await timeTrackService.getActiveTimer();
      
      if (res.data) {
        setActiveTimeTrack(res.data);
        setIsTracking(true);
        const start = new Date(res.data.start_time).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);
        
        // Validate elapsed time
        if (isNaN(elapsed) || elapsed < 0) {
          console.log('❌ Invalid elapsed time, resetting timer');
          setIsTracking(false);
          setActiveTimeTrack(null);
          setTime(0);
          return;
        }
        
        setTime(elapsed);
        
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setTime((t) => {
            const newTime = t + 1;
            // Check task time limit
            if (taskTimeLimit > 0 && newTime >= taskTimeLimit) {
              console.log('⏰ Task time limit reached, stopping timer');
              stopTimer();
              return newTime;
            }
            return newTime;
          });
        }, 1000);
        
        const activeTaskId = res.data.task_id || res.data.task?.id;
        console.log('🔍 Active task ID:', activeTaskId, 'from data:', res.data);
        
        if (activeTaskId) {
          // Do not auto-start screenshotting here to avoid repeated permission prompts
          // Only load screenshots list; user actions (start/resume) will start capture
          const load = async () => {
            try {
              const data = await getScreenshots(activeTaskId);
              setScreenshots(data || []);
              console.log(`📸 Loaded ${data?.length || 0} screenshots for active task ${activeTaskId}`);
            } catch (error) {
              console.log('Error loading screenshots:', error);
            }
          };
          load();
          if (screenshotListRef.current) clearInterval(screenshotListRef.current);
          screenshotListRef.current = setInterval(load, 120000);
        }
      } else {
        setIsTracking(false);
        setActiveTimeTrack(null);
        setTime(0);
        if (timerRef.current) clearInterval(timerRef.current);
        if (screenshotListRef.current) clearInterval(screenshotListRef.current);
      }
    } catch {}
  };

  const loadTasksProjects = async () => {
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        taskService.getTasks({ assigned_to: 'me' }),
        projectService.getProjects(),
      ]);
      setTasks(tasksRes.data.data || []);
      setProjects(projectsRes.data.data || []);
    } catch {}
  };

  const loadHistory = async () => {
    try {
      const res = await timeTrackService.getTimeTracks();
      const historyData = res.data.data || [];
      setHistory(historyData);
      
      const overallToday = calculateTodayTotal(historyData);
      setTodayTotalTime(overallToday);
      const selectedTaskId = startForm.task_id ? parseInt(startForm.task_id) : null;
      const taskToday = selectedTaskId ? calculateTodayTotal(historyData, selectedTaskId) : 0;
      setTaskTodayTotalTime(taskToday);
    } catch {}
  };

  useEffect(() => {
    loadActive();
    loadTasksProjects();
    loadHistory();
    
    // Start activity stats update interval
    activityUpdateRef.current = setInterval(() => {
      if (isTrackingRef.current) {
        const stats = activityTracker.getFormattedStats();
        setActivityStats({
          keyboard: stats.keyboard_clicks || 0,
          mouse: stats.mouse_clicks || 0,
          activity: stats.activity_percentage || 0,
          keyboardPerSecond: stats.keyboardPerSecond || 0,
          mousePerSecond: stats.mousePerSecond || 0,
          movements: stats.mouse_movements || 0,
          movementsPerSecond: stats.movementsPerSecond || 0
        });
      }
    }, 2000); // Update every 2 seconds
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activityUpdateRef.current) clearInterval(activityUpdateRef.current);
    };
  }, []);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    const selectedTaskId = startForm.task_id ? parseInt(startForm.task_id) : null;
    const taskToday = selectedTaskId ? calculateTodayTotal(history, selectedTaskId) : 0;
    setTaskTodayTotalTime(taskToday);
    if (selectedTaskId) {
      refreshTaskLimitInfo(selectedTaskId);
    } else {
      refreshTaskLimitInfo(null);
    }
  }, [startForm.task_id, history]);

  const startTimer = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (timerRef.current) clearInterval(timerRef.current);
      setTime(0);
      setResumedTime(0);
      clearTimerState();
      if (startForm.task_id) {
        const t = tasks.find((tt) => String(tt.id) === String(startForm.task_id));
        const dd = t?.due_date ? new Date(t.due_date) : null;
        if (dd) {
          const now = new Date();
          const endOfDay = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23, 59, 59, 999);
          if (now > endOfDay) {
            alert('Task due date is over. Please update the due date or choose another task.');
            setLoading(false);
            return;
          }
        }
      }
      if (startForm.task_id) {
        const remaining = await fetchRemainingForTask(startForm.task_id);
        if (remaining <= 0) {
          alert('Time limit reached for this task');
          setLoading(false);
          return;
        }
      }
      const payload = {};
      if (startForm.task_id) payload.task_id = parseInt(startForm.task_id);
      if (startForm.project_id) payload.project_id = parseInt(startForm.project_id);
      if (startForm.description) payload.description = startForm.description;
      
      const res = await timeTrackService.startTimer(payload);
      setActiveTimeTrack(res.data.time_track);
      activeTrackIdRef.current = res.data?.time_track?.id || null;
      setIsTracking(true);
      // Reset current timer state for fresh task session
      setTime(0);
      setResumedTime(0);
      clearTimerState();
      
      // Get cap/tracked/remaining for robust auto-stop
      let cap = 0; let tracked = 0; let remaining = 0;
      if (startForm.task_id) {
        try {
          const infoRes = await timeTrackService.getRemaining(parseInt(startForm.task_id));
          cap = Math.max(0, Number(infoRes.data?.cap_seconds ?? 0));
          tracked = Math.max(0, Number(infoRes.data?.tracked_seconds ?? 0));
          remaining = Math.max(0, Number(infoRes.data?.remaining_seconds ?? 0));
        } catch {
          cap = getTaskTimeLimit(startForm.task_id);
          tracked = 0;
          remaining = cap;
        }
        setTaskCapSeconds(cap);
        setTaskTrackedSeconds(tracked);
        setTaskRemainingSeconds(remaining);
        setTaskTimeLimit(remaining);
        if (remaining > 0) {
          console.log(`⏰ Task remaining set: ${formatTime(remaining)} (cap ${formatTime(cap)}, tracked ${formatTime(tracked)})`);
          if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
          autoStopTimeoutRef.current = setTimeout(() => {
            console.log('⏰ Auto-stop timeout fired');
            if (!isStoppingRef.current) {
              isStoppingRef.current = true;
              stopTimer();
            }
          }, remaining * 1000 + 500);
          if (hardStopTimeoutRef.current) clearTimeout(hardStopTimeoutRef.current);
          hardStopTimeoutRef.current = setTimeout(() => {
            if (!isStoppingRef.current) {
              isStoppingRef.current = true;
              stopTimer();
            }
          }, Math.max(0, remaining * 1000 + 800));
        }
      }
      
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTime((t) => {
          const newTime = t + 1;
          
          // Save timer state every 30 seconds
          if (newTime % 30 === 0) {
            saveTimerState();
          }
          
          // Check task time limit
          if ((remaining > 0 && newTime >= remaining) || (cap > 0 && (tracked + newTime) >= cap)) {
            console.log('⏰ Task time limit reached, auto-stopping timer');
            if (!isStoppingRef.current) {
              isStoppingRef.current = true;
              stopTimer();
            }
            return newTime;
          }
          
          // Warning at 90% of time limit
          if (!warned90Ref.current && ((remaining > 0 && newTime >= Math.floor(remaining * 0.9)) || (cap > 0 && Math.floor(((tracked + newTime) / cap) * 100) >= 90))) {
            warned90Ref.current = true;
            console.log('⚠️ 90% of task time limit reached');
            showToast('⚠️ 90% limit reached', `Remaining: ${formatTime(remaining)} | Current: ${formatTime(newTime)}`, 'warning');
          }
          
          return newTime;
        });
      }, 1000);
      
      if (startForm.task_id) {
        const tid = parseInt(startForm.task_id);
        const task = tasks.find(t => t.id === tid);
        const project = projects.find(p => p.id === parseInt(startForm.project_id));
        const taskName = task?.name || task?.title || 'Unknown Task';
        const projectName = project?.name || 'Unknown Project';
        
        setSelectedTaskName(taskName);
        startScreenshotting(tid, taskName, projectName);
        
        // Load existing screenshots for this task
        const load = async () => {
          try {
            const data = await getScreenshots(tid);
            setScreenshots(data || []);
            console.log(`📸 Loaded ${data?.length || 0} screenshots for task ${tid}`);
          } catch (error) {
            console.log('Error loading screenshots:', error);
          }
        };
        load(); // Load immediately
        
        // Set up periodic refresh
        if (screenshotListRef.current) clearInterval(screenshotListRef.current);
        screenshotListRef.current = setInterval(load, 120000); // Refresh every 2 minutes
      }
      
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      await loadHistory(); // Refresh to get updated today's total
    } catch (error) {
      console.error('Start timer error:', error);
      if (error.response && error.response.status === 403) {
        const data = error.response.data;
        if (data.message === 'Time limit reached for this task') {
          showToast('⛔ Time Limit Reached', `Task limit: ${data.limit_hours}h | Tracked: ${data.tracked_hours}h`, 'error');
          alert(`Cannot start timer: Time limit reached for this task.\nLimit: ${data.limit_hours}h\nTracked: ${data.tracked_hours}h`);
        } else if (data.message === 'Task is past due date') {
          showToast('⛔ Task Overdue', `Due Date: ${data.due_date}`, 'error');
          alert(`Cannot start timer: Task is past due date (${data.due_date})`);
        } else if (data.message === 'Task is completed. Time tracking is disabled.') {
          showToast('⛔ Task Completed', 'Task is marked as completed', 'error');
          alert('Cannot start timer: Task is already completed.');
        } else {
           showToast('⛔ Error', data.message || 'Failed to start timer', 'error');
        }
      } else {
        showToast('❌ Error', 'Failed to start timer. Please try again.', 'error');
      }
    }
    setLoading(false);
  };

  const pauseTimer = () => {
    setIsTracking(false);
    setResumedTime(time); // Save current time for resume
    
    // Clear intervals but keep timer state
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (screenshotListRef.current) {
      clearInterval(screenshotListRef.current);
      screenshotListRef.current = null;
    }
    
    stopScreenshotting();
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
    saveTimerState(); // Save current state to localStorage
    
    console.log(`⏸️ Timer paused at ${formatTime(time)}`);
  };

  const resumeTimer = () => {
    setIsTracking(true);
    
    // Resume timer from current time
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTime((t) => {
        const newTime = t + 1;
        
        // Save timer state every 30 seconds
        if (newTime % 30 === 0) {
          saveTimerState();
        }
        
        // Check task time limit
        if ((taskTimeLimit > 0 && newTime >= taskTimeLimit) || (taskCapSeconds > 0 && (taskTrackedSeconds + newTime) >= taskCapSeconds)) {
          console.log('⏰ Task time limit reached, auto-stopping timer');
          setTimeout(() => stopTimer(), 1000); // Stop after 1 second
          return newTime;
        }
        
        // Warning at 90% of time limit
        if (!warned90Ref.current && ((taskTimeLimit > 0 && newTime >= Math.floor(taskTimeLimit * 0.9)) || (taskCapSeconds > 0 && Math.floor(((taskTrackedSeconds + newTime) / taskCapSeconds) * 100) >= 90))) {
          warned90Ref.current = true;
          console.log('⚠️ 90% of task time limit reached');
          showToast('⚠️ 90% limit reached', `Limit: ${formatTime(taskTimeLimit)} | Current: ${formatTime(newTime)}`, 'warning');
        }
        
        return newTime;
      });
    }, 1000);
    if (taskCapSeconds > 0) {
      const remainingMs = Math.max(0, (taskCapSeconds - taskTrackedSeconds - time) * 1000);
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Auto-stop timeout (resume) fired');
        if (!isStoppingRef.current) {
          isStoppingRef.current = true;
          stopTimer();
        }
      }, remainingMs + 500);
      if (hardStopTimeoutRef.current) clearTimeout(hardStopTimeoutRef.current);
      hardStopTimeoutRef.current = setTimeout(() => {
        if (!isStoppingRef.current) {
          isStoppingRef.current = true;
          stopTimer();
        }
      }, Math.max(0, remainingMs + 800));
    }
    
    // Resume screenshot capturing if task is selected
    if (activeTimeTrack?.task_id) {
      // Refresh remaining limit on resume
      fetchRemainingForTask(activeTimeTrack.task_id).then((sec) => setTaskTimeLimit(sec)).catch(() => {});
      const task = tasks.find(t => t.id === activeTimeTrack.task_id);
      const project = projects.find(p => p.id === activeTimeTrack.project_id);
      const taskName = task?.name || task?.title || 'Unknown Task';
      const projectName = project?.name || 'Unknown Project';
      
      startScreenshotting(activeTimeTrack.task_id, taskName, projectName);
      
      // Resume screenshot loading
      const load = async () => {
        try {
          const data = await getScreenshots(activeTimeTrack.task_id);
          setScreenshots(data || []);
          console.log(`📸 Resumed with ${data?.length || 0} screenshots for task ${activeTimeTrack.task_id}`);
        } catch (error) {
          console.log('Error loading screenshots:', error);
        }
      };
      load();
      if (screenshotListRef.current) clearInterval(screenshotListRef.current);
      screenshotListRef.current = setInterval(load, 120000);
    }
    
    saveTimerState();
    console.log(`▶️ Timer resumed from ${formatTime(time)}`);
    if (taskCapSeconds > 0) {
      const remainingMs = Math.max(0, (taskCapSeconds - taskTrackedSeconds - time) * 1000);
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Auto-stop timeout (resume) fired');
        stopTimer();
      }, remainingMs + 500);
    }
  };

  const stopTimer = async () => {
    if (!activeTimeTrack || !activeTimeTrack.id) {
      try {
        const res = await timeTrackService.getActiveTimer();
        if (!res.data || !res.data.id) return;
        setActiveTimeTrack(res.data);
      } catch {
        return;
      }
    }
    setLoading(true);
    try {
      // Capture a final screenshot with activity before stopping
      try {
        const task = tasks.find(t => t.id === activeTimeTrack.task_id);
        const project = projects.find(p => p.id === activeTimeTrack.project_id);
        const taskName = task?.name || task?.title || 'Unknown Task';
        const projectName = project?.name || 'Unknown Project';
        // Only capture if we already have permission, do not prompt user
        await captureNow(activeTimeTrack.task_id, taskName, projectName, { allowPermissionPrompt: false });
      } catch {}

      await timeTrackService.stopTimer(activeTimeTrack.id);
      setIsTracking(false);
      setActiveTimeTrack(null);
      activeTrackIdRef.current = null;
      
      const finalTime = time;
      setTime(0);
      setTaskTimeLimit(0);
      setResumedTime(0);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      if (screenshotListRef.current) {
        clearInterval(screenshotListRef.current);
        screenshotListRef.current = null;
      }
      
      stopScreenshotting();
      // Completely stop the screen sharing stream when stopping timer
      try {
        const { releaseScreenPermission } = require('../services/screenshotService');
        releaseScreenPermission();
      } catch {}
      if (autoStopTimeoutRef.current) { clearTimeout(autoStopTimeoutRef.current); autoStopTimeoutRef.current = null; }
      if (hardStopTimeoutRef.current) { clearTimeout(hardStopTimeoutRef.current); hardStopTimeoutRef.current = null; }
      isStoppingRef.current = false;
      clearTimerState(); // Clear saved state
      
      console.log(`✅ Timer stopped. Final time: ${formatTime(finalTime)}`);
      
      await loadHistory(); // Refresh to get updated today's total
      if (startForm.task_id) {
        await refreshTaskLimitInfo(startForm.task_id); // Refresh weekly cap/tracked for selected task
      }
    } catch (error) {
      console.error('Stop timer error:', error);
    } finally {
      setLoading(false);
    }
  };

  const testScreenshot = async () => {
    if (!startForm.task_id) {
      alert('Please select a task first!');
      return;
    }

    try {
      const selectedTask = tasks.find(t => t.id === parseInt(startForm.task_id));
      const selectedProject = projects.find(p => p.id === parseInt(startForm.project_id)) || selectedTask?.project;
      const taskName = selectedTask?.title || 'test_task';
      const projectName = selectedProject?.name || 'test_project';
      
      // Try screen capture first
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        try {
          console.log('Attempting screen capture for test...');
          
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              mediaSource: 'screen',
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }
          });
          
          const video = document.createElement('video');
          video.srcObject = stream;
          video.autoplay = true;
          video.muted = true;
          
          await new Promise((resolve) => {
            video.onloadedmetadata = resolve;
          });
          
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);
          
          stream.getTracks().forEach(track => track.stop());
          
          // Generate filename
          const now = new Date();
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const year = now.getFullYear();
          
          const cleanProjectName = projectName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          const cleanTaskName = taskName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          const filename = `${cleanProjectName}_${cleanTaskName}_${hours}.${minutes}.${seconds}.${day}.${month}.${year}.png`;
          
          canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('image', blob, filename);
            formData.append('task_id', startForm.task_id);
            formData.append('custom_filename', filename);
            formData.append('project_name', projectName);
            formData.append('task_name', taskName);
            const activityData = activityTracker.getActivityData();
            formData.append('keyboard_clicks', activityData.keyboard_clicks);
            formData.append('mouse_clicks', activityData.mouse_clicks);
            formData.append('activity_percentage', activityData.activity_percentage);
            formData.append('activity_start_time', activityData.activity_start_time);
            formData.append('activity_end_time', activityData.activity_end_time);
            formData.append('minute_breakdown', JSON.stringify(activityData.minute_breakdown));
            
            try {
              const response = await api.post('/screenshots', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
              
              alert(`✅ Screen capture test successful: ${filename}`);
              console.log('Screenshot upload response:', response.data);
              
              const data = await getScreenshots(parseInt(startForm.task_id));
              setScreenshots(data || []);
            } catch (error) {
              console.error('Screenshot upload error:', error);
              alert('❌ Failed to upload screenshot: ' + (error.response?.data?.message || error.message));
            }
          }, 'image/png');
          
          return; // Success with screen capture
          
        } catch (screenError) {
          console.log('Screen capture denied or failed, using page capture...');
          alert('🚫 Screen capture denied. Using page capture instead.');
        }
      }
      
      // Fallback to page capture
      const canvas = await html2canvas(document.body, {
        height: document.body.scrollHeight,
        width: document.body.scrollWidth,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: false,
        scale: 1,
        backgroundColor: '#ffffff'
      });
      
      // Generate filename
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      
      const cleanProjectName = projectName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const cleanTaskName = taskName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const filename = `${cleanProjectName}_${cleanTaskName}_${hours}.${minutes}.${seconds}.${day}.${month}.${year}.png`;
      
      // Convert canvas to blob and upload
      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('image', blob, filename);
        formData.append('task_id', startForm.task_id);
        formData.append('custom_filename', filename);
        formData.append('project_name', projectName);
        formData.append('task_name', taskName);
        const activityData = activityTracker.getActivityData();
        formData.append('keyboard_clicks', activityData.keyboard_clicks);
        formData.append('mouse_clicks', activityData.mouse_clicks);
        formData.append('activity_percentage', activityData.activity_percentage);
        formData.append('activity_start_time', activityData.activity_start_time);
        formData.append('activity_end_time', activityData.activity_end_time);
        formData.append('minute_breakdown', JSON.stringify(activityData.minute_breakdown));
        
        try {
          const response = await api.post('/screenshots', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          alert(`✅ Page capture test successful: ${filename}`);
          console.log('Screenshot upload response:', response.data);
          
          const data = await getScreenshots(parseInt(startForm.task_id));
          setScreenshots(data || []);
        } catch (error) {
          console.error('Screenshot upload error:', error);
          alert('❌ Failed to upload screenshot: ' + (error.response?.data?.message || error.message));
        }
      }, 'image/png');
      
    } catch (error) {
      console.error('Screenshot capture error:', error);
      alert('❌ Failed to capture screenshot: ' + error.message);
    }
  };

  return (
    <div className="time-tracker">
      <ScreenshotNotification 
        isVisible={showNotification}
        onClose={() => setShowNotification(false)}
        taskName={selectedTaskName}
      />
      
      <div className="timer-section">
        <h3>Timer</h3>
        
        {/* Time Statistics */}
        <div className="time-stats" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
          padding: '1rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          color: 'white'
        }}>
          <div className="stat-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>📅 Today Total</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '0.3rem' }}>
              {formatTime(taskTodayTotalTime + ((isTracking && activeTimeTrack?.task_id && String(activeTimeTrack.task_id) === String(startForm.task_id)) ? time : 0))}
            </div>
          </div>
          <div className="stat-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>⏱️ Current</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '0.3rem' }}>
              {formatTime((isTracking && activeTimeTrack?.task_id && String(activeTimeTrack.task_id) === String(startForm.task_id)) ? time : taskTodayTotalTime)}
            </div>
          </div>
          {(taskCapSeconds > 0) && (
            <div className="stat-item" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>🎯 Estimate</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.3rem' }}>
                {`${Math.floor((taskTrackedSeconds + ((isTracking && activeTimeTrack?.task_id && String(activeTimeTrack.task_id) === String(startForm.task_id)) ? time : 0)) / 3600)} / ${Math.floor(taskCapSeconds / 3600)} hours`}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                {Math.min(100, Math.floor(((taskTrackedSeconds + ((isTracking && activeTimeTrack?.task_id && String(activeTimeTrack.task_id) === String(startForm.task_id)) ? time : 0)) / Math.max(1, taskCapSeconds)) * 100))}% used
              </div>
            </div>
          )}
          {resumedTime > 0 && !isTracking && (
            <div className="stat-item" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>🔄 Resume From</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.3rem' }}>
                {formatTime(resumedTime)}
              </div>
            </div>
          )}
        </div>

        <div className="timer-display">
                  <div className="time">{formatTime((isTracking && activeTimeTrack?.task_id && String(activeTimeTrack.task_id) === String(startForm.task_id)) ? time : 0)}</div>
          {false && isTracking && (
            <div className="activity-display">
              <h4>🔍 Real-Time Activity</h4>
              <div className="activity-stats">
                <div className="activity-item">
                  <span className="activity-icon">⌨️</span>
                  <span className="activity-count">{activityStats.keyboard}</span>
                  <span className="activity-label">Keys</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">🖱️</span>
                  <span className="activity-count">{activityStats.mouse}</span>
                  <span className="activity-label">Clicks</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">📊</span>
                  <span className="activity-count">{activityStats.activity.toFixed(1)}%</span>
                  <span className="activity-label">Active</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">⌨️</span>
                  <span className="activity-count">{activityStats.keyboardPerSecond?.toFixed(2) || 0}</span>
                  <span className="activity-label">Keys/sec</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">🖱️</span>
                  <span className="activity-count">{activityStats.mousePerSecond?.toFixed(2) || 0}</span>
                  <span className="activity-label">Clicks/sec</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">🌀</span>
                  <span className="activity-count">{activityStats.movements || 0}</span>
                  <span className="activity-label">Scroll/Move</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">🌀</span>
                  <span className="activity-count">{activityStats.movementsPerSecond?.toFixed(2) || 0}</span>
                  <span className="activity-label">Scroll/sec</span>
                </div>
              </div>
            </div>
          )}
        </div>
        {!isTracking ? (
          <form className="timer-controls" onSubmit={startTimer}>
            <select
              value={startForm.task_id}
              onChange={(e) => {
                const id = e.target.value;
                const t = tasks.find((tt) => String(tt.id) === String(id));

                // Always auto-set project to task's project
                let projectId = startForm.project_id;
                if (t && (t.project?.id || t.project_id)) {
                  projectId = String(t.project?.id || t.project_id);
                }

                setStartForm({ ...startForm, task_id: id, project_id: projectId });

                if (!isTracking) {
                  if (timerRef.current) clearInterval(timerRef.current);
                  setTime(0);
                  setResumedTime(0);
                  clearTimerState();
                  if (autoStopTimeoutRef.current) {
                    clearTimeout(autoStopTimeoutRef.current);
                    autoStopTimeoutRef.current = null;
                  }
                }

                if (id) {
                  fetchRemainingForTask(id)
                    .then((rem) => setTaskTimeLimit(rem))
                    .catch(() => setTaskTimeLimit(getTaskTimeLimit(id)));
                }
              }}
              required
            >
              <option value="">Select Task</option>
              {(
                (() => {
                  const pid = startForm.project_id;
                  let list = pid
                    ? tasks.filter(
                        (t) =>
                          String(t.project?.id) === String(pid) ||
                          String(t.project_id) === String(pid)
                      )
                    : tasks;
                  list = list.filter((t) => (t.status || 'todo') !== 'completed');
                  list = list.filter((t) => {
                    const rem = taskRemainingMap[t.id];
                    if (typeof rem === 'number') return rem > 0;
                    if (t.estimated_hours) return true;
                    return false;
                  });
                  return list;
                })()
              ).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}{t.estimated_hours ? ` (${t.estimated_hours}h limit)` : ''}
                </option>
              ))}
            </select>
            <select
              value={startForm.project_id}
              onChange={(e) => {
                const pid = e.target.value;
                let taskId = startForm.task_id;
                // If currently selected task does not belong to project, clear it
                if (taskId) {
                  const t = tasks.find((tt) => String(tt.id) === String(taskId));
                  const belongs = t && (String(t.project?.id) === String(pid) || String(t.project_id) === String(pid));
                  if (!belongs) {
                    taskId = '';
                    setTaskTimeLimit(0);
                  }
                }
                setStartForm({ ...startForm, project_id: pid, task_id: taskId });

                if (!isTracking) {
                  if (timerRef.current) clearInterval(timerRef.current);
                  setTime(0);
                  setResumedTime(0);
                  clearTimerState();
                  if (autoStopTimeoutRef.current) {
                    clearTimeout(autoStopTimeoutRef.current);
                    autoStopTimeoutRef.current = null;
                  }
                }
              }}
              title="You can override the task's default project or select a different one"
            >
              <option value="">Select Project (optional)</option>
              {projects.map((p) => {
                // Check if this project is the default for the selected task
                const selectedTask = tasks.find(t => String(t.id) === String(startForm.task_id));
                const isTaskDefault = selectedTask && (
                  String(selectedTask.project?.id) === String(p.id) || 
                  String(selectedTask.project_id) === String(p.id)
                );
                
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}{isTaskDefault ? ' (task default)' : ''}
                  </option>
                );
              })}
            </select>
            <input
              type="text"
              placeholder="What are you working on?"
              value={startForm.description}
              onChange={(e) => setStartForm({ ...startForm, description: e.target.value })}
            />
            <button type="submit" disabled={loading || !startForm.task_id}>
              {resumedTime > 0 ? `🔄 Resume from ${formatTime(resumedTime)}` : 'Start'}
            </button>
          </form>
        ) : (
          <div className="timer-controls">
            {isTracking ? (
              <button 
                onClick={pauseTimer} 
                disabled={loading}
                style={{
                  background: 'linear-gradient(45deg, #f39c12, #e67e22)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginRight: '0.5rem'
                }}
              >
                ⏸️ Pause
              </button>
            ) : (
              <button 
                onClick={resumeTimer} 
                disabled={loading}
                style={{
                  background: 'linear-gradient(45deg, #27ae60, #2ecc71)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginRight: '0.5rem'
                }}
              >
                ▶️ Resume
              </button>
            )}
            <button 
              onClick={stopTimer} 
              disabled={loading}
              style={{
                background: 'linear-gradient(45deg, #e74c3c, #c0392b)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              🛑 Stop & Save
            </button>
          </div>
        )}
      </div>

      <div className="history-section">
        <h3>Screenshots {activeTimeTrack?.task_id ? `(Task ID: ${activeTimeTrack.task_id})` : ''}</h3>
        <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <button 
            onClick={testScreenshot}
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(45deg, #667eea, #764ba2)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              marginRight: '0.5rem'
            }}
          >
            🖥️ Test Screen Capture (VS Code, etc.)
          </button>
          {activeTimeTrack?.task_id && (
            <button 
              onClick={async () => {
                try {
                  const data = await getScreenshots(activeTimeTrack.task_id);
                  setScreenshots(data || []);
                  console.log('🔄 Screenshots refreshed:', data?.length || 0);
                  alert(`📸 Found ${data?.length || 0} screenshots for task ${activeTimeTrack.task_id}`);
                } catch (error) {
                  console.error('Error refreshing screenshots:', error);
                  alert('❌ Error loading screenshots: ' + error.message);
                }
              }}
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(45deg, #2ecc71, #27ae60)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600'
              }}
            >
              🔄 Refresh Screenshots
            </button>
          )}
        </div>
        <div className="screenshot-gallery">
          {screenshots.map((s) => (
            <div key={s.id} className="screenshot-card">
              <img
                src={getStorageUrl(s.image_path)}
                alt={`Screenshot ${s.id}`}
                onClick={() => window.open(getStorageUrl(s.image_path), '_blank')}
              />
              <div className="screenshot-info">
                <div style={{ fontWeight: 'bold', color: '#2c3e50', marginBottom: '0.3rem' }}>
                  {s.image_path ? s.image_path.split('/').pop() : `Screenshot ${s.id}`}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>
                  {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
        {screenshots.length === 0 && (
          <div className="no-screenshots">
            📷 No screenshots captured yet. Start the timer to begin automatic screenshot capture!
          </div>
        )}
      </div>

      <div className="history-section">
        <h3>Recent Time Entries</h3>
        <table className="time-table">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Task</th>
              <th>Project</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{h.start_time ? new Date(h.start_time).toLocaleString() : ''}</td>
                <td>{h.end_time ? new Date(h.end_time).toLocaleString() : ''}</td>
                <td>{h.duration_seconds ? formatTime(h.duration_seconds) : (h.end_time ? formatTime((new Date(h.end_time) - new Date(h.start_time)) / 1000) : '')}</td>
                <td>{h.task?.title || ''}</td>
                <td>{h.project?.name || ''}</td>
                <td>{h.description || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimeTracker;
