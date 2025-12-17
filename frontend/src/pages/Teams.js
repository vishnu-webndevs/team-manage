import React, { useState, useEffect } from 'react';
import { teamService, authService } from '../services';
import { useAuth } from '../context/AuthContext';
import '../styles/teams.css';

export const Teams = () => {
    const { isAdminOrPM } = useAuth();
    const [teams, setTeams] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [editTeamId, setEditTeamId] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', description: '' });
    const [users, setUsers] = useState([]);
    const [memberUserId, setMemberUserId] = useState('');
    const [memberRole, setMemberRole] = useState('member');
    const [showEditModal, setShowEditModal] = useState(false);

    useEffect(() => {
        fetchTeams();
        if (isAdminOrPM()) {
            fetchUsers();
        }
    }, []);

    const fetchTeams = async () => {
        try {
            const response = await teamService.getTeams();
            setTeams(response.data.data);
        } catch (error) {
            setError('Failed to fetch teams');
            console.error(error);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await authService.getUsers();
            const list = res.data?.data || res.data || [];
            setUsers(list);
        } catch (error) {
            console.error('Failed to fetch users', error);
        }
    };

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await teamService.createTeam(formData);
            setFormData({ name: '', description: '' });
            setShowForm(false);
            fetchTeams();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to create team');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (team) => {
        setEditTeamId(team.id);
        setEditForm({ name: team.name || '', description: team.description || '' });
        setShowEditModal(true);
    };

    const cancelEdit = () => {
        setEditTeamId(null);
        setEditForm({ name: '', description: '' });
        setShowEditModal(false);
    };

    const handleUpdateTeam = async (e) => {
        e.preventDefault();
        if (!editTeamId) return;
        setLoading(true);
        setError('');
        try {
            await teamService.updateTeam(editTeamId, editForm);
            cancelEdit();
            fetchTeams();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to update team');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTeam = async (teamId) => {
        const ok = window.confirm('Delete this team? This action cannot be undone.');
        if (!ok) return;
        setLoading(true);
        setError('');
        try {
            await teamService.deleteTeam(teamId);
            fetchTeams();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to delete team');
        } finally {
            setLoading(false);
        }
    };

    const handleAddMemberToTeam = async (teamId) => {
        if (!memberUserId) return;
        setLoading(true);
        setError('');
        try {
            await teamService.addMember(teamId, { user_id: memberUserId, role: memberRole });
            setMemberUserId('');
            fetchTeams();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to add member');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMemberFromTeam = async (teamId, userId) => {
        setLoading(true);
        setError('');
        try {
            await teamService.removeMember(teamId, { user_id: userId });
            fetchTeams();
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to remove member');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="teams-container">
            <div className="teams-header">
                <h2>Teams</h2>
                {isAdminOrPM() && (
                    <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? 'Cancel' : 'Create Team'}
                    </button>
                )}
            </div>

            {error && <div className="error-message">{error}</div>}

            {showForm && isAdminOrPM() && (
                <form onSubmit={handleCreateTeam} className="team-form">
                    <h3>Create New Team</h3>
                    <div className="form-group">
                        <label>Team Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Enter team name..."
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Describe your team's purpose and goals..."
                            rows={4}
                        />
                    </div>
                    <button type="submit" disabled={loading}>
                        {loading ? 'Creating Team...' : 'Create Team'}
                    </button>
                </form>
            )}

            {teams.length === 0 && !showForm && (
                <div className="teams-empty">
                    <h3>No Teams Yet</h3>
                    <p>Create your first team to start collaborating with your colleagues and organizing projects.</p>
                    <button className="btn-primary" onClick={() => setShowForm(true)}>
                        Create Your First Team
                    </button>
                </div>
            )}

            <div className="teams-grid">
                {teams.map((team) => (
                    <div key={team.id} className="team-card">
                        <div className="team-header">
                            <div className="team-icon">
                                {team.name.charAt(0).toUpperCase()}
                            </div>
                            <h3>{team.name}</h3>
                        </div>
                        {(
                            <>
                                <p>{team.description || 'No description provided for this team.'}</p>
                                <div className="team-stats">
                                    <span>Members: {team.members?.length || 0}</span>
                                    <span>Projects: {team.projects?.length || 0}</span>
                                </div>
                                {isAdminOrPM() && (
                                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn-primary" onClick={() => startEdit(team)}>Edit</button>
                                        <button className="btn-danger" onClick={() => handleDeleteTeam(team.id)}>Delete</button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>
            {showEditModal && (
                <div className="teams-modal-overlay" onClick={cancelEdit}>
                    <div className="teams-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="teams-modal-header">
                            <h3>Edit Team</h3>
                            <button className="close-button" onClick={cancelEdit}>✕</button>
                        </div>
                        <div className="teams-modal-body">
                            <form onSubmit={handleUpdateTeam} className="team-form" style={{ marginBottom: 0, boxShadow: 'none', border: 'none', backdropFilter: 'none' }}>
                                <div className="form-group">
                                    <label>Team Name</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={editForm.description}
                                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                        rows={3}
                                    />
                                </div>
                                {isAdminOrPM() && (
                                    <div className="form-group">
                                        <label>Manage Members</label>
                                        {(() => {
                                            const team = teams.find(t => t.id === editTeamId) || { members: [] };
                                            return (
                                                <>
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)}>
                                                            <option value="">Select User</option>
                                                            {users
                                                                .filter(u => !(team.members || []).some(m => String(m.id) === String(u.id)))
                                                                .map(u => (
                                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                                ))}
                                                        </select>
                                                        <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                                                            <option value="member">Member</option>
                                                            <option value="admin">Admin</option>
                                                            <option value="viewer">Viewer</option>
                                                        </select>
                                                        <button type="button" onClick={() => handleAddMemberToTeam(editTeamId)} disabled={loading || !memberUserId}>Add</button>
                                                    </div>
                                                    {(team.members || []).length > 0 && (
                                                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            {(team.members || []).map(m => (
                                                                <span key={m.id} style={{ background: '#f3f4f6', borderRadius: 14, padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                    {m.name}
                                                                    <button type="button" className="btn-danger" onClick={() => handleRemoveMemberFromTeam(editTeamId, m.id)}>Remove</button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button type="submit" disabled={loading}>
                                        {loading ? 'Saving...' : 'Save'}
                                    </button>
                                    <button type="button" onClick={cancelEdit}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Teams;
