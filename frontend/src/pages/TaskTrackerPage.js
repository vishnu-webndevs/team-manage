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
  const [expandedId, setExpandedId] = useState(null);
  const [taskName, setTaskName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const timerIntervalRef = useRef(null);
  const screenshotIntervalRef = useRef(null);

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        const data = await getScreenshots(taskId);
        setScreenshots(data);
      } catch (error) {
        console.error('Error fetching screenshots:', error);
      }
    };

    fetchScreenshots();
  }, [taskId]);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const taskRes = await taskService.getTask(taskId);
        const t = taskRes.data;
        console.log('Task data:', t);
        setEstimatedHours(t.estimated_hours || 0);
        setTaskName(t.title || t.name || 'Unknown Task');
        setProjectName(t.project?.name || 'Unknown Project');
        setDueDate(t.due_date || null);
        const ttRes = await timeTrackService.getTimeTracks({ task_id: taskId });
        const list = ttRes.data?.data || [];
        const sum = list.reduce((acc, it) => acc + (it.duration_seconds || 0), 0);
        setTrackedSeconds(sum);
        try {
          const remRes = await timeTrackService.getRemaining(parseInt(taskId));
          setRemainingSeconds(remRes.data?.remaining_seconds ?? 0);
        } catch {}
      } catch (e) {
        console.error('Error fetching progress', e);
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
            console.error('Error fetching active timer:', error);
        }
    }

    fetchActiveTimer();
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
        console.error('Error starting time tracking:', error);
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
        setTime(0);
    } catch (error) {
        console.error('Error stopping time tracking:', error);
    }
  };

  const formatTime = (timeInSeconds) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = timeInSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div>
      <h1>Task Screen Tracker</h1>
      <p>Task ID: {taskId}</p>
      <p>
        Tracked: {Math.floor(trackedSeconds / 3600)}h {Math.floor((trackedSeconds % 3600) / 60)}m
        {estimatedHours ? ` / ${estimatedHours}h` : ''}
      </p>
      <div>
        <p>Time: {formatTime(time)}</p>
        {!isTracking ? (
          <button onClick={handleStartTracking} disabled={estimatedHours && trackedSeconds >= estimatedHours * 3600}>Start Tracking</button>
        ) : (
          <button onClick={handleStopTracking}>Stop Tracking</button>
        )}
      </div>
      <div>
        <h2>Screenshots</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {screenshots.map((screenshot) => (
            <div key={screenshot.id} style={{ margin: '10px' }}>
              <img
                src={getStorageUrl(screenshot.image_path)}
                alt={`Screenshot ${screenshot.id}`}
                style={{ width: '200px', height: 'auto', border: '1px solid #ccc' }}
              />
              <p>Mouse: {screenshot.mouse_clicks ?? 0}</p>
              <p>Keyboard: {screenshot.keyboard_clicks ?? 0}</p>
              <p>{new Date(screenshot.created_at).toLocaleString()}</p>
              <button onClick={() => setExpandedId(expandedId === screenshot.id ? null : screenshot.id)}>
                {expandedId === screenshot.id ? 'Hide Activity' : 'Show Activity'}
              </button>
              {expandedId === screenshot.id && Array.isArray(screenshot.minute_breakdown) && (
                <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                  <div style={{ fontWeight: 600 }}>Minute Activity</div>
                  {screenshot.minute_breakdown.map((m, idx) => (
                    <div key={idx} style={{ fontSize: '0.9rem', margin: '4px 0' }}>
                      <span>{m.time} — </span>
                      <span>Keys: {m.keyboard_clicks || 0}, Clicks: {m.mouse_clicks || 0}, Moves: {m.mouse_movements || 0}</span>
                      {m.url ? (
                        <span> — <a href={m.url} target="_blank" rel="noreferrer">{m.title || m.url}</a></span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TaskTrackerPage;
