import React, { useState, useEffect } from 'react';
import './ScreenshotNotification.css';

const ScreenshotNotification = ({ isVisible, onClose, taskName }) => {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (isVisible && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      onClose();
    }
  }, [isVisible, countdown, onClose]);

  if (!isVisible) return null;

  return (
    <div className="screenshot-notification">
      <div className="notification-content">
        <div className="notification-icon">📸</div>
        <div className="notification-text">
          <h4>🖥️ Screen Capture Started</h4>
          <p>Real screen capture (including VS Code, other apps) for "{taskName}"</p>
          <small>📸 First capture will ask for screen permission • Allow "Entire Screen" for full capture</small>
          <small style={{ display: 'block', marginTop: '0.3rem', color: '#95a5a6' }}>
            Schedule: Now • 1 min • 2 min • Then every 10 min
          </small>
          <small style={{ display: 'block', marginTop: '0.3rem', color: '#95a5a6' }}>
            Files: project_task_HH.MM.SS.DD.MM.YYYY.jpg
          </small>
        </div>
        <button onClick={onClose} className="close-btn">×</button>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${((5 - countdown) / 5) * 100}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ScreenshotNotification;
