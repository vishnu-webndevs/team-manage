import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// Data APIs yahin services ke through call hote hain
import { taskService, projectService, teamService, timeTrackService } from '../services';
import { useAuth } from '../context/AuthContext';
import '../styles/tasks.css';

export const Tasks = () => {
    const { isAdminOrPM, user } = useAuth();
    const navigate = useNavigate();
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [members, setMembers] = useState([]);
    const [assigneeTracked, setAssigneeTracked] = useState({});
    const [filters, setFilters] = useState({
        project_id: '',
        status: '',
        assigned_to: '',
    });
    
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        project_id: '',
        title: '',
        description: '',
        assigned_to: '',
        priority: 'medium',
        estimated_hours: '',
        time_reset_policy: 'fixed',
        due_date: '',
    });
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [reassignTaskId, setReassignTaskId] = useState(null);
    const [reassignMemberId, setReassignMemberId] = useState('');
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [reassignTask, setReassignTask] = useState(null);
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editData, setEditData] = useState({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        estimated_hours: '',
        due_date: '',
        assigned_to: '',
    });
    const [updating, setUpdating] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState('kanban');

    const lastFetchRef = React.useRef({ sig: null, at: 0 });
    const debounceRef = React.useRef(null);
    useEffect(() => {
        const sig = JSON.stringify(filters);
        const now = Date.now();
        if (lastFetchRef.current && lastFetchRef.current.sig === sig && (now - lastFetchRef.current.at) < 1000) {
            console.log('[Tasks] Skipping duplicate fetch due to StrictMode', filters);
            return;
        }
        lastFetchRef.current = { sig, at: now };
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            console.log('[Tasks] Filters changed, fetching projects/teams/tasks', filters);
            fetchProjects();
            fetchTeams();
            fetchTasks();
        }, 250);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const fetchProjects = async () => {
        console.log('[Tasks] Fetching projects...');
        // Projects GET /projects se fetch ho rahe hain
        try {
            const response = await projectService.getProjects();
            console.log('[Tasks] Projects fetched', response.data?.data?.length || 0);
            setProjects(response.data.data);
        } catch (error) {
            console.error('Failed to fetch projects', error);
        }
    };

    const fetchTeams = async () => {
        console.log('[Tasks] Fetching teams...');
        // Teams GET /teams se aati hain; members ko flatten karke unique list banate hain
        try {
            const response = await teamService.getTeams();
            const teamsData = response.data.data || [];
            const allMembers = teamsData.flatMap(t => t.members || []);
            const uniqueMembers = [];
            const seen = new Set();
            for (const m of allMembers) {
                if (!seen.has(m.id)) {
                    seen.add(m.id);
                    uniqueMembers.push(m);
                }
            }
            console.log('[Tasks] Teams fetched', teamsData.length, 'members', uniqueMembers.length);
            setMembers(uniqueMembers);
        } catch (error) {
            console.error('Failed to fetch teams', error);
        }
    };

    const fetchTasks = async () => {
        console.log('[Tasks] Fetching tasks with filters', filters);
        // Tasks GET /tasks se fetch hoti hain; filters query params me jaate hain
        try {
            const response = await taskService.getTasks(filters);
            console.log('[Tasks] Tasks fetched', response.data?.data?.length || 0);
            setTasks(response.data.data);
        } catch (error) {
            console.error('Failed to fetch tasks', error);
        }
    };

    useEffect(() => {
        const loadTracked = async () => {
            console.log('[Tasks] Loading tracked summaries...');
            const map = {};
            let list = tasks.slice(0, 20);
            if (isAdminOrPM()) {
                list = list.filter(t => !!t.assignee);
            }
            const workers = list.map(async (t) => {
                try {
                    if (isAdminOrPM() && t.assignee) {
                        const res = await taskService.getSummary(parseInt(t.id), { user_id: t.assignee.id });
                        map[t.id] = Math.max(0, Number(res.data?.tracked_seconds ?? 0));
                    } else {
                        const res = await taskService.getSummary(parseInt(t.id));
                        map[t.id] = Math.max(0, Number(res.data?.tracked_seconds ?? 0));
                    }
                } catch {}
            });
            await Promise.allSettled(workers);
            setAssigneeTracked(map);
            console.log('[Tasks] Tracked map ready', map);
        };
        loadTracked();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks]);

    const formatDuration = (seconds) => {
        const s = Math.max(0, Number(seconds) || 0);
        if (!s) return '0h 0m';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const filteredTasks = tasks.filter(t => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const name = (t.title || t.name || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        return name.includes(q) || desc.includes(q);
    });

    const columns = [
        { key: 'todo', title: 'To Do' },
        { key: 'in_progress', title: 'In Progress' },
        { key: 'review', title: 'Review' },
        { key: 'completed', title: 'Done' },
    ];

    const stats = (() => {
        const total = filteredTasks.length;
        const unassigned = filteredTasks.filter(t => !t.assignee).length;
        const assigned = total - unassigned;
        const overdue = filteredTasks.filter(t => {
            if (!t.due_date) return false;
            const dd = new Date(t.due_date);
            const endOfDay = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23, 59, 59, 999);
            return new Date() > endOfDay && t.status !== 'completed';
        }).length;
        const highPriority = filteredTasks.filter(t => t.priority === 'high' || t.priority === 'critical').length;
        return { total, unassigned, assigned, overdue, highPriority };
    })();

    const startEditing = (task) => {
        setEditingTaskId(task.id);
        setEditData({
            title: task.title || '',
            description: task.description || '',
            status: task.status || 'todo',
            priority: task.priority || 'medium',
            estimated_hours: task.estimated_hours ?? '',
            due_date: task.due_date ? String(task.due_date).substring(0, 10) : '',
            assigned_to: task.assignee ? task.assignee.id : '',
            time_reset_policy: task.time_reset_policy || 'fixed',
        });
        setShowEditModal(true);
    };

    const cancelEditing = () => {
        setEditingTaskId(null);
        setEditData({
            title: '',
            description: '',
            status: 'todo',
            priority: 'medium',
            estimated_hours: '',
            due_date: '',
            assigned_to: '',
        });
        setShowEditModal(false);
    };

    const handleUpdateTask = async (taskId) => {
        setUpdating(true);
        setError('');
        try {
            const task = tasks.find(t => t.id === taskId);
            const canFullEdit = isAdminOrPM() || (task && task.creator && user && task.creator.id === user.id);
            const isAssignedToMe = task && task.assignee && user && task.assignee.id === user.id;

            let payload;
            if (canFullEdit) {
                payload = {
                    title: editData.title,
                    description: editData.description || null,
                    status: editData.status,
                    priority: editData.priority,
                    estimated_hours: editData.estimated_hours === '' ? null : Number(editData.estimated_hours),
                    time_reset_policy: editData.time_reset_policy || 'fixed',
                    due_date: editData.due_date || null,
                };
                if (isAdminOrPM()) {
                    payload.assigned_to = editData.assigned_to ? Number(editData.assigned_to) : null;
                }
            } else if (isAssignedToMe) {
                payload = { status: editData.status };
            } else {
                setError('You are not allowed to update this task');
                setUpdating(false);
                return;
            }
            await taskService.updateTask(taskId, payload);
            cancelEditing();
            fetchTasks();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update task');
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteTask = async (taskId) => {
        const ok = window.confirm('Delete this task?');
        if (!ok) return;
        try {
            await taskService.deleteTask(taskId);
            fetchTasks();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to delete task');
        }
    };

    const openReassign = (task) => {
        setReassignTask(task);
        setReassignMemberId(task?.assignee?.id ? String(task.assignee.id) : '');
        setShowReassignModal(true);
    };
    const closeReassign = () => {
        setShowReassignModal(false);
        setReassignTask(null);
        setReassignMemberId('');
    };
    const handleConfirmReassign = async () => {
        if (!reassignTask?.id || !reassignMemberId) return;
        try {
            await taskService.assignTask(reassignTask.id, parseInt(reassignMemberId));
            closeReassign();
            fetchTasks();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to assign task');
        }
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await taskService.createTask(formData);
            setFormData({
                project_id: '',
                title: '',
                description: '',
                assigned_to: '',
                priority: 'medium',
                estimated_hours: '',
                time_reset_policy: 'fixed',
                due_date: '',
            });

            setShowForm(false);
            fetchTasks();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to create task');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tasks-container">
            <div className="tasks-header">
                <h2>Tasks Management</h2>
                <div className="tasks-actions">
                    <div className="view-toggle">
                        <button className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>▤</button>
                        <button className={`toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')}>▦</button>
                    </div>
                    {isAdminOrPM() && (
                        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                            {showForm ? 'Cancel' : 'Create Task'}
                        </button>
                    )}
                </div>
            </div>

            <div className="tasks-stats">
                <div className="stat"><span className="stat-label">Total Tasks</span><span className="stat-value">{stats.total}</span></div>
                <div className="stat"><span className="stat-label">Unassigned</span><span className="stat-value">{stats.unassigned}</span></div>
                <div className="stat"><span className="stat-label">Assigned</span><span className="stat-value">{stats.assigned}</span></div>
                <div className="stat danger"><span className="stat-label">Overdue</span><span className="stat-value">{stats.overdue}</span></div>
                <div className="stat warn"><span className="stat-label">High Priority</span><span className="stat-value">{stats.highPriority}</span></div>
            </div>

            <div className="tasks-searchbar">
                <input type="text" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <button className="search-btn" onClick={() => { /* search handled live */ }}>Search</button>
                <div className="filters-inline">
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    >
                        <option value="">All Statuses</option>
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="review">Review</option>
                        <option value="completed">Completed</option>
                    </select>
                    <select
                        value={filters.project_id}
                        onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
                    >
                        <option value="">All Projects</option>
                        {projects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Create Task</h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleCreateTask}>
                                <div className="form-group">
                                    <label>Project</label>
                                    <select
                                        value={formData.project_id}
                                        onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                                        required
                                    >
                                        <option value="">Select a project</option>
                                        {projects.map((project) => (
                                            <option key={project.id} value={project.id}>
                                                {project.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Title</label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>

                                {isAdminOrPM() && (
                                    <div className="form-group">
                                        <label>Assign to Employee</label>
                                        <select
                                            value={formData.assigned_to}
                                            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                                        >
                                            <option value="">Unassigned</option>
                                            {members.map((member) => (
                                                <option key={member.id} value={member.id}>{member.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Priority</label>
                                        <select
                                            value={formData.priority}
                                            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="critical">Critical</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Estimated Hours</label>
                                        <input
                                            type="number"
                                            value={formData.estimated_hours}
                                            onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Reset Policy</label>
                                    <select
                                            value={formData.time_reset_policy}
                                            onChange={(e) => setFormData({ ...formData, time_reset_policy: e.target.value })}
                                        >
                                            <option value="fixed">Fixed</option>
                                            <option value="per_week">Per Week</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Due Date</label>
                                        <input
                                            type="date"
                                            value={formData.due_date}
                                            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="modal-actions">
                                    <button type="button" className="modal-btn close-btn" onClick={() => setShowForm(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="modal-btn save-btn" disabled={loading}>
                                        {loading ? 'Creating...' : 'Create Task'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'kanban' ? (
                <div className="tasks-board">
                    {columns.map(col => {
                        const items = filteredTasks.filter(t => (t.status || 'todo') === col.key);
                        return (
                            <div key={col.key} className="tasks-column">
                                <div className="column-header">
                                    <span>{col.title}</span>
                                    <span className="count">{items.length}</span>
                                </div>
                                <div className="column-body">
                                    {items.length === 0 ? (
                                        <div className="empty-state">
                                            <div className="empty-icon">🗒️</div>
                                            <div>No tasks</div>
                                        </div>
                                    ) : items.map(task => (
                                        <div key={task.id} className="task-card">
                                            <div className="card-header">
                                                <h4>{task.title}</h4>
                                                <span className={`priority ${task.priority}`}>{task.priority}</span>
                                            </div>
                                            <div className="card-meta">
                                                <span className={`status ${task.status}`}>{task.status}</span>
                                                {task.assignee ? (<span className="assigned-to">{task.assignee.name}</span>) : (<span className="unassigned">Unassigned</span>)}
                                                {task.due_date && (() => {
                                                    const dd = new Date(task.due_date);
                                                    const endOfDay = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23, 59, 59, 999);
                                                    const overdue = new Date() > endOfDay && task.status !== 'completed';
                                                    return overdue ? (<span className="status overdue">Overdue</span>) : null;
                                                })()}
                                            {task.assignee && (
                                                <span className="tracked-time">{formatDuration(assigneeTracked[task.id] || 0)}</span>
                                            )}
                                            </div>
                                            <div className="card-actions">
                                                <button className="btn-small" onClick={() => navigate(`/tasks/${task.id}/tracker`, { state: { task } })}>View</button>
                                                {isAdminOrPM() && (
                                                    <button className="btn-small" onClick={() => openReassign(task)}>Reassign</button>
                                                )}
                                                <button className="btn-small" onClick={() => startEditing(task)}>Edit</button>
                                                {(isAdminOrPM() || (task.creator && user && task.creator.id === user.id)) && (
                                                    <button className="btn-small" onClick={() => handleDeleteTask(task.id)}>Delete</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="tasks-list">
                    {filteredTasks.map((task) => (
                        <div key={task.id} className="task-item">
                            <div className="task-header">
                                <h3>{task.title}</h3>
                                <span className={`priority ${task.priority}`}>{task.priority}</span>
                                <span className={`status ${task.status}`}>{task.status}</span>
                            </div>
                            <p>{task.description}</p>
                            <div className="task-meta">
                                <span>Est: {task.estimated_hours}h</span>
                                {task.due_date && (
                                    <span>
                                        Due: {new Date(task.due_date).toLocaleDateString()}
                                    </span>
                                )}
                                {task.due_date && (() => {
                                    const dd = new Date(task.due_date);
                                    const endOfDay = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23, 59, 59, 999);
                                    const overdue = new Date() > endOfDay && task.status !== 'completed';
                                    return overdue ? (
                                        <span className="status overdue">Overdue</span>
                                    ) : null;
                                })()}
                                {task.assignee && (
                                    <span className="assigned-to">
                                        Assigned to: <strong>{task.assignee.name}</strong>
                                    </span>
                                )}
                                {!task.assignee && (
                                    <span className="unassigned">Unassigned</span>
                                )}
                                {task.assignee && (
                                    <span className="tracked-time">Tracked: {formatDuration(assigneeTracked[task.id] || 0)}</span>
                                )}
                            </div>
                            <div className="task-actions" style={{ marginTop: '0.5rem' }}>
                                <button className="btn-small" onClick={() => navigate(`/tasks/${task.id}/tracker`, { state: { task } })}>View</button>
                            </div>
                            {(isAdminOrPM() || (task.creator && user && task.creator.id === user.id)) && (
                                <div className="task-actions">
                                    <>
                                        {isAdminOrPM() && (
                                            <button
                                                className="btn-small"
                                                onClick={() => openReassign(task)}
                                            >
                                                Reassign
                                            </button>
                                        )}
                                        <button
                                            className="btn-small"
                                            onClick={() => startEditing(task)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="btn-small"
                                            onClick={() => handleDeleteTask(task.id)}
                                        >
                                            Delete
                                        </button>
                                    </>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* <div className="tasks-list">
                {tasks.map((task) => (
                    <div key={task.id} className="task-item">
                        <div className="task-header">
                            <h3>{task.title}</h3>
                            <span className={`priority ${task.priority}`}>{task.priority}</span>
                            <span className={`status ${task.status}`}>{task.status}</span>
                        </div>
                        <p>{task.description}</p>
                        <div className="task-meta">
                            <span>Est: {task.estimated_hours}h</span>
                            {task.due_date && (
                                <span>
                                    Due: {new Date(task.due_date).toLocaleDateString()}
                                </span>
                            )}
                            {task.due_date && (() => {
                                const dd = new Date(task.due_date);
                                const endOfDay = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23, 59, 59, 999);
                                const overdue = new Date() > endOfDay && task.status !== 'completed';
                                return overdue ? (
                                    <span className="status overdue">Overdue</span>
                                ) : null;
                            })()}
                            {task.assignee && (
                                <span className="assigned-to">
                                    Assigned to: <strong>{task.assignee.name}</strong>
                                </span>
                            )}
                            {!task.assignee && (
                                <span className="unassigned">Unassigned</span>
                            )}
                            {isAdminOrPM() && task.assignee && (
                                <span className="tracked-time">Tracked: {formatDuration(assigneeTracked[task.id] || 0)}</span>
                            )}
                        </div>
                        {(isAdminOrPM() || (task.creator && user && task.creator.id === user.id)) && (
                            <div className="task-actions">
                                {reassignTaskId === task.id ? (
                                    <div className="reassign-inline">
                                        <select
                                            value={reassignMemberId}
                                            onChange={(e) => setReassignMemberId(e.target.value)}
                                        >
                                            <option value="">Select employee</option>
                                            {members.map((member) => (
                                                <option key={member.id} value={member.id}>{member.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            className="btn-small"
                                            onClick={() => {
                                                if (!reassignMemberId) return;
                                                taskService.assignTask(task.id, parseInt(reassignMemberId))
                                                    .then(() => {
                                                        setReassignTaskId(null);
                                                        setReassignMemberId('');
                                                        fetchTasks();
                                                    })
                                                    .catch((error) => {
                                                        alert(error.response?.data?.message || 'Failed to assign task');
                                                    });
                                            }}
                                        >
                                            Save
                                        </button>
                                        <button
                                            className="btn-small"
                                            onClick={() => {
                                                setReassignTaskId(null);
                                                setReassignMemberId('');
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {isAdminOrPM() && (
                                            <button
                                                className="btn-small"
                                                onClick={() => setReassignTaskId(task.id)}
                                            >
                                                Reassign
                                            </button>
                                        )}
                                        <button
                                            className="btn-small"
                                            onClick={() => startEditing(task)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="btn-small"
                                            onClick={() => handleDeleteTask(task.id)}
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                                
                            </div>
                        )}
                    </div>
                ))}
            </div> */}
            {showEditModal && (
                <div className="modal-overlay" onClick={cancelEditing}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Task</h3>
                            <button className="modal-close" onClick={cancelEditing}>✕</button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={(e) => { e.preventDefault(); handleUpdateTask(editingTaskId); }}>
                                {(() => {
                                    const task = tasks.find(t => t.id === editingTaskId);
                                    const canFullEdit = isAdminOrPM() || (task && task.creator && user && task.creator.id === user.id);
                                    const isAssignedToMe = task && task.assignee && user && task.assignee.id === user.id;
                                    return (
                                        <>
                                <div className="form-group">
                                    <label>Title</label>
                                    <input
                                        type="text"
                                        value={editData.title}
                                        onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                                        required={canFullEdit}
                                        disabled={!canFullEdit}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={editData.description}
                                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                        disabled={!canFullEdit}
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Status</label>
                                        <select
                                            value={editData.status}
                                            onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                                        >
                                            <option value="todo">To Do</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="review">Review</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Priority</label>
                                        <select
                                            value={editData.priority}
                                            onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
                                            disabled={!canFullEdit}
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="critical">Critical</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Estimated Hours</label>
                                        <input
                                            type="number"
                                            value={editData.estimated_hours}
                                            onChange={(e) => setEditData({ ...editData, estimated_hours: e.target.value })}
                                            disabled={!canFullEdit}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Reset Policy</label>
                                        <select
                                            value={editData.time_reset_policy}
                                            onChange={(e) => setEditData({ ...editData, time_reset_policy: e.target.value })}
                                            disabled={!canFullEdit}
                                        >
                                            <option value="fixed">Fixed</option>
                                            <option value="per_week">Per Week</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Due Date</label>
                                        <input
                                            type="date"
                                            value={editData.due_date}
                                            onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                                            disabled={!canFullEdit}
                                        />
                                    </div>
                                </div>
                                {isAdminOrPM() && (
                                    <div className="form-group">
                                        <label>Assign to Employee</label>
                                        <select
                                            value={editData.assigned_to}
                                            onChange={(e) => setEditData({ ...editData, assigned_to: e.target.value })}
                                        >
                                            <option value="">Unassigned</option>
                                            {members.map((member) => (
                                                <option key={member.id} value={member.id}>{member.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                    </>
                                    );
                                })()}
                                <div className="modal-actions">
                                    <button type="submit" className="modal-btn save-btn" disabled={updating}>
                                        {updating ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button type="button" className="modal-btn close-btn" onClick={cancelEditing}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {showReassignModal && (
                <div className="modal-overlay" onClick={closeReassign}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Reassign Task</h3>
                            <button className="modal-close" onClick={closeReassign}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Task</label>
                                <div style={{ fontWeight: 600 }}>{reassignTask?.title || '-'}</div>
                            </div>
                            <div className="form-group">
                                <label>Select employee</label>
                                <select
                                    value={reassignMemberId}
                                    onChange={(e) => setReassignMemberId(e.target.value)}
                                >
                                    <option value="">Select employee</option>
                                    {members.map((member) => (
                                        <option key={member.id} value={member.id}>{member.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="modal-btn save-btn"
                                    onClick={handleConfirmReassign}
                                    disabled={!reassignMemberId}
                                >
                                    Save
                                </button>
                                <button type="button" className="modal-btn close-btn" onClick={closeReassign}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tasks;
