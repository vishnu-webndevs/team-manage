<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TimeTrackController;
use App\Http\Controllers\Api\ChatGroupController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ScreenshotController;
use App\Http\Controllers\Api\ActivitySessionController;

// Public routes
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/auth/google', [AuthController::class, 'redirectToGoogle']);
Route::get('/auth/google/callback', [AuthController::class, 'handleGoogleCallback']);
Route::get('/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])->name('verification.verify');

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/me', [AuthController::class, 'updateMe']);
    Route::post('/auth/change-password', [AuthController::class, 'changePassword']);
    Route::delete('/auth/me', [AuthController::class, 'deleteMe']);
    Route::post('/email/resend', [AuthController::class, 'resendVerificationEmail']);
    Route::get('/users', [AuthController::class, 'getAllUsers']);

    // Teams
    Route::get('/teams', [TeamController::class, 'index']);
    Route::post('/teams', [TeamController::class, 'store']);
    Route::get('/teams/{team}', [TeamController::class, 'show']);
    Route::put('/teams/{team}', [TeamController::class, 'update']);
    Route::delete('/teams/{team}', [TeamController::class, 'destroy']);
    Route::post('/teams/{team}/members', [TeamController::class, 'addMember']);
    Route::delete('/teams/{team}/members', [TeamController::class, 'removeMember']);

    // Projects
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects', [ProjectController::class, 'store']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::put('/projects/{project}', [ProjectController::class, 'update']);
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);

    // Tasks
    Route::get('/tasks', [TaskController::class, 'index']);
    Route::post('/tasks', [TaskController::class, 'store']);
    Route::get('/tasks/{task}', [TaskController::class, 'show']);
    Route::put('/tasks/{task}', [TaskController::class, 'update']);
    Route::post('/tasks/{task}/assign', [TaskController::class, 'assign']);
    Route::get('/tasks/{task}/summary', [TaskController::class, 'summary']);
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy']);

    // Screenshots
    Route::get('/tasks/{task}/screenshots', [ScreenshotController::class, 'index']);
    Route::post('/screenshots', [ScreenshotController::class, 'store']);
    Route::get('/screenshots/all', [ScreenshotController::class, 'getAllScreenshots']);
    Route::get('/screenshots/me', [ScreenshotController::class, 'getUserScreenshots']);
    Route::delete('/screenshots/{screenshot}', [ScreenshotController::class, 'destroy']);

    Route::get('/activity-sessions', [ActivitySessionController::class, 'index']);
    Route::post('/activity-sessions', [ActivitySessionController::class, 'store']);
    Route::get('/screenshots/all', [ScreenshotController::class, 'getAllScreenshots']); // Admin/Manager view
    Route::get('/screenshots/my', [ScreenshotController::class, 'getUserScreenshots']); // Employee view

    // Activity Sessions
    Route::get('/activity-sessions', [ActivitySessionController::class, 'index']);
    Route::post('/activity-sessions', [ActivitySessionController::class, 'store']);

    // Time Tracking
    Route::get('/time-tracks', [TimeTrackController::class, 'index']);
    Route::post('/time-tracks', [TimeTrackController::class, 'store']);
    Route::post('/time-tracks/start', [TimeTrackController::class, 'start']);
    Route::post('/time-tracks/{timeTrack}/stop', [TimeTrackController::class, 'stop']);
    Route::get('/time-tracks/active', [TimeTrackController::class, 'active']);
    Route::get('/time-tracks/remaining', [TimeTrackController::class, 'remaining']);
    Route::get('/time-tracks/report', [TimeTrackController::class, 'getReport']);
    Route::post('/time-tracks/heartbeat', [TimeTrackController::class, 'heartbeat']);

    // Chat Groups
    Route::get('/chat-groups', [ChatGroupController::class, 'index']);
    Route::post('/chat-groups', [ChatGroupController::class, 'store']);
    Route::get('/chat-groups/{chatGroup}', [ChatGroupController::class, 'show']);
    Route::put('/chat-groups/{chatGroup}', [ChatGroupController::class, 'update']);
    Route::post('/chat-groups/{chatGroup}/members', [ChatGroupController::class, 'addMember']);
    Route::delete('/chat-groups/{chatGroup}/members', [ChatGroupController::class, 'removeMember']);
    Route::delete('/chat-groups/{chatGroup}', [ChatGroupController::class, 'destroy']);

    // Messages
    Route::get('/chat-groups/{chatGroup}/messages', [MessageController::class, 'getChatGroupMessages']);
    Route::post('/chat-groups/{chatGroup}/messages', [MessageController::class, 'sendMessage']);
    Route::put('/messages/{message}', [MessageController::class, 'editMessage']);
    Route::delete('/messages/{message}', [MessageController::class, 'deleteMessage']);

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread', [NotificationController::class, 'unread']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'delete']);
});
