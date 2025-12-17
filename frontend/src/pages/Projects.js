import React, { useState, useEffect } from 'react';
import { projectService, teamService } from '../services';
import { useAuth } from '../context/AuthContext';
import '../styles/projects.css';

export const Projects = () => {
    const { isAdminOrPM, user } = useAuth();
    const [projects, setProjects] = useState([]);
    const [teams, setTeams] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        team_id: '',
        name: '',
        description: '',
        start_date: '',
        end_date: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [editingProjectId, setEditingProjectId] = useState(null);
    const [editFormData, setEditFormData] = useState({
        name: '',
        description: '',
        status: 'active',
        start_date: '',
        end_date: '',
    });

    useEffect(() => {
        fetchProjects();
        fetchTeams();
    }, []);

    const fetchProjects = async () => {
        try {
            const response = await projectService.getProjects();
            setProjects(response.data.data);
        } catch (error) {
            setError('Failed to fetch projects');
            console.error(error);
        }
    };

    const fetchTeams = async () => {
        try {
            const response = await teamService.getTeams();
            setTeams(response.data.data);
        } catch (error) {
            console.error('Failed to fetch teams', error);
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await projectService.createProject(formData);
            setFormData({
                team_id: '',
                name: '',
                description: '',
                start_date: '',
                end_date: '',
            });
            setShowForm(false);
            fetchProjects();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to create project');
        } finally {
            setLoading(false);
        }
    };

    const canManageProject = (project) => {
        if (isAdminOrPM()) return true;
        return user && project.owner_id === user.id;
    };

    const startEditing = (project) => {
        setEditingProjectId(project.id);
        setEditFormData({
            name: project.name || '',
            description: project.description || '',
            status: project.status || 'active',
            start_date: project.start_date ? project.start_date.substring(0, 10) : '',
            end_date: project.end_date ? project.end_date.substring(0, 10) : '',
        });
    };

    const cancelEditing = () => {
        setEditingProjectId(null);
    };

    const handleUpdateProject = async (e, projectId) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await projectService.updateProject(projectId, editFormData);
            setEditingProjectId(null);
            fetchProjects();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to update project');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteProject = async (projectId) => {
        if (!window.confirm('Delete this project?')) return;
        setLoading(true);
        setError('');

        try {
            await projectService.deleteProject(projectId);
            fetchProjects();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to delete project');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="projects-container">
            <div className="projects-header">
                <h2>Projects</h2>
                {isAdminOrPM() && (
                    <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? 'Cancel' : 'Create Project'}
                    </button>
                )}
            </div>

            {error && <div className="error-message">{error}</div>}

            {showForm && (
                <form onSubmit={handleCreateProject} className="project-form">
                    <h3>Create New Project</h3>
                    <div className="form-group">
                        <label>Team</label>
                        <select
                            value={formData.team_id}
                            onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
                            required
                        >
                            <option value="">Select a team</option>
                            {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                    {team.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Project Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Enter project name..."
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Describe your project goals and objectives..."
                            rows={4}
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Start Date</label>
                            <input
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>End Date</label>
                            <input
                                type="date"
                                value={formData.end_date}
                                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                min={formData.start_date}
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Creating Project...' : 'Create Project'}
                    </button>
                </form>
            )}

            {projects.length === 0 && !showForm && (
                <div className="projects-empty">
                    <h3>No Projects Yet</h3>
                    <p>Create your first project to get started with task management and team collaboration.</p>
                    {isAdminOrPM() && (
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            Create Your First Project
                        </button>
                    )}
                </div>
            )}

            <div className="projects-grid">
                {projects.map((project) => (
                    <div key={project.id} className="project-card">
                        {editingProjectId === project.id ? (
                            <form onSubmit={(e) => handleUpdateProject(e, project.id)} className="project-form">
                                <h3>Edit Project</h3>
                                <div className="form-group">
                                    <label>Project Name</label>
                                    <input
                                        type="text"
                                        value={editFormData.name}
                                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                        placeholder="Enter project name..."
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={editFormData.description}
                                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                                        placeholder="Describe your project goals and objectives..."
                                        rows={3}
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Status</label>
                                        <select
                                            value={editFormData.status}
                                            onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                                        >
                                            <option value="active">Active</option>
                                            <option value="archived">Archived</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Start Date</label>
                                        <input
                                            type="date"
                                            value={editFormData.start_date}
                                            onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>End Date</label>
                                        <input
                                            type="date"
                                            value={editFormData.end_date}
                                            onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                                            min={editFormData.start_date}
                                        />
                                    </div>
                                </div>
                                <div className="project-actions">
                                    <button type="submit" disabled={loading}>
                                        {loading ? 'Saving Changes...' : 'Save Changes'}
                                    </button>
                                    <button type="button" onClick={cancelEditing}>Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <div className="project-header">
                                    <h3>{project.name}</h3>
                                    <span className={`status ${project.status}`}>{project.status}</span>
                                </div>
                                <p>{project.description || 'No description provided for this project.'}</p>
                                <div className="project-dates">
                                    {project.start_date && (
                                        <span>Start: {new Date(project.start_date).toLocaleDateString()}</span>
                                    )}
                                    {project.end_date && (
                                        <span>End: {new Date(project.end_date).toLocaleDateString()}</span>
                                    )}
                                </div>
                                <div className="project-stats">
                                    <span>Team: {project.team?.name || 'No team'}</span>
                                    <span>Tasks: {project.tasks?.length || 0}</span>
                                </div>
                                {canManageProject(project) && (
                                    <div className="project-actions">
                                        <button className="btn-small" onClick={() => startEditing(project)}>Edit Project</button>
                                        <button className="btn-small" onClick={() => handleDeleteProject(project.id)}>Delete</button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Projects;