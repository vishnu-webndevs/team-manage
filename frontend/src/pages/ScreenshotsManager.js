import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getAllScreenshots, getUserScreenshots, deleteScreenshot } from '../services/screenshotService';
import { taskService, authService } from '../services';
import api, { getStorageUrl } from '../services/api';
import '../styles/screenshotsmanager.css';

const ScreenshotsManager = () => {
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    period: 'day',
    user_id: '',
    task_id: ''
  });
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);

  // Check user role on component mount
  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const user = await authService.getCurrentUser();
        const roles = user.roles || [];
        const isAdminOrManager = roles.some(role => 
          role.name === 'admin' || role.name === 'project_manager'
        );
        setIsAdmin(isAdminOrManager);
        setUserRole(isAdminOrManager ? 'admin' : 'employee');
      } catch (error) {
        // console.error('Error checking user role:', error);
        setUserRole('employee');
        setIsAdmin(false);
      }
    };

    checkUserRole();
  }, []);

  // Load supporting data (tasks for all, users list via endpoint)
  useEffect(() => {
    loadSupportingData();
  }, [isAdmin]);

  // Load screenshots when filters or page changes
  useEffect(() => {
    if (userRole) {
      loadScreenshots();
    }
  }, [filters, currentPage, userRole]); // Added userRole check and loadScreenshots dependency

  const loadSupportingData = async () => {
    try {
      const [tasksRes, usersRes] = await Promise.all([
        isAdmin ? taskService.getTasks() : taskService.getTasks({ assigned_to: 'me' }), // Load only assigned tasks for employees
        api.get('/users') // Load users from new endpoint
      ]);
      setTasks(tasksRes.data.data || []);
      setUsers(usersRes.data.data || []);
    } catch (error) {
      // console.error('Error loading supporting data:', error);
      setTasks([]);
      setUsers([]);
    }
  };

  const loadScreenshots = async () => {
    if (!userRole) return; // Wait for role to be determined
    
    setLoading(true);
    try {
      let response;
      
      if (isAdmin) {
        response = await getAllScreenshots(filters, currentPage);
      } else {
        response = await getUserScreenshots(filters, currentPage);
      }
      
      setScreenshots(response.data || []);
      setCurrentPage(response.current_page || 1);
      setTotalPages(response.last_page || 1);
    } catch (error) {
      // console.error('Error loading screenshots:', error);
      setScreenshots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getActivityClass = (percentage) => {
    if (percentage >= 80) return 'activity-very-high';
    if (percentage >= 60) return 'activity-high';
    if (percentage >= 40) return 'activity-medium';
    if (percentage >= 20) return 'activity-low';
    return 'activity-very-low';
  };

  const getActivityLabel = (percentage) => {
    if (percentage >= 80) return 'Very High';
    if (percentage >= 60) return 'High';
    if (percentage >= 40) return 'Medium';
    if (percentage >= 20) return 'Low';
    return 'Very Low';
  };

  const handleDelete = async (screenshotId) => {
    if (!window.confirm('Are you sure you want to delete this screenshot?')) return;
    
    try {
      await deleteScreenshot(screenshotId);
      closeModal();
      loadScreenshots(); 
    } catch (error) {
      // console.error('Failed to delete screenshot:', error);
      alert('Failed to delete screenshot');
    }
  };

  const openModal = (screenshot) => {
    setSelectedScreenshot(screenshot);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedScreenshot(null);
  };

  const renderFilterControls = () => (
    <div className="filters-section">
      <h3>📊 {isAdmin ? 'All Screenshots' : 'My Screenshots'}</h3>
      
      <div className="filters-grid">
        {/* Date Period Filter */}
        <div className="filter-group">
          <label>📅 Time Period:</label>
          <select
            value={filters.period}
            onChange={(e) => handleFilterChange('period', e.target.value)}
          >
            <option value="">All Time</option>
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        {/* Task Filter */}
        <div className="filter-group">
          <label>📋 Task:</label>
          <select
            value={filters.task_id}
            onChange={(e) => handleFilterChange('task_id', e.target.value)}
          >
            <option value="">{isAdmin ? 'All Tasks' : 'My Tasks'}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </div>

        {/* User Filter (All roles, but limited options for employees) */}
        <div className="filter-group">
          <label>👤 User:</label>
          <select
            value={filters.user_id}
            onChange={(e) => handleFilterChange('user_id', e.target.value)}
          >
            <option value="">{isAdmin ? 'All Users' : 'My Screenshots'}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}{!isAdmin ? ' (Me)' : ''}
              </option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <button 
            onClick={() => loadScreenshots()}
            className="refresh-btn"
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    </div>
  );

  const computeTotals = (s) => {
    let k = Math.max(0, Number(s?.keyboard_clicks ?? 0));
    let m = Math.max(0, Number(s?.mouse_clicks ?? 0));
    try {
      const mb = Array.isArray(s?.minute_breakdown) ? s.minute_breakdown : [];
      if (mb.length > 0) {
        const kbSum = mb.reduce((sum, b) => sum + (Number(b?.keyboard_clicks ?? 0) || 0), 0);
        const msSum = mb.reduce((sum, b) => sum + (Number(b?.mouse_clicks ?? 0) || 0), 0);
        if (kbSum > 0) k = kbSum;
        if (msSum > 0) m = msSum;
      }
    } catch (e) {}
    return { keyboard: k, mouse: m };
  };

  const renderScreenshotCard = (screenshot) => {
    const totals = computeTotals(screenshot);
    return (
    <div key={screenshot.id} className="screenshot-card">
      <div className="screenshot-image">
        <img
          src={getStorageUrl(screenshot.image_path)}
          alt={`Screenshot ${screenshot.id}`}
          onClick={() => openModal(screenshot)}
          loading="lazy"
        />
      </div>
      
      <div className="screenshot-info">
        <div className="screenshot-header">
          <strong className="screenshot-filename">
            {screenshot.image_path ? screenshot.image_path.split('/').pop() : `Screenshot ${screenshot.id}`}
          </strong>
          <span className="screenshot-date">
            {formatDate(screenshot.created_at)}
          </span>
        </div>
        
        <div className="screenshot-details">
          {screenshot.user && (
            <div className="detail-item">
              <span className="detail-label">👤 User:</span>
              <span className="detail-value">{screenshot.user.name}</span>
            </div>
          )}
          
          {screenshot.task && (
            <div className="detail-item">
              <span className="detail-label">📋 Task:</span>
              <span className="detail-value">{screenshot.task.title}</span>
            </div>
          )}
          
          {screenshot.task?.project && (
            <div className="detail-item">
              <span className="detail-label">📁 Project:</span>
              <span className="detail-value">{screenshot.task.project.name}</span>
            </div>
          )}
          
          {/* Activity Data */}
          <div className="detail-item activity-data">
            <span className="detail-label">⌨️ Keyboard:</span>
            <span className="detail-value">{totals.keyboard} clicks</span>
          </div>
          
          <div className="detail-item activity-data">
            <span className="detail-label">🖱️ Mouse:</span>
            <span className="detail-value">{totals.mouse} clicks</span>
          </div>
          
          {Array.isArray(screenshot.minute_breakdown) && screenshot.minute_breakdown.length > 0 && (
            <div className="detail-item activity-data">
              <span className="detail-label">🌀 Scroll/Movement:</span>
              <span className="detail-value">
                {screenshot.minute_breakdown.reduce((sum, m) => sum + (Number(m?.mouse_movements ?? 0) || 0), 0)}
              </span>
            </div>
          )}
          
          {screenshot.activity_percentage !== undefined && (
            <div className="detail-item activity-data">
              <span className="detail-label">📊 Activity:</span>
              <span className={`detail-value activity-level ${getActivityClass(screenshot.activity_percentage)}`}>
                {screenshot.activity_percentage}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => setCurrentPage(i)}
          className={`page-btn ${currentPage === i ? 'active' : ''}`}
        >
          {i}
        </button>
      );
    }

    return (
      <div className="pagination">
        <button
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
          className="page-btn"
        >
          ← Prev
        </button>
        {pages}
        <button
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          disabled={currentPage === totalPages}
          className="page-btn"
        >
          Next →
        </button>
      </div>
    );
  };

  const renderModal = () => {
    if (!showModal || !selectedScreenshot) return null;
    const totals = computeTotals(selectedScreenshot);

    return createPortal(
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>📸 {selectedScreenshot.image_path ? selectedScreenshot.image_path.split('/').pop() : `Screenshot ${selectedScreenshot.id}`}</h3>
            <button className="modal-close" onClick={closeModal}>✕</button>
          </div>
          
          <div className="modal-body">
            <img
              src={getStorageUrl(selectedScreenshot.image_path)}
              alt={`Screenshot ${selectedScreenshot.id}`}
              className="modal-image"
            />
            
            <div className="modal-details">
              {selectedScreenshot.user && (
                <div className="modal-detail-item">
                  <span className="modal-detail-label">👤 User:</span>
                  <span className="modal-detail-value">{selectedScreenshot.user.name}</span>
                </div>
              )}
              
              {selectedScreenshot.task && (
                <div className="modal-detail-item">
                  <span className="modal-detail-label">📋 Task:</span>
                  <span className="modal-detail-value">{selectedScreenshot.task.title}</span>
                </div>
              )}
              
              {selectedScreenshot.task?.project && (
                <div className="modal-detail-item">
                  <span className="modal-detail-label">📁 Project:</span>
                  <span className="modal-detail-value">{selectedScreenshot.task.project.name}</span>
                </div>
              )}
              
              <div className="modal-detail-item">
                <span className="modal-detail-label">📅 Date:</span>
                <span className="modal-detail-value">{formatDate(selectedScreenshot.created_at)}</span>
              </div>
              
              {/* Activity Details in Modal */}
              <div className="modal-detail-item activity-detail">
                <span className="modal-detail-label">⌨️ Total Keyboard:</span>
                <span className="modal-detail-value">{totals.keyboard} clicks</span>
              </div>
              
              <div className="modal-detail-item activity-detail">
                <span className="modal-detail-label">🖱️ Total Mouse:</span>
                <span className="modal-detail-value">{totals.mouse} clicks</span>
              </div>
              
              {selectedScreenshot.activity_percentage !== undefined && (
                <div className="modal-detail-item activity-detail">
                  <span className="modal-detail-label">📊 Activity Level:</span>
                  <span className={`modal-detail-value activity-badge ${getActivityClass(selectedScreenshot.activity_percentage)}`}>
                    {selectedScreenshot.activity_percentage}% ({getActivityLabel(selectedScreenshot.activity_percentage)})
                  </span>
                </div>
              )}
              
              {Array.isArray(selectedScreenshot.minute_breakdown) && selectedScreenshot.minute_breakdown.length > 0 && (
                <div className="modal-detail-item activity-detail">
                  <span className="modal-detail-label">🌀 Total Scroll/Movement:</span>
                  <span className="modal-detail-value">
                    {selectedScreenshot.minute_breakdown.reduce((sum, m) => sum + (Number(m?.mouse_movements ?? 0) || 0), 0)}
                  </span>
                </div>
              )}
              
              {/* Per-Minute Breakdown */}
              {selectedScreenshot.minute_breakdown && selectedScreenshot.minute_breakdown.length > 0 && (
                <div className="minute-breakdown-section">
                  <h4 className="breakdown-title">📊 Per-Minute Activity Breakdown</h4>
                  <div className="minute-breakdown-grid">
                    {selectedScreenshot.minute_breakdown.map((minute, index) => {
                      // Use timestamp if available for correct local time rendering
                      let timeLabel = `${minute.time}:00 - ${minute.time}:59`;
                      try {
                        if (minute.timestamp) {
                          const date = new Date(minute.timestamp);
                          const startStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                          const endDate = new Date(date);
                          endDate.setSeconds(59);
                          endDate.setMilliseconds(0);
                          const endStr = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                          timeLabel = `${startStr} - ${endStr}`;
                        }
                      } catch (e) {}

                      return (
                        <div key={index} className="minute-card">
                          <div className="minute-time">🕐 {timeLabel}</div>
                          <div className="minute-stats">
                            <div className="stat-item">
                              <span className="stat-icon">⌨️</span>
                              <span className="stat-value">{minute.keyboard_clicks}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-icon">🖱️</span>
                              <span className="stat-value">{minute.mouse_clicks}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-icon">🌀</span>
                              <span className="stat-value">{minute.mouse_movements || 0}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-icon">📈</span>
                              <span className="stat-value">{minute.total_activity}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}</div>
                </div>
              )}
            </div>
            
            <div className="modal-actions">
              {isAdmin && (
                  <button 
                    className="modal-btn delete-btn"
                    onClick={() => handleDelete(selectedScreenshot.id)}
                    style={{ backgroundColor: '#dc3545', color: 'white', marginRight: 'auto' }}
                  >
                    🗑️ Delete
                  </button>
              )}
              <button 
                className="modal-btn download-btn"
                onClick={() => window.open(getStorageUrl(selectedScreenshot.image_path), '_blank')}
              >
                🔗 Open Original
              </button>
              <button className="modal-btn close-btn" onClick={closeModal}>
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="screenshots-manager">
      {renderFilterControls()}
      
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">🔄 Loading screenshots...</div>
        </div>
      )}
      
      <div className="screenshots-grid">
        {screenshots.length > 0 ? (
          screenshots.map(renderScreenshotCard)
        ) : (
          <div className="no-screenshots">
            📷 No screenshots found for the selected filters.
            {!isAdmin && (
              <p>Start working on a task with time tracking to capture screenshots!</p>
            )}
          </div>
        )}
      </div>
      
      {renderPagination()}
      {renderModal()}
    </div>
  );
};

export default ScreenshotsManager;
