import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { startScreenshotting, stopScreenshotting, getScreenshots, captureNow } from '../services/screenshotService';
import api, { getStorageUrl } from '../services/api';
import { taskService, timeTrackService } from '../services';

const TaskTrackerPage = () => {
  const { taskId } = useParams();
  const [screenshots, setScreenshots] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [time, setTime] = useState(0);
  const [activeTimeTrack, setActiveTimeTrack] = useState(null);
  const [estimatedHours, setEstimatedHours] = useState(0);
  const [trackedSeconds, setTrackedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [trackedPeriod, setTrackedPeriod] = useState('total');
  const [trackedStart, setTrackedStart] = useState(null);
  const [trackedEnd, setTrackedEnd] = useState(null);
  const [taskName, setTaskName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const [modalScreenshot, setModalScreenshot] = useState(null);
  const timerIntervalRef = useRef(null);
  const screenshotIntervalRef = useRef(null);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        const data = await getScreenshots(taskId);
        setScreenshots(data);
      } catch (error) {
        // console.error('Error fetching screenshots:', error);
      }
    };

    fetchScreenshots();
  }, [taskId]);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const taskRes = await taskService.getTask(taskId);
        const t = taskRes.data;
        // console.log('Task data:', t);
        setEstimatedHours(t.estimated_hours || 0);
        setTaskName(t.title || t.name || 'Unknown Task');
        setProjectName(t.project?.name || 'Unknown Project');
        setDueDate(t.due_date || null);
        try {
          const remRes = await timeTrackService.getRemaining(parseInt(taskId));
          const trackedFromServer = Math.max(0, Number(remRes.data?.tracked_seconds ?? 0));
          const remainingFromServer = Math.max(0, Number(remRes.data?.remaining_seconds ?? 0));
          const periodFromServer = String(remRes.data?.period || 'total');
          setTrackedSeconds(trackedFromServer);
          setRemainingSeconds(remainingFromServer);
          setTrackedPeriod(periodFromServer);
          setTrackedStart(remRes.data?.start || null);
          setTrackedEnd(remRes.data?.end || null);
        } catch {}
      } catch (e) {
        // console.error('Error fetching progress', e);
      }
    };
    fetchProgress();
  }, [taskId]);

  useEffect(() => {
    const fetchActiveTimer = async () => {
        try {
            const response = await api.get('/time-tracks/active');
            if (response.data) {
                setActiveTimeTrack(response.data);
                if (timerIntervalRef.current) {
                    clearInterval(timerIntervalRef.current);
                }
                setTime(0);
            }
        } catch (error) {
            // console.error('Error fetching active timer:', error);
        }
    }

    fetchActiveTimer();
    }, []);
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  }, []);

  const handleStartTracking = async () => {
    try {
        const toast = (title, msg, type = 'warning') => {
          const el = document.createElement('div');
          let bg = '#fff3cd', fg = '#856404', border = '#ffeaa7';
          if (type === 'error') { bg = '#f8d7da'; fg = '#721c24'; border = '#f5c6cb'; }
          if (type === 'success') { bg = '#d4edda'; fg = '#155724'; border = '#c3e6cb'; }
          el.style.cssText = `position:fixed;top:20px;right:20px;background:${bg};color:${fg};padding:12px 14px;border-radius:8px;border:1px solid ${border};z-index:10000;max-width:360px;font-family:system-ui,sans-serif;box-shadow:0 4px 15px rgba(0,0,0,.1)`;
          el.innerHTML = `<strong>${title}</strong><br><small>${msg}</small>`;
          document.body.appendChild(el);
          setTimeout(() => { if (document.body.contains(el)) document.body.removeChild(el); }, 4000);
        };
        if (dueDate) {
          const dd = new Date(dueDate);
          const endOfDay = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23, 59, 59, 999);
          if (new Date() > endOfDay) {
            toast('Due date passed', 'This task is past its due date', 'error');
            return;
          }
        }
        if (estimatedHours && trackedSeconds >= estimatedHours * 3600) {
          toast('Time limit reached', 'This task has reached its time cap', 'warning');
          return;
        }
        // Fetch latest remaining before start
        try {
          const remRes = await timeTrackService.getRemaining(parseInt(taskId));
          const rem = remRes.data?.remaining_seconds ?? 0;
          setRemainingSeconds(rem);
          if (rem <= 0) {
            toast('Time limit reached', 'No remaining time for this task', 'warning');
            return;
          }
        } catch {}
        const response = await api.post('/time-tracks/start', { task_id: taskId });
        setActiveTimeTrack(response.data.time_track);
        startScreenshotting(taskId, taskName || 'Unknown Task', projectName || 'Unknown Project');
        setIsTracking(true);
        // Reset current timer for new task session
        setTime(0);
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
        }
        timerIntervalRef.current = setInterval(() => {
          setTime(prevTime => {
            const next = prevTime + 1;
            if (remainingSeconds > 0 && next >= remainingSeconds) {
              setTimeout(() => handleStopTracking(), 500);
            }
            return next;
          });
        }, 1000);
        const sendHeartbeat = async () => { try { await timeTrackService.heartbeat(); } catch {} };
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        sendHeartbeat();
        heartbeatRef.current = setInterval(sendHeartbeat, 10000);
        if (screenshotIntervalRef.current) {
            clearInterval(screenshotIntervalRef.current);
        }
        const refresh = async () => {
            try {
                const data = await getScreenshots(taskId);
                Array.isArray(data) && setScreenshots(data);
            } catch {}
        };
        await refresh();
        screenshotIntervalRef.current = setInterval(refresh, 60000);
    } catch (error) {
        // console.error('Error starting time tracking:', error);
    }
  };

  const handleStopTracking = async () => {
    try {
        let id = activeTimeTrack?.id;
        if (!id) {
            const response = await api.get('/time-tracks/active');
            id = response.data?.id;
            if (!id) return;
        }
        try {
            await captureNow(parseInt(taskId), taskName || 'Unknown Task', projectName || 'Unknown Project', { allowPermissionPrompt: false });
        } catch {}
        await api.post(`/time-tracks/${id}/stop`);
        stopScreenshotting();
        setIsTracking(false);
        clearInterval(timerIntervalRef.current);
        if (screenshotIntervalRef.current) {
            clearInterval(screenshotIntervalRef.current);
        }
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        setTime(0);
    } catch (error) {
        // console.error('Error stopping time tracking:', error);
    }
  };

  const formatTime = (timeInSeconds) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = timeInSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  const formatHhMm = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };
  const isOverCap = estimatedHours && trackedSeconds >= estimatedHours * 3600;

  return (
    <div className="page-container">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="profile-avatar">{(projectName || 'P').charAt(0).toUpperCase()}</div>
              <div>
                <div className="profile-name">{taskName}</div>
                <div className="profile-email">{projectName} • Task #{taskId}{dueDate ? ` • Due ${new Date(dueDate).toLocaleDateString()}` : ''}</div>
              </div>
            </div>
            {isOverCap && <div className="error-message" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>Time limit reached</div>}
          </div>
        </div>
        <div className="card-body">
          <div className="stat-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="stat-chip">Estimated: {estimatedHours || 0}h</div>
            <div className="stat-chip">Tracked{trackedPeriod === 'week' ? ' (week)' : ''}: {formatHhMm(trackedSeconds)}</div>
            <div className="stat-chip">Remaining: {formatHhMm(Math.max(0, remainingSeconds || 0))}</div>
          </div>
          {trackedPeriod === 'week' && (trackedStart || trackedEnd) && (
            <div style={{ marginTop: 6, color: '#6b7280' }}>
              This week: {trackedStart || '—'} to {trackedEnd || '—'}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body">
          <div className="section-title">Timer</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="timer-display">{formatTime(time)}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {!isTracking ? (
                <button className="btn-primary" onClick={handleStartTracking} disabled={isOverCap}>Start Tracking</button>
              ) : (
                <button className="btn-stop" onClick={handleStopTracking}>Stop Tracking</button>
              )}
              {isTracking && (
                <button className="btn-secondary" onClick={() => captureNow(parseInt(taskId), taskName || 'Unknown Task', projectName || 'Unknown Project')}>
                  Capture Now
                </button>
              )}
            </div>
          </div>
          <div style={{ marginTop: 8, color: '#6b7280' }}>Screenshots: first at 1 min, then every 10 min</div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="section-title">Screenshots</div>
          <div className="grid">
            {screenshots.map((screenshot) => (
              <div key={screenshot.id} className="screenshot-card">
                <img
                  className="screenshot-img"
                  src={getStorageUrl(screenshot.image_path)}
                  alt={`Screenshot ${screenshot.id}`}
                />
                <div className="screenshot-meta">
                  <div className="stat-chip">Mouse: {screenshot.mouse_clicks ?? 0}</div>
                  <div className="stat-chip">Keys: {screenshot.keyboard_clicks ?? 0}</div>
                  <div className="stat-chip">{new Date(screenshot.created_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => setModalScreenshot(screenshot)}
                  >
                    Show Activity
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalScreenshot && (
        <div className="modal-overlay" onClick={() => setModalScreenshot(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>Activity Breakdown</h3>
              <button className="modal-close" onClick={() => setModalScreenshot(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="screenshot-meta" style={{ marginBottom: '1rem' }}>
                <div className="stat-chip">Total Keys: {modalScreenshot.keyboard_clicks ?? 0}</div>
                <div className="stat-chip">Total Clicks: {modalScreenshot.mouse_clicks ?? 0}</div>
                <div className="stat-chip">Time: {new Date(modalScreenshot.created_at).toLocaleString()}</div>
              </div>
              
              {Array.isArray(modalScreenshot.minute_breakdown) && modalScreenshot.minute_breakdown.length > 0 ? (
                <div className="activity-list">
                  <div className="section-title" style={{ marginBottom: 6 }}>Minute-by-Minute Activity</div>
                  {modalScreenshot.minute_breakdown.map((m, idx) => (
                    <div key={idx} className="activity-item">
                      <span className="activity-time">{m.time}</span>
                      <span className="activity-stats">Keys {m.keyboard_clicks || 0} • Clicks {m.mouse_clicks || 0} • Moves {m.mouse_movements || 0}</span>
                      {m.url ? (
                        <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                          <a className="activity-link" href={m.url} target="_blank" rel="noreferrer" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.title || m.url}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                  No detailed activity data available for this screenshot.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setModalScreenshot(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskTrackerPage;
