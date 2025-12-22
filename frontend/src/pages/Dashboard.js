import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { projectService, taskService, timeTrackService } from '../services';
import '../styles/dashboard.css';

export const Dashboard = () => {
    const { user } = useAuth();
    const [projects, setProjects] = useState([]);
    const [stats, setStats] = useState({
        totalProjects: 0,
        totalTasks: 0,
        totalHours: 0,
    });

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            // Load projects
            const projectsRes = await projectService.getProjects();
            setProjects(projectsRes.data.data.slice(0, 5));

            // Load tasks count (assigned to me or all if admin/pm)
            // Using page=1 just to get the total count from metadata
            const tasksRes = await taskService.getTasks({ assigned_to: 'me', page: 1 });
            
            // Load time tracks report to calculate total hours
            // Default range is current month, but we want total. 
            // We'll ask for a wide range, e.g., from 2020.
            const reportRes = await timeTrackService.getReport({ 
                start_date: '2020-01-01', 
                end_date: new Date().toISOString().split('T')[0] 
            });
            const reportData = Array.isArray(reportRes.data) ? reportRes.data : [];
            const totalSeconds = reportData.reduce((sum, day) => sum + (Number(day.total_seconds) || 0), 0);
            const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;

            setStats({
                totalProjects: projectsRes.data.total || 0,
                totalTasks: tasksRes.data.total || 0,
                totalHours: totalHours,
            });

        } catch (error) {
            // console.error('Failed to load dashboard data', error);
        }
    };

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h1>Welcome, {user?.name}!</h1>
                <p>Track your time, manage your team, and stay productive</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <h3>Total Projects</h3>
                    <p className="stat-value">{stats.totalProjects}</p>
                </div>
                <div className="stat-card">
                    <h3>Active Tasks</h3>
                    <p className="stat-value">{stats.totalTasks}</p>
                </div>
                <div className="stat-card">
                    <h3>Hours Tracked</h3>
                    <p className="stat-value">{stats.totalHours}h</p>
                </div>
            </div>

            <div className="recent-section">
                <h2>Recent Projects</h2>
                <div className="projects-list">
                    {projects.map((project) => (
                        <div key={project.id} className="project-item">
                            <h3>{project.name}</h3>
                            <p>{project.description}</p>
                            <div className="project-meta">
                                <span className={`status ${project.status}`}>{project.status}</span>
                                {project.tasks && <span>{project.tasks.length} tasks</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;