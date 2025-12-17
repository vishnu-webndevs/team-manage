import api from './api';

export const authService = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    logout: () => api.post('/auth/logout'),
    getMe: () => api.get('/auth/me'),
    getCurrentUser: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },
    getUsers: () => api.get('/users'),
    updateMe: (data) => api.put('/auth/me', data),
};

export const teamService = {
    getTeams: (page = 1) => api.get('/teams', { params: { page } }),
    getTeam: (id) => api.get(`/teams/${id}`),
    createTeam: (data) => api.post('/teams', data),
    updateTeam: (id, data) => api.put(`/teams/${id}`, data),
    deleteTeam: (id) => api.delete(`/teams/${id}`),
    addMember: (teamId, data) => api.post(`/teams/${teamId}/members`, data),
    removeMember: (teamId, data) => api.delete(`/teams/${teamId}/members`, { data }),
};

export const projectService = {
    getProjects: (page = 1) => api.get('/projects', { params: { page } }),
    getProject: (id) => api.get(`/projects/${id}`),
    createProject: (data) => api.post('/projects', data),
    updateProject: (id, data) => api.put(`/projects/${id}`, data),
    deleteProject: (id) => api.delete(`/projects/${id}`),
};

export const taskService = {
    getTasks: (params = {}) => api.get('/tasks', { params }),
    getTask: (id) => api.get(`/tasks/${id}`),
    createTask: (data) => api.post('/tasks', data),
    updateTask: (id, data) => api.put(`/tasks/${id}`, data),
    deleteTask: (id) => api.delete(`/tasks/${id}`),
    assignTask: (id, assigneeId) => api.post(`/tasks/${id}/assign`, { assigned_to: assigneeId }),
    getSummary: (id, params = {}) => api.get(`/tasks/${id}/summary`, { params }),
};

export const timeTrackService = {
    getTimeTracks: (params = {}) => api.get('/time-tracks', { params }),
    getActiveTimer: () => api.get('/time-tracks/active'),
    startTimer: (data) => api.post('/time-tracks/start', data),
    stopTimer: (id) => api.post(`/time-tracks/${id}/stop`),
    createTimeTrack: (data) => api.post('/time-tracks', data),
    getReport: (params = {}) => api.get('/time-tracks/report', { params }),
    getRemaining: (taskId, params = {}) => api.get('/time-tracks/remaining', { params: { task_id: taskId, ...params } }),
};

export const chatService = {
    getChatGroups: (page = 1) => api.get('/chat-groups', { params: { page } }),
    getChatGroup: (id) => api.get(`/chat-groups/${id}`),
    createChatGroup: (data) => api.post('/chat-groups', data),
    updateChatGroup: (id, data) => api.put(`/chat-groups/${id}`, data),
    deleteChatGroup: (id) => api.delete(`/chat-groups/${id}`),
    addMemberToChat: (chatId, data) => api.post(`/chat-groups/${chatId}/members`, data),
    removeMemberFromChat: (chatId, data) => api.delete(`/chat-groups/${chatId}/members`, { data }),
};

export const messageService = {
    getMessages: (chatGroupId, params = {}) =>
        api.get(`/chat-groups/${chatGroupId}/messages`, { params }),
    sendMessage: (chatGroupId, data) =>
        api.post(`/chat-groups/${chatGroupId}/messages`, data),
    editMessage: (id, data) => api.put(`/messages/${id}`, data),
    deleteMessage: (id) => api.delete(`/messages/${id}`),
};

export const notificationService = {
    getNotifications: (page = 1) => api.get('/notifications', { params: { page } }),
    getUnreadCount: () => api.get('/notifications/unread'),
    markAsRead: (id) => api.post(`/notifications/${id}/read`),
    markAllAsRead: () => api.post('/notifications/read-all'),
    deleteNotification: (id) => api.delete(`/notifications/${id}`),
};

export const activityService = {
    getSessions: (params = {}) => api.get('/activity-sessions', { params }),
    createSession: (data) => api.post('/activity-sessions', data),
};

export const screenshotService = {
    getScreenshots: (taskId, params = {}) => api.get(`/tasks/${taskId}/screenshots`, { params }),
    getAllScreenshots: (params = {}) => api.get('/screenshots/all', { params }),
    getUserScreenshots: (params = {}) => api.get('/screenshots/me', { params }),
    deleteScreenshot: (id) => api.delete(`/screenshots/${id}`),
};
