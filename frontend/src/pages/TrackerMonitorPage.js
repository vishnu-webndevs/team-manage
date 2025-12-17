import React, { useEffect, useMemo, useState } from 'react';
import api, { getStorageUrl } from '../services/api';
import activityTracker from '../services/activityTracker';
import { projectService, taskService, timeTrackService, screenshotService, activityService } from '../services';
import '../styles/trackermonitor.css';

const TrackerMonitorPage = () => {
  const [tracks, setTracks] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('time-tracks');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [testingActivity, setTestingActivity] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [period, setPeriod] = useState('day');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          projectService.getProjects(),
          taskService.getTasks(),
        ]);
        setProjects(pRes.data?.data || []);
        setTasks(tRes.data?.data || []);
      } catch (e) {
        console.error('Failed to load projects/tasks', e);
      }
    };
    loadMeta();
  }, []);

  useEffect(() => {
    let pollId = null;
    if (activeTab === 'sessions') {
      pollId = setInterval(() => {
        loadData();
      }, 30000);
    }
    return () => {
      if (pollId) clearInterval(pollId);
    };
  }, [activeTab, period, selectedProjectId, selectedTaskId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedProjectId) params.project_id = selectedProjectId;
      if (selectedTaskId) params.task_id = selectedTaskId;
      const [tracksRes, screenshotsRes, sessionsRes] = await Promise.all([
        timeTrackService.getTimeTracks(params),
        screenshotService.getAllScreenshots({ period, task_id: selectedTaskId || undefined }),
        activityService.getSessions({ period, task_id: selectedTaskId || undefined })
      ]);
      
      setTracks(tracksRes.data.data || []);
      const shotsPayload = screenshotsRes.data;
      const shots = (shotsPayload?.data) || (Array.isArray(shotsPayload) ? shotsPayload : []);
      setScreenshots(shots);
      setSessions((sessionsRes.data?.data) || (Array.isArray(sessionsRes.data) ? sessionsRes.data : []));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const testActivityTracking = () => {
    if (testingActivity) {
      activityTracker.stopTracking();
      setTestingActivity(false);
      
      const stats = activityTracker.getFormattedStats();
      alert(`🎯 Activity Test Results:
⌨️ Keyboard: ${stats.keyboard_clicks} clicks
🖱️ Mouse: ${stats.mouse_clicks} clicks  
📊 Activity: ${stats.activity_percentage}% (${stats.activityLevel})
⏱️ Duration: ${stats.duration_minutes.toFixed(1)} minutes

💡 Try typing and clicking around, then stop the test to see results!`);
    } else {
      activityTracker.startTracking();
      setTestingActivity(true);
      alert('🚀 Activity tracking test started! Type some text and click around, then press the button again to see results.');
    }
  };

  const formatDuration = (seconds) => {
    const s = Math.max(0, Number(seconds) || 0);
    if (!s) return '0h 0m';
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getActivityLevel = (percentage) => {
    if (percentage >= 80) return { level: 'Very High', color: '#27ae60', textColor: '#1f2937' };
    if (percentage >= 60) return { level: 'High', color: '#2ecc71', textColor: '#1f2937' };
    if (percentage >= 40) return { level: 'Medium', color: '#f39c12', textColor: '#1f2937' };
    if (percentage >= 20) return { level: 'Low', color: '#e67e22', textColor: '#1f2937' };
    return { level: 'Very Low', color: '#e74c3c', textColor: '#1f2937' };
  };

  const getTaskScreenshots = (taskId) => {
    return screenshots.filter(s => s.task_id === taskId);
  };

  const computeScreenshotTotals = (s) => {
    let k = Math.max(0, Number(s?.keyboard_clicks ?? 0));
    let m = Math.max(0, Number(s?.mouse_clicks ?? 0));
    let mv = 0;
    try {
      const mb = Array.isArray(s?.minute_breakdown) ? s.minute_breakdown : 
                 (typeof s?.minute_breakdown === 'string' ? JSON.parse(s.minute_breakdown) : []);
      if (Array.isArray(mb) && mb.length > 0) {
        const kbSum = mb.reduce((sum, b) => sum + (Number(b?.keyboard_clicks ?? 0) || 0), 0);
        const msSum = mb.reduce((sum, b) => sum + (Number(b?.mouse_clicks ?? 0) || 0), 0);
        const mvSum = mb.reduce((sum, b) => sum + (Number(b?.mouse_movements ?? 0) || 0), 0);
        if (kbSum > 0) k = kbSum;
        if (msSum > 0) m = msSum;
        mv = mvSum;
      }
    } catch (e) {}
    return { keyboard: k, mouse: m, movements: mv };
  };

  const computeSessionTotals = (session) => {
    let k = Math.max(0, Number(session?.keyboard_clicks ?? 0));
    let m = Math.max(0, Number(session?.mouse_clicks ?? 0));
    
    // If we have direct counts, use them (unless they are 0 and we suspect they shouldn't be)
    // But for sessions, 0 might be real. However, if we want to fallback to screenshots:
    if (k > 0 || m > 0) return { keyboard: k, mouse: m };

    // Fallback: try to sum up screenshots that fall within this session's time range
    try {
      const start = new Date(session.start_time).getTime();
      const end = new Date(session.end_time).getTime();
      
      const shots = screenshots.filter((s) => {
        if (String(s.task_id) !== String(session.task_id)) return false;
        const ct = s.created_at ? new Date(s.created_at).getTime() : 0;
        return Number.isFinite(ct) && Number.isFinite(start) && Number.isFinite(end) && ct >= start && ct <= end;
      });

      const totals = shots.reduce((acc, s) => {
        const t = computeScreenshotTotals(s);
        acc.k += t.keyboard;
        acc.m += t.mouse;
        return acc;
      }, { k: 0, m: 0 });

      // Only override if we found data in screenshots
      k = Math.max(k, totals.k);
      m = Math.max(m, totals.m);
    } catch (e) {
      // ignore
    }
    return { keyboard: k, mouse: m };
  };

  const calculateTaskActivityStats = (taskId) => {
    const taskScreenshots = getTaskScreenshots(taskId);
    if (taskScreenshots.length === 0) return null;

    const totalKeyboard = taskScreenshots.reduce((sum, s) => {
      const totals = computeScreenshotTotals(s);
      return sum + totals.keyboard;
    }, 0);
    const totalMouse = taskScreenshots.reduce((sum, s) => {
      const totals = computeScreenshotTotals(s);
      return sum + totals.mouse;
    }, 0);
    const avgActivityRaw = taskScreenshots.reduce((sum, s) => {
      const v = Number(s.activity_percentage ?? 0);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0) / taskScreenshots.length;
    const avgActivity = Number.isFinite(avgActivityRaw) ? Math.round(avgActivityRaw * 10) / 10 : 0;

    return {
      totalKeyboard,
      totalMouse,
      avgActivity,
      screenshotCount: taskScreenshots.length
    };
  };

  if (loading) {
    return (
      <div className="tracker-monitor">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading tracker data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tracker-monitor">
      <div className="monitor-header">
        <h2>📊 Tracker Monitor</h2>
        <p>Monitor time tracking activities and user productivity</p>
        <div className="filters" style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              const pid = e.target.value;
              setSelectedProjectId(pid);
              if (selectedTaskId) {
                const t = tasks.find(tt => String(tt.id) === String(selectedTaskId));
                const belongs = t && (String(t.project?.id) === String(pid) || String(t.project_id) === String(pid));
                if (!belongs) setSelectedTaskId('');
              }
            }}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}>
            <option value="">All Tasks</option>
            {(
              (() => {
                const pid = selectedProjectId;
                const list = pid
                  ? tasks.filter(
                      (t) =>
                        String(t.project?.id) === String(pid) ||
                        String(t.project_id) === String(pid)
                    )
                  : tasks;
                return list;
              })()
            ).map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <button onClick={loadData} style={{ padding: '0.4rem 0.8rem' }}>Apply</button>
          <button onClick={() => exportScreenshotsCsv(screenshots)} style={{ padding: '0.4rem 0.8rem' }}>Export Screenshots CSV</button>
          <button onClick={() => exportTracksCsv(tracks)} style={{ padding: '0.4rem 0.8rem' }}>Export Tracks CSV</button>
          <button onClick={() => exportSessionsCsv(sessions)} style={{ padding: '0.4rem 0.8rem' }}>Export Sessions CSV</button>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button 
            onClick={testActivityTracking}
            style={{
              background: testingActivity ? 
                'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' : 
                'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)',
              color: 'white',
              border: 'none',
              padding: '0.8rem 1.5rem',
              borderRadius: '25px',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: testingActivity ? 
                '0 4px 15px rgba(231, 76, 60, 0.3)' : 
                '0 4px 15px rgba(39, 174, 96, 0.3)'
            }}
          >
            {testingActivity ? '🛑 Stop Activity Test' : '🧪 Test Activity Tracking'}
          </button>
          <button 
            onClick={loadData}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              padding: '0.8rem 1.5rem',
              borderRadius: '25px',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              marginLeft: '1rem',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
            }}
          >
            🔄 Refresh Data
          </button>
        </div>
      </div>

      <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'time-tracks' ? 'active' : ''}`}
          onClick={() => setActiveTab('time-tracks')}
        >
          ⏱️ Time Tracks
        </button>
        <button 
          className={`tab-button ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          📈 Activity Data
        </button>
        <button 
          className={`tab-button ${activeTab === 'screenshots' ? 'active' : ''}`}
          onClick={() => setActiveTab('screenshots')}
        >
          📸 Screenshots
        </button>
        <button 
          className={`tab-button ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          🪟 Sessions
        </button>
      </div>

      {activeTab === 'time-tracks' && (
        <div className="tab-content">
          <div className="stats-summary">
            <div className="stat-card">
              <h3>📋 Total Tracks</h3>
              <div className="stat-value">{tracks.length}</div>
            </div>
            <div className="stat-card">
              <h3>✅ Active Tracks</h3>
              <div className="stat-value">{tracks.filter(t => !t.end_time).length}</div>
            </div>
            <div className="stat-card">
              <h3>⏱️ Total Hours</h3>
              <div className="stat-value">
                {Math.round(tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0) / 3600 * 10) / 10}h
              </div>
            </div>
          </div>

          <div className="tracks-table-container">
            <table className="tracks-table">
              <thead>
                <tr>
                  <th>👤 User</th>
                  <th>📂 Project</th>
                  <th>📋 Task</th>
                  <th>⏰ Start Time</th>
                  <th>🏁 End Time</th>
                  <th>⏱️ Duration</th>
                  <th>📊 Activity</th>
                  <th>🔍 Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map(track => {
                  const activityStats = calculateTaskActivityStats(track.task_id);
                  return (
                    <tr key={track.id} className={!track.end_time ? 'active-track' : ''}>
                      <td>
                        <div className="user-info">
                          <strong>{track.user?.name || '-'}</strong>
                        </div>
                      </td>
                      <td>{track.project?.name || '-'}</td>
                      <td>{track.task?.title || '-'}</td>
                      <td>{track.start_time ? new Date(track.start_time).toLocaleString() : '-'}</td>
                      <td>
                        {track.end_time ? (
                          new Date(track.end_time).toLocaleString()
                        ) : (
                          <span className="status-badge active">🟢 ACTIVE</span>
                        )}
                      </td>
                      <td>{formatDuration(track.duration_seconds)}</td>
                      <td>
                        {activityStats ? (
                          <div className="activity-summary">
                            <div className="activity-item">
                              <span>⌨️ {activityStats.totalKeyboard}</span>
                            </div>
                            <div className="activity-item">
                              <span>🖱️ {activityStats.totalMouse}</span>
                            </div>
                            {(() => {
                              const safeAvg = Number.isFinite(activityStats.avgActivity) ? activityStats.avgActivity : 0;
                              const level = getActivityLevel(safeAvg);
                              return (
                                <div className="activity-level" style={{ color: level.textColor }}>
                                  {safeAvg}% {level.level}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="no-data">No data</span>
                        )}
                      </td>
                      <td>
                        <button 
                          className="action-button"
                          onClick={() => setSelectedTrack(track)}
                        >
                          👁️ View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="tab-content">
          <div className="activity-overview">
            <h3>📈 Activity Overview</h3>
            <div className="activity-grid">
              {(() => {
                const uniqueTasks = [];
                const seenTaskIds = new Set();
                
                tracks.forEach(track => {
                  if (track.task_id && !seenTaskIds.has(track.task_id)) {
                    seenTaskIds.add(track.task_id);
                    uniqueTasks.push(track);
                  }
                });

                return uniqueTasks.map(track => {
                  const activityStats = calculateTaskActivityStats(track.task_id);
                  if (!activityStats) return null;
                  
                  return (
                    <div key={track.task_id} className="activity-card">
                      <div className="activity-header">
                        <h4>{track.task?.title || 'Unknown Task'}</h4>
                        <span className="user-badge">{track.user?.name}</span>
                      </div>
                    <div className="activity-stats-grid">
                      <div className="stat">
                        <span className="stat-icon">⌨️</span>
                        <div>
                          <div className="stat-value">{activityStats.totalKeyboard}</div>
                          <div className="stat-label">Keyboard Clicks</div>
                        </div>
                      </div>
                      <div className="stat">
                        <span className="stat-icon">🖱️</span>
                        <div>
                          <div className="stat-value">{activityStats.totalMouse}</div>
                          <div className="stat-label">Mouse Clicks</div>
                        </div>
                      </div>
                      <div className="stat">
                        <span className="stat-icon">📊</span>
                        <div>
                          <div className="stat-value">{activityStats.avgActivity}%</div>
                          <div className="stat-label">Avg Activity</div>
                        </div>
                      </div>
                      <div className="stat">
                        <span className="stat-icon">📸</span>
                        <div>
                          <div className="stat-value">{activityStats.screenshotCount}</div>
                          <div className="stat-label">Screenshots</div>
                        </div>
                      </div>
                    </div>
                    <div className="activity-level-indicator">
                      <div 
                        className="activity-bar"
                        style={{
                          width: `${Math.min(activityStats.avgActivity, 100)}%`,
                          backgroundColor: getActivityLevel(activityStats.avgActivity).color
                        }}
                      ></div>
                      <span className="activity-level-text">
                        {getActivityLevel(activityStats.avgActivity).level}
                      </span>
                    </div>
                  </div>
                );
              }).filter(Boolean);
            })()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'screenshots' && (
        <div className="tab-content">
          <div className="screenshots-overview">
            <h3>📸 Recent Screenshots</h3>
            <div className="screenshots-grid">
              {screenshots.slice(0, 20).map(screenshot => (
                <div key={screenshot.id} className="screenshot-card">
                  <div className="screenshot-image">
                    <img 
                      src={getStorageUrl(screenshot.image_path)}
                      alt="Screenshot"
                      onClick={() => window.open(getStorageUrl(screenshot.image_path), '_blank')}
                    />
                  </div>
                  <div className="screenshot-info">
                    <div className="screenshot-meta">
                      <strong>{screenshot.task?.title || 'Unknown Task'}</strong>
                      <span className="timestamp">{new Date(screenshot.created_at).toLocaleString()}</span>
                    </div>
                  <div className="activity-data">
                    {(() => {
                      const totals = computeScreenshotTotals(screenshot);
                      return (
                        <>
                          <span className="activity-item">⌨️ {totals.keyboard}</span>
                          <span className="activity-item">🖱️ {totals.mouse}</span>
                          <span className="activity-item">🌀 {totals.movements}</span>
                          <span className="activity-item">📊 {Number(screenshot.activity_percentage ?? 0).toFixed(1)}%</span>
                        </>
                      );
                    })()}
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="tab-content">
          <div className="screenshots-overview">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3>🪟 Activity Sessions</h3>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                ℹ️ Note: Web tracker records URLs for this tab only. External activity is logged as "System/External".
              </div>
            </div>
            
            <div className="session-list">
              {sessions.length === 0 && (
                <div className="no-data-placeholder">
                  No sessions yet. Activity will appear here as you work.
                </div>
              )}
              {sessions.slice(0, 100).map(session => {
                 const isExternal = (session.window_title && session.window_title.includes('External')) || (session.url && session.url.includes('System'));
                 const icon = isExternal ? '🖥️' : '🌐';
                 const sessionTotals = computeSessionTotals(session);
                 
                 return (
                  <div key={session.id} className="session-item">
                    <div className="session-main">
                      <div className="session-title">
                        <span className="app-icon">{icon}</span>
                        {session.window_title || session.app_name || 'Unknown Activity'}
                      </div>
                      {session.url && (
                        <a href={session.url} target="_blank" rel="noopener noreferrer" className="session-link">
                          {session.url}
                        </a>
                      )}
                      <div className="session-stats-row">
                         <span className="session-stat">⌨️ {sessionTotals.keyboard} keys</span>
                         <span className="session-stat">🖱️ {sessionTotals.mouse} clicks</span>
                      </div>
                    </div>
                    <div className="session-meta">
                      <span className="session-duration">⏱️ {formatDuration(session.duration_seconds)}</span>
                      <span className="session-time">
                        {new Date(session.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                        {new Date(session.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

     
      {/* Track Detail Modal */}
      {selectedTrack && (
        <div className="modal-overlay" onClick={() => setSelectedTrack(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Track Details</h3>
              <button className="close-button" onClick={() => setSelectedTrack(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="track-details">
                <div className="detail-row">
                  <strong>User:</strong> {selectedTrack.user?.name || '-'}
                </div>
                <div className="detail-row">
                  <strong>Project:</strong> {selectedTrack.project?.name || '-'}
                </div>
                <div className="detail-row">
                  <strong>Task:</strong> {selectedTrack.task?.title || '-'}
                </div>
                <div className="detail-row">
                  <strong>Duration:</strong> {formatDuration(selectedTrack.duration_seconds)}
                </div>
                <div className="detail-row">
                  <strong>Description:</strong> {selectedTrack.description || '-'}
                </div>
              </div>
              
              {(() => {
                const taskScreenshots = getTaskScreenshots(selectedTrack.task_id);
                return (
                  <div className="track-screenshots">
                    <h4>📸 Screenshots ({taskScreenshots.length})</h4>
                    <div className="screenshot-timeline">
                      {taskScreenshots.map(screenshot => (
                        <div key={screenshot.id} className="timeline-item">
                          <div className="timeline-image">
                            <img 
                              src={getStorageUrl(screenshot.image_path)}
                              alt="Screenshot"
                              onClick={() => window.open(getStorageUrl(screenshot.image_path), '_blank')}
                            />
                          </div>
                          <div className="timeline-info">
                            <div className="time">{new Date(screenshot.created_at).toLocaleString()}</div>
                            <div className="activity-stats">
                              {(() => {
                                const totals = computeScreenshotTotals(screenshot);
                                return (
                                  <>
                                    <span>⌨️ {totals.keyboard}</span>
                                    <span>🖱️ {totals.mouse}</span>
                                    <span>🌀 {totals.movements}</span>
                                    <span>📊 {Number(screenshot.activity_percentage ?? 0).toFixed(1)}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackerMonitorPage;

function toCsv(rows, headers) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    const needsQuotes = s.includes(',') || s.includes('\n') || s.includes('"');
    const esc = s.replace(/"/g, '""');
    return needsQuotes ? `"${esc}"` : esc;
  };
  const head = headers.map(h => escape(h.label)).join(',');
  const body = rows.map(r => headers.map(h => escape(h.get(r))).join(',')).join('\n');
  return `${head}\n${body}`;
}

function downloadCsv(name, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportTracksCsv(tracks) {
  const headers = [
    { label: 'User', get: r => r.user?.name || '' },
    { label: 'Project', get: r => r.project?.name || '' },
    { label: 'Task', get: r => r.task?.title || '' },
    { label: 'Start', get: r => r.start_time ? new Date(r.start_time).toLocaleString() : '' },
    { label: 'End', get: r => r.end_time ? new Date(r.end_time).toLocaleString() : '' },
    { label: 'DurationSeconds', get: r => r.duration_seconds || 0 },
  ];
  const csv = toCsv(tracks, headers);
  downloadCsv(`time-tracks-${Date.now()}.csv`, csv);
}

function exportScreenshotsCsv(shots) {
  const headers = [
    { label: 'User', get: r => r.user?.name || '' },
    { label: 'Task', get: r => r.task?.title || '' },
    { label: 'CreatedAt', get: r => r.created_at ? new Date(r.created_at).toLocaleString() : '' },
    { label: 'KeyboardClicks', get: r => r.keyboard_clicks || 0 },
    { label: 'MouseClicks', get: r => r.mouse_clicks || 0 },
    { label: 'ActivityPercent', get: r => r.activity_percentage || 0 },
    { label: 'ImagePath', get: r => r.image_path || '' },
    { label: 'FirstMinuteURL', get: r => Array.isArray(r.minute_breakdown) && r.minute_breakdown[0]?.url ? r.minute_breakdown[0].url : '' },
    { label: 'FirstMinuteTitle', get: r => Array.isArray(r.minute_breakdown) && r.minute_breakdown[0]?.title ? r.minute_breakdown[0].title : '' },
  ];
  const csv = toCsv(shots, headers);
  downloadCsv(`screenshots-${Date.now()}.csv`, csv);
}

function exportSessionsCsv(sessions) {
  const headers = [
    { label: 'User', get: r => r.user?.name || '' },
    { label: 'Task', get: r => r.task?.title || '' },
    { label: 'Project', get: r => r.project?.name || '' },
    { label: 'App', get: r => r.app_name || '' },
    { label: 'WindowTitle', get: r => r.window_title || '' },
    { label: 'URL', get: r => r.url || '' },
    { label: 'Start', get: r => r.start_time ? new Date(r.start_time).toLocaleString() : '' },
    { label: 'End', get: r => r.end_time ? new Date(r.end_time).toLocaleString() : '' },
    { label: 'DurationSeconds', get: r => r.duration_seconds || 0 },
  ];
  const csv = toCsv(sessions, headers);
  downloadCsv(`sessions-${Date.now()}.csv`, csv);
}
