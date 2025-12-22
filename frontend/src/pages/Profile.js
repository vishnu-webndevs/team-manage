import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services';

const Profile = () => {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [changeMsg, setChangeMsg] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  useEffect(() => {
    setName(user?.name || '');
    setEmail(user?.email || '');
  }, [user]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      await authService.updateMe({ name, email });
      await refreshUser();
      setSaveMsg('Profile updated');
    } catch (error) {
      const msg = error?.response?.data?.message || 'Update failed';
      setSaveMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setChanging(true);
    setChangeMsg('');
    try {
      await authService.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangeMsg('Password changed');
    } catch (error) {
      const msg = error?.response?.data?.message || 'Password change failed';
      setChangeMsg(msg);
    } finally {
      setChanging(false);
    }
  };

  const handleDeleteAccount = async () => {
    const ok = window.confirm('Delete your account? This action cannot be undone.');
    if (!ok) return;
    setDeleting(true);
    setDeleteMsg('');
    try {
      await authService.deleteMe();
      localStorage.removeItem('token');
      window.location.href = '/login';
    } catch (error) {
      const msg = error?.response?.data?.message || 'Delete failed';
      setDeleteMsg(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 820, margin: '24px auto' }}>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div className="profile-header">
            <div className="profile-avatar">{(user?.name || '?').charAt(0).toUpperCase()}</div>
            <div className="profile-meta">
              <div className="profile-name">{user?.name}</div>
              <div className="profile-email">{user?.email}</div>
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="section-title">Profile Details</div>
          <form onSubmit={handleProfileSave}>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            {saveMsg && <div className={saveMsg.includes('failed') ? 'error-message' : 'success-message'}>{saveMsg}</div>}
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="section-title">Change Password</div>
          <form onSubmit={handlePasswordChange}>
            <div className="form-row">
              <div className="form-group">
                <label>Old Password</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Old password"
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button className="btn-secondary" type="submit" disabled={changing}>
                {changing ? 'Changing...' : 'Update Password'}
              </button>
            </div>
            {changeMsg && <div className={changeMsg.includes('failed') ? 'error-message' : 'success-message'}>{changeMsg}</div>}
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24, borderColor: '#fca5a5' }}>
        <div className="card-body">
          <div className="section-title" style={{ color: '#b91c1c' }}>Permanent account delete</div>
          <p style={{ color: '#6b7280' }}>
            Deleting your account will remove your access immediately.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              className="btn-stop"
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
          {deleteMsg && <div className={deleteMsg.includes('failed') ? 'error-message' : 'success-message'}>{deleteMsg}</div>}
        </div>
      </div>
    </div>
  );
};

export default Profile;
