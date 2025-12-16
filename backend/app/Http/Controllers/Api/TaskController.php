<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskLog;
use App\Models\Screenshot;
use App\Models\ActivitySession;
use App\Models\TimeTrack;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $assignedRequested = $request->assigned_to ?? null;
        $assignedResolved = null;
        $isAdminOrPM = auth()->user() && (auth()->user()->hasRole('admin') || auth()->user()->hasRole('project_manager'));
        $restrictedToUser = false;
        if ($assignedRequested === 'me') {
            $assignedResolved = auth()->id();
        } elseif (is_numeric($assignedRequested)) {
            $assignedResolved = (int) $assignedRequested;
        } elseif (!$isAdminOrPM) {
            $assignedResolved = auth()->id();
            $restrictedToUser = true;
        }
        $query = Task::query();
        if ($request->filled('project_id')) {
            $query->where('project_id', (int) $request->project_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($assignedResolved) {
            $query->where('assigned_to', (int) $assignedResolved);
        }
        $userId = auth()->id();
        $requestId = $request->id ?? null;

       

        $tasks = $query->with('project', 'creator', 'assignee')->paginate();
       
        return response()->json($tasks);
    }

    public function store(Request $request)
    {
        // Check if user has permission to create tasks
        if (!auth()->user()->hasRole('admin') && !auth()->user()->hasRole('project_manager')) {
            return response()->json([
                'message' => 'Unauthorized. Only admin and project managers can create tasks.',
            ], 403);
        }

        $validated = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'assigned_to' => 'nullable|exists:users,id',
            'priority' => 'required|in:low,medium,high,critical',
            'estimated_hours' => 'nullable|integer',
            'time_reset_policy' => 'nullable|in:fixed,per_week',
            'due_date' => 'nullable|date',
        ]);

        $payload = [
            'project_id' => $validated['project_id'],
            'created_by' => auth()->id(),
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'assigned_to' => $validated['assigned_to'] ?? null,
            'priority' => $validated['priority'],
            'estimated_hours' => $validated['estimated_hours'] ?? null,
            'due_date' => $validated['due_date'] ?? null,
        ];
        if (\Illuminate\Support\Facades\Schema::hasColumn('tasks', 'time_reset_policy')) {
            $payload['time_reset_policy'] = $validated['time_reset_policy'] ?? 'fixed';
        }
        $task = Task::create($payload);

        return response()->json([
            'message' => 'Task created successfully',
            'task' => $task->load('project', 'creator', 'assignee'),
        ], 201);
    }

    public function show(Task $task)
    {
        $user = auth()->user();
        $isAdminOrPM = $user->hasRole('admin') || $user->hasRole('project_manager');
        $isCreator = $user->id === $task->created_by;
        $isAssignee = $user->id === ($task->assigned_to ?? 0);
        if (!($isAdminOrPM || $isCreator || $isAssignee)) {
            return response()->json(['message' => 'Unauthorized. Only admin/PM/creator/assignee can view this task.'], 403);
        }
        $relations = ['project', 'creator', 'assignee'];
        if (\Illuminate\Support\Facades\Schema::hasTable('time_tracks')) {
            $relations[] = 'timeTracks';
        }
        if (\Illuminate\Support\Facades\Schema::hasTable('task_logs')) {
            $relations[] = 'logs';
        }
        return response()->json($task->load($relations));
    }

    public function update(Request $request, Task $task)
    {

        $isAdminOrPM = auth()->user()->hasRole('admin') || auth()->user()->hasRole('project_manager');
        $isCreator = auth()->id() === $task->created_by;
        $isAssignee = auth()->id() === ($task->assigned_to ?? 0);

        if ($isAdminOrPM || $isCreator) {
            $validated = $request->validate([
                'title' => 'required|string|max:255',
                'description' => 'nullable|string',
                'status' => 'required|in:todo,in_progress,review,completed',
                'assigned_to' => 'nullable|exists:users,id',
                'priority' => 'required|in:low,medium,high,critical',
                'estimated_hours' => 'nullable|integer',
                'time_reset_policy' => 'nullable|in:fixed,per_week',
                'due_date' => 'nullable|date',
            ]);

            $oldStatus = $task->status;
            if (!\Illuminate\Support\Facades\Schema::hasColumn('tasks', 'time_reset_policy')) {
                unset($validated['time_reset_policy']);
            }
            $task->update($validated);

            if ($oldStatus !== $validated['status']) {
                if (Schema::hasTable('task_logs')) {
                    TaskLog::create([
                        'user_id' => auth()->id(),
                        'action' => 'status_changed',
                        'old_value' => $oldStatus,
                        'new_value' => $validated['status'],
                        'loggable_id' => $task->id,
                        'loggable_type' => Task::class,
                    ]);
                }
            }

            return response()->json([
                'message' => 'Task updated successfully',
                'task' => $task,
            ]);
        }

        if ($isAssignee) {
            $validated = $request->validate([
                'status' => 'required|in:todo,in_progress,review,completed',
            ]);
            $oldStatus = $task->status;
            $task->update(['status' => $validated['status']]);
            if ($oldStatus !== $validated['status']) {
                if (Schema::hasTable('task_logs')) {
                    TaskLog::create([
                        'user_id' => auth()->id(),
                        'action' => 'status_changed',
                        'old_value' => $oldStatus,
                        'new_value' => $validated['status'],
                        'loggable_id' => $task->id,
                        'loggable_type' => Task::class,
                    ]);
                }
            }
            return response()->json([
                'message' => 'Task status updated successfully',
                'task' => $task,
            ]);
        }

        return response()->json([
            'message' => 'Unauthorized. Only admin, PM, creator, or assignee (status-only) can update tasks.',
        ], 403);
    }

    public function destroy(Task $task)
    {
        $screenshots = $task->screenshots()->get();
        foreach ($screenshots as $s) {
            if ($s->image_path) {
                Storage::disk('public')->delete($s->image_path);
            }
            $s->delete();
        }
        ActivitySession::where('task_id', $task->id)->delete();
        TimeTrack::where('task_id', $task->id)->delete();
        $task->delete();
        return response()->json(['message' => 'Task deleted successfully']);
    }

    public function assign(Request $request, Task $task)
    {
        // Check if user is admin or project_manager
        if (!auth()->user()->hasRole('admin') && !auth()->user()->hasRole('project_manager')) {
            return response()->json([
                'message' => 'Unauthorized. Only admin and project managers can assign tasks.',
            ], 403);
        }

        $validated = $request->validate([
            'assigned_to' => 'required|exists:users,id',
        ]);

        $task->update(['assigned_to' => $validated['assigned_to']]);

        return response()->json([
            'message' => 'Task assigned successfully',
            'task' => $task->load('assignee'),
        ]);
    }

    public function summary(Request $request, Task $task)
    {
        $user = auth()->user();
        $targetUserId = $user->id;
        if ($request->filled('user_id') && ($user->hasRole('admin') || $user->hasRole('project_manager'))) {
            $targetUserId = (int) $request->user_id;
        }

        $capSeconds = ((int) ($task->estimated_hours ?? 0)) * 3600;

        $policy = $task->time_reset_policy ?? 'fixed';
        $trackedQuery = TimeTrack::where('task_id', $task->id)->where('user_id', $targetUserId);
        if ($policy === 'per_week') {
            $startOfWeek = now('Asia/Kolkata')->startOfWeek();
            $endOfWeek = now('Asia/Kolkata')->endOfWeek();
            $trackedQuery->whereBetween('start_time', [$startOfWeek, $endOfWeek]);
        }
        $trackedSeconds = (int) ($trackedQuery
            ->selectRaw('SUM(GREATEST(0, COALESCE(duration_seconds, TIMESTAMPDIFF(SECOND, start_time, end_time)))) as total_seconds')
            ->value('total_seconds') ?? 0);
        $active = TimeTrack::where('user_id', $targetUserId)
            ->where('task_id', $task->id)
            ->whereNull('end_time')
            ->first();
        if ($active) {
            $trackedSeconds += now()->diffInSeconds($active->start_time);
        }

        $activityRecords = ActivitySession::where('task_id', $task->id)
            ->where('user_id', $targetUserId)
            ->get(['start_time','end_time','duration_seconds']);
        $activitySeconds = 0;
        foreach ($activityRecords as $rec) {
            $dur = (int) ($rec->duration_seconds ?? 0);
            if ($dur > 0) {
                $activitySeconds += $dur;
            } elseif (!empty($rec->end_time)) {
                $activitySeconds += \Carbon\Carbon::parse($rec->end_time)->diffInSeconds(\Carbon\Carbon::parse($rec->start_time));
            }
        }

        $remainingSeconds = $capSeconds > 0 ? max(0, $capSeconds - $trackedSeconds) : 0;

        return response()->json([
            'task_id' => $task->id,
            'user_id' => $targetUserId,
            'estimated_hours' => (int) ($task->estimated_hours ?? 0),
            'cap_seconds' => $capSeconds,
            'tracked_seconds' => $trackedSeconds,
            'activity_seconds' => $activitySeconds,
            'remaining_seconds' => $remainingSeconds,
            'time_reset_policy' => $task->time_reset_policy ?? 'fixed',
        ]);
    }
}
