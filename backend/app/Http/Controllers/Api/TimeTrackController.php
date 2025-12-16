<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TimeTrack;
use App\Models\Task;
use App\Models\Screenshot;
use Illuminate\Http\Request;
use Carbon\Carbon;

class TimeTrackController extends Controller
{
    public function index(Request $request)
    {
        $user = auth()->user();
        $query = TimeTrack::query();

        // Admin/PM can see all, others only their own
        if (!($user->hasRole('admin') || $user->hasRole('project_manager'))) {
            $query->where('user_id', $user->id);
        } else if ($request->user_id) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->task_id) {
            $query->where('task_id', $request->task_id);
        }

        if ($request->project_id) {
            $query->where('project_id', $request->project_id);
        }

        if ($request->date) {
            $query->whereDate('start_time', $request->date);
        }

        $timeTracks = $query->with('task', 'project', 'user')->orderBy('start_time', 'desc')->paginate();
        return response()->json($timeTracks);
    }

    public function start(Request $request)
    {
        $validated = $request->validate([
            'task_id' => 'nullable|exists:tasks,id',
            'project_id' => 'nullable|exists:projects,id',
            'description' => 'nullable|string',
        ]);

        // Stop any active timer and finalize its duration to ensure sums include latest time
        $activeTracks = TimeTrack::where('user_id', auth()->id())
            ->whereNull('end_time')
            ->get();
        foreach ($activeTracks as $active) {
            $now = now('Asia/Kolkata');
            $duration = $now->diffInSeconds($active->start_time);
            $trimmed = false;
            if (!empty($active->task_id)) {
                $taskA = Task::find($active->task_id);
                if ($taskA && !empty($taskA->estimated_hours)) {
                    $capSecondsA = ((int) $taskA->estimated_hours) * 3600;
                    $beforeSumA = TimeTrack::where('user_id', auth()->id())
                        ->where('task_id', $taskA->id)
                        ->where('id', '!=', $active->id)
                        ->sum('duration_seconds');
                    $remainingA = max(0, $capSecondsA - $beforeSumA);
                    if ($duration > $remainingA) {
                        $duration = $remainingA;
                        $now = (clone $active->start_time)->addSeconds($duration);
                        $trimmed = true;
                    }
                }
            }
            $active->end_time = $now;
            $active->duration_seconds = $duration;
            // Compute average activity percentage from screenshots during this track
            try {
                $screens = Screenshot::where('user_id', auth()->id())
                    ->where('task_id', $active->task_id)
                    ->whereBetween('created_at', [$active->start_time->copy()->subMinutes(1), $now->copy()->addMinutes(1)])
                    ->get(['activity_percentage','activity_start_time','activity_end_time']);
                $weightedSum = 0.0; $totalWeight = 0;
                foreach ($screens as $s) {
                    $perc = (float) ($s->activity_percentage ?? 0);
                    $st = $s->activity_start_time ? new \Carbon\Carbon($s->activity_start_time) : null;
                    $et = $s->activity_end_time ? new \Carbon\Carbon($s->activity_end_time) : null;
                    $w = ($st && $et) ? max(1, $et->diffInSeconds($st)) : 60;
                    $weightedSum += ($perc * $w);
                    $totalWeight += $w;
                }
                $active->activity = $totalWeight > 0 ? round($weightedSum / $totalWeight, 2) : 0;
            } catch (\Throwable $e) {
                $active->activity = 0;
            }
            $active->save();
        }

        // Enforce estimated hours limit per task cumulatively (total)
        if (!empty($validated['task_id'])) {
            $task = Task::find($validated['task_id']);
            if ($task && $task->status === 'completed') {
                return response()->json([
                    'message' => 'Task is completed. Time tracking is disabled.',
                ], 403);
            }
            if ($task && !empty($task->estimated_hours)) {
                $capSeconds = ((int) $task->estimated_hours) * 3600;
                $trackedSeconds = TimeTrack::where('user_id', auth()->id())
                    ->where('task_id', $task->id)
                    ->sum('duration_seconds');
                if ($trackedSeconds >= $capSeconds) {
                    return response()->json([
                        'message' => 'Time limit reached for this task',
                        'limit_hours' => (int) $task->estimated_hours,
                        'tracked_hours' => round($trackedSeconds / 3600, 2),
                    ], 403);
                }
            }
            if (!empty($task->due_date)) {
                $due = Carbon::parse($task->due_date)->endOfDay();
                if (now()->greaterThan($due)) {
                    return response()->json([
                        'message' => 'Task is past due date',
                        'due_date' => $task->due_date,
                    ], 403);
                }
            }
        }

        $timeTrack = TimeTrack::create([
            'user_id' => auth()->id(),
            'task_id' => $validated['task_id'] ?? null,
            'project_id' => $validated['project_id'] ?? null,
            'start_time' => now('Asia/Kolkata'),
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json([
            'message' => 'Timer started',
            'time_track' => $timeTrack,
        ], 201);
    }

    public function stop(TimeTrack $timeTrack)
    {
        if ($timeTrack->user_id !== auth()->id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $now = now('Asia/Kolkata');
        $duration = $now->diffInSeconds($timeTrack->start_time);

        // If task has estimated hours, cap the total tracked duration (total)
        $trimmed = false;
        if (!empty($timeTrack->task_id)) {
            $task = Task::find($timeTrack->task_id);
            if ($task && !empty($task->estimated_hours)) {
                $capSeconds = ((int) $task->estimated_hours) * 3600;
                $beforeSum = TimeTrack::where('user_id', auth()->id())
                    ->where('task_id', $task->id)
                    ->where('id', '!=', $timeTrack->id)
                    ->sum('duration_seconds');
                $remaining = max(0, $capSeconds - $beforeSum);
                if ($duration > $remaining) {
                    // Trim end_time to fit remaining
                    $duration = $remaining;
                    $now = (clone $timeTrack->start_time)->addSeconds($duration);
                    $trimmed = true;
                }
            }
        }

        // Compute average activity percentage from screenshots during this track
        $activityAvg = 0;
        try {
            $screens = Screenshot::where('user_id', auth()->id())
                ->where('task_id', $timeTrack->task_id)
                ->whereBetween('created_at', [$timeTrack->start_time->copy()->subMinutes(1), $now->copy()->addMinutes(1)])
                ->get(['activity_percentage','activity_start_time','activity_end_time']);
            $weightedSum = 0.0; $totalWeight = 0;
            foreach ($screens as $s) {
                $perc = (float) ($s->activity_percentage ?? 0);
                $st = $s->activity_start_time ? new \Carbon\Carbon($s->activity_start_time) : null;
                $et = $s->activity_end_time ? new \Carbon\Carbon($s->activity_end_time) : null;
                $w = ($st && $et) ? max(1, $et->diffInSeconds($st)) : 60;
                $weightedSum += ($perc * $w);
                $totalWeight += $w;
            }
            $activityAvg = $totalWeight > 0 ? round($weightedSum / $totalWeight, 2) : 0;
        } catch (\Throwable $e) {
            $activityAvg = 0;
        }

        $timeTrack->update([
            'end_time' => $now,
            'duration_seconds' => $duration,
            'activity' => $activityAvg,
        ]);

        return response()->json([
            'message' => 'Timer stopped',
            'time_track' => $timeTrack,
            'trimmed' => $trimmed,
        ]);
    }

    public function active()
    {
        $activeTimer = TimeTrack::where('user_id', auth()->id())
            ->whereNull('end_time')
            ->with('task', 'project')
            ->first();

        return response()->json($activeTimer);
    }

    public function remaining(Request $request)
    {
        $validated = $request->validate([
            'task_id' => 'required|exists:tasks,id',
            'user_id' => 'nullable|integer',
            'period' => 'nullable|string',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
        ]);

        $user = auth()->user();
        $targetUserId = $user->id;
        if (!empty($validated['user_id']) && ($user->hasRole('admin') || $user->hasRole('project_manager'))) {
            $targetUserId = (int) $validated['user_id'];
        }

        $task = Task::find($validated['task_id']);
        $capSeconds = (int) $task->estimated_hours * 3600;
        if ($capSeconds <= 0) {
            return response()->json([
                'estimated_hours' => (int) ($task->estimated_hours ?? 0),
                'cap_seconds' => 0,
                'tracked_seconds' => 0,
                'remaining_seconds' => 0,
            ]);
        }

        $period = $validated['period'] ?? 'total';
        $policy = $task->time_reset_policy ?? 'fixed';
        if ($policy === 'per_week') {
            $period = 'week';
        }
        $periodStart = null; $periodEnd = null;
        if ($period === 'week') {
            $periodStart = now('Asia/Kolkata')->startOfWeek();
            $periodEnd = now('Asia/Kolkata')->endOfWeek();
        } elseif ($period === 'day') {
            $periodStart = now('Asia/Kolkata')->startOfDay();
            $periodEnd = now('Asia/Kolkata')->endOfDay();
        } elseif ($period === 'range' && !empty($validated['start_date']) && !empty($validated['end_date'])) {
            $periodStart = now('Asia/Kolkata')->parse($validated['start_date']);
            $periodEnd = now('Asia/Kolkata')->parse($validated['end_date']);
        }

        $trackedQuery = TimeTrack::where('user_id', $targetUserId)
            ->where('task_id', $task->id);
        if ($periodStart && $periodEnd) {
            $trackedQuery->whereBetween('start_time', [$periodStart, $periodEnd]);
        }
        $trackedSeconds = (int) ($trackedQuery
            ->selectRaw('SUM(GREATEST(0, COALESCE(duration_seconds, TIMESTAMPDIFF(SECOND, start_time, end_time)))) as total_seconds')
            ->value('total_seconds') ?? 0);

        $active = TimeTrack::where('user_id', $targetUserId)
            ->where('task_id', $task->id)
            ->whereNull('end_time')
            ->first();
        if ($active && (!$periodStart || $active->start_time >= $periodStart)) {
            $trackedSeconds += now()->diffInSeconds($active->start_time);
        }

        $remaining = max(0, $capSeconds - $trackedSeconds);

        return response()->json([
            'estimated_hours' => (int) ($task->estimated_hours ?? 0),
            'cap_seconds' => $capSeconds,
            'tracked_seconds' => $trackedSeconds,
            'remaining_seconds' => $remaining,
            'period' => $period,
            'start' => $periodStart ? $periodStart->toDateString() : null,
            'end' => $periodEnd ? $periodEnd->toDateString() : null,
            'user_id' => $targetUserId,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'task_id' => 'nullable|exists:tasks,id',
            'project_id' => 'nullable|exists:projects,id',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
            'description' => 'nullable|string',
        ]);

        $start = new \Carbon\Carbon($validated['start_time']);
        $end = new \Carbon\Carbon($validated['end_time']);
        $start->setTimezone('Asia/Kolkata');
        $end->setTimezone('Asia/Kolkata');
        $validated['start_time'] = $start->format('Y-m-d H:i:s');
        $validated['end_time'] = $end->format('Y-m-d H:i:s');
        $duration = strtotime($validated['end_time']) - strtotime($validated['start_time']);
        if ($duration < 0) {
            $duration = 0;
        }

        $timeTrack = TimeTrack::create([
            'user_id' => auth()->id(),
            'task_id' => $validated['task_id'] ?? null,
            'project_id' => $validated['project_id'] ?? null,
            'start_time' => $validated['start_time'],
            'end_time' => $validated['end_time'],
            'duration_seconds' => $duration,
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json([
            'message' => 'Time tracked successfully',
            'time_track' => $timeTrack,
        ], 201);
    }

    public function getReport(Request $request)
    {
        $startDate = $request->query('start_date', now()->startOfMonth());
        $endDate = $request->query('end_date', now()->endOfMonth());

        $report = TimeTrack::where('user_id', auth()->id())
            ->whereBetween('start_time', [$startDate, $endDate])
            ->selectRaw('DATE(start_time) as date, SUM(GREATEST(0, duration_seconds)) as total_seconds, COUNT(*) as count')
            ->groupBy('date')
            ->get();

        return response()->json($report);
    }
}
