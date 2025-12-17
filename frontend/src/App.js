import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { setNavigator } from './services/navigation';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import GoogleCallback from './pages/GoogleCallback';
import Dashboard from './pages/Dashboard';
import TimeTracker from './pages/TimeTracker';
import Teams from './pages/Teams';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import Chat from './pages/Chat';
import TaskTrackerPage from './pages/TaskTrackerPage';
import TrackerMonitorPage from './pages/TrackerMonitorPage';
import ScreenshotsManager from './pages/ScreenshotsManager';
import Notifications from './pages/Notifications';

import './styles/index.css';

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Routes>
      {!isAuthenticated ? (
        <>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/google/callback" element={<GoogleCallback />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </>
      ) : (
        <>
          <Route
            path="/"
            element={
              <Layout>
                <Dashboard />
              </Layout>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Layout>
                <Dashboard />
              </Layout>
            }
          />
          <Route
            path="/time-tracker"
            element={
              <Layout>
                <TimeTracker />
              </Layout>
            }
          />
          <Route
            path="/teams"
            element={
              <Layout>
                <Teams />
              </Layout>
            }
          />
          <Route
            path="/projects"
            element={
              <Layout>
                <Projects />
              </Layout>
            }
          />
          <Route
            path="/tasks"
            element={
              <Layout>
                <Tasks />
              </Layout>
            }
          />
          <Route
            path="/chat"
            element={
              <Layout>
                <Chat />
              </Layout>
            }
          />
          <Route
            path="/tasks/:taskId/tracker"
            element={
              <Layout>
                <TaskTrackerPage />
              </Layout>
            }
          />
          <Route
            path="/monitor"
            element={
              <Layout>
                <TrackerMonitorPage />
              </Layout>
            }
          />
          <Route
            path="/screenshots"
            element={
              <Layout>
                <ScreenshotsManager />
              </Layout>
            }
          />
          <Route
            path="/notifications"
            element={
              <Layout>
                <Notifications />
              </Layout>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </>
      )}
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <NavigatorSetter />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

function NavigatorSetter() {
  const navigate = useNavigate();
  React.useEffect(() => {
    setNavigator(navigate);
  }, [navigate]);
  return null;
}

export default App;

// Removed global auto-start of screenshotting to avoid repeated permission prompts
