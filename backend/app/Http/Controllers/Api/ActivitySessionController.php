<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivitySession;
use App\Models\Task;
use App\Models\TimeTrack;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivitySessionController extends Controller
{
    public function index(Request $request)
    {
        $user = auth()->user();
        $query = ActivitySession::query();

        if (!($user->hasRole('admin') || $user->hasRole('project_manager'))) {
            $query->where('user_id', $user->id);
        } else if ($request->user_id) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->task_id) {
            $query->where('task_id', $request->task_id);
        }

        if ($request->date) {
            $query->whereDate('start_time', $request->date);
        }

        if ($request->period) {
            $now = now();
            switch ($request->period) {
                case 'day':
                    $query->whereDate('start_time', $now->toDateString());
                    break;
                case 'week':
                    $query->whereBetween('start_time', [$now->startOfWeek(), $now->endOfWeek()]);
                    break;
                case 'month':
                    $query->whereMonth('start_time', $now->month)->whereYear('start_time', $now->year);
                    break;
            }
        }

        $sessions = $query->with(['user:id,name', 'task:id,title,project_id', 'project:id,name'])
            ->orderBy('start_time', 'desc')
            ->paginate();

        return response()->json($sessions);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'task_id' => 'required|exists:tasks,id',
            'app_name' => 'required|string|max:255',
            'window_title' => 'nullable|string|max:1024',
            'url' => 'nullable|string',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after_or_equal:start_time',
            'duration_seconds' => 'nullable|integer|min:0',
            'keyboard_clicks' => 'nullable|integer|min:0',
            'mouse_clicks' => 'nullable|integer|min:0',
        ]);

        $user = auth()->user();
        $task = Task::findOrFail($validated['task_id']);

        if (!($user->hasRole('admin') || $user->hasRole('project_manager') || $task->assigned_to === $user->id)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $duration = $validated['duration_seconds'] ?? (strtotime($validated['end_time']) - strtotime($validated['start_time']));
        $start = new \Carbon\Carbon($validated['start_time']);
        $end = new \Carbon\Carbon($validated['end_time']);
        $validated['start_time'] = $start->format('Y-m-d H:i:s');
        $validated['end_time'] = $end->format('Y-m-d H:i:s');

        if ($duration < 5) {
            return response()->json(['message' => 'Ignored short session'], 200);
        }

        // Require an active time track for this task to record activity history
        $activeTrack = TimeTrack::where('user_id', $user->id)
            ->where('task_id', $task->id)
            ->whereNull('end_time')
            ->first();
        if (!$activeTrack) {
            return response()->json(['message' => 'No active time tracking for this task'], 403);
        }

        $existing = ActivitySession::where('user_id', $user->id)
            ->where('task_id', $task->id)
            ->where('app_name', $validated['app_name'])
            ->where('start_time', $validated['start_time'])
            ->where('end_time', $validated['end_time'])
            ->first();
        if ($existing) {
            $existing->keyboard_clicks = (int) ($existing->keyboard_clicks ?? 0) + (int) ($validated['keyboard_clicks'] ?? 0);
            $existing->mouse_clicks = (int) ($existing->mouse_clicks ?? 0) + (int) ($validated['mouse_clicks'] ?? 0);
            $existing->save();
            return response()->json(['message' => 'Activity session deduplicated', 'session' => $existing], 200);
        }

        $prev = ActivitySession::where('user_id', $user->id)
            ->where('task_id', $task->id)
            ->where('app_name', $validated['app_name'])
            ->orderBy('end_time', 'desc')
            ->first();

        if ($prev) {
            $sameWindow = ($prev->window_title ?? null) === ($validated['window_title'] ?? null);
            $sameUrl = ($prev->url ?? null) === ($validated['url'] ?? null);
            $prevHost = $prev->url ? parse_url($prev->url, PHP_URL_HOST) : null;
            $newHost = isset($validated['url']) ? parse_url($validated['url'], PHP_URL_HOST) : null;
            $sameHost = $prevHost && $newHost && ($prevHost === $newHost);
            $prevEndTs = \Carbon\Carbon::parse($prev->end_time)->getTimestamp();
            $gap = abs($end->getTimestamp() - $prevEndTs);
            if (($sameWindow || $sameUrl || $sameHost) && $gap <= 300) {
                $prev->end_time = $validated['end_time'];
                $prev->duration_seconds = (int) ($prev->duration_seconds ?? 0) + (int) $duration;
                $prev->keyboard_clicks = (int) ($prev->keyboard_clicks ?? 0) + (int) ($validated['keyboard_clicks'] ?? 0);
                $prev->mouse_clicks = (int) ($prev->mouse_clicks ?? 0) + (int) ($validated['mouse_clicks'] ?? 0);
                $prev->save();
                return response()->json(['message' => 'Activity session merged', 'session' => $prev], 200);
            }
        }

        DB::statement(
            'INSERT INTO activity_sessions (user_id, task_id, project_id, app_name, window_title, url, start_time, end_time, duration_seconds, keyboard_clicks, mouse_clicks, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE 
               end_time = VALUES(end_time),
               duration_seconds = duration_seconds + VALUES(duration_seconds),
               keyboard_clicks = keyboard_clicks + VALUES(keyboard_clicks),
               mouse_clicks = mouse_clicks + VALUES(mouse_clicks),
               window_title = VALUES(window_title),
               url = VALUES(url),
               updated_at = NOW()'
            , [
                $user->id,
                $task->id,
                $task->project_id,
                $validated['app_name'],
                $validated['window_title'] ?? null,
                $validated['url'] ?? null,
                $validated['start_time'],
                $validated['end_time'],
                (int) $duration,
                (int) ($validated['keyboard_clicks'] ?? 0),
                (int) ($validated['mouse_clicks'] ?? 0),
            ]
        );

        $session = ActivitySession::where('user_id', $user->id)
            ->where('task_id', $task->id)
            ->where('app_name', $validated['app_name'])
            ->where('start_time', $validated['start_time'])
            ->where('end_time', $validated['end_time'])
            ->first();

        return response()->json(['message' => 'Activity session recorded', 'session' => $session], 201);
    }
}
