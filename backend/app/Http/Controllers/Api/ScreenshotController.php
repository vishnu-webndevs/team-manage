<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Screenshot;
use Illuminate\Support\Facades\Auth;
use App\Models\Task;
use App\Models\User;
use App\Models\ActivitySession;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use Carbon\Carbon;

class ScreenshotController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Task $task)
    {
        $user = auth()->user();
        
        // Basic authorization - user must be authenticated
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        
        // Check if user can view this task's screenshots
        $canView = false;
        
        // Admin and project managers can view all screenshots
        if ($user->hasRole('admin') || $user->hasRole('project_manager')) {
            $canView = true;
        }
        // Task assignee can view their own task screenshots
        elseif ($task->assigned_to == $user->id) {
            $canView = true;
        }
        // Task creator can view screenshots
        elseif ($task->created_by == $user->id) {
            $canView = true;
        }
        
        if (!$canView) {
            return response()->json(['message' => 'You can only view screenshots from your own tasks.'], 403);
        }
        
        // Get screenshots with proper ordering
        $screenshots = $task->screenshots()
            ->with(['user:id,name', 'task:id,title', 'task.project:id,name'])
            ->orderBy('created_at', 'desc')
            ->get();
        
        return response()->json($screenshots);
    }

    /**
     * Get all screenshots with filtering (for admin/manager)
     */
    public function getAllScreenshots(Request $request)
    {
        $user = auth()->user();
        
        // Only admin and project managers can view all screenshots
        if (!$user->hasRole('admin') && !$user->hasRole('project_manager')) {
            return response()->json(['message' => 'Unauthorized. Admin/Manager access required.'], 403);
        }
        
        $query = Screenshot::with(['user:id,name', 'task:id,title', 'task.project:id,name'])
            ->orderBy('created_at', 'desc');
        
        // Apply date filter
        if ($request->has('period')) {
            $period = $request->input('period');
            $now = Carbon::now();
            
            switch ($period) {
                case 'day':
                    $query->whereDate('created_at', $now->toDateString());
                    break;
                case 'week':
                    $query->whereBetween('created_at', [
                        $now->startOfWeek()->toDateTimeString(),
                        $now->endOfWeek()->toDateTimeString()
                    ]);
                    break;
                case 'month':
                    $query->whereMonth('created_at', $now->month)
                          ->whereYear('created_at', $now->year);
                    break;
                default:
                    // No filter, show all
                    break;
            }
        }
        
        // Apply user filter (optional)
        if ($request->has('user_id')) {
            $query->where('user_id', $request->input('user_id'));
        }
        
        // Apply task filter (optional)
        if ($request->has('task_id')) {
            $query->where('task_id', $request->input('task_id'));
        }
        
        $screenshots = $query->paginate(20);
        
        return response()->json($screenshots);
    }

    /**
     * Get user's own screenshots with filtering
     */
    public function getUserScreenshots(Request $request)
    {
        $user = auth()->user();
        
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        
        // Get only screenshots from tasks assigned to this user
        $query = Screenshot::whereHas('task', function($taskQuery) use ($user) {
            $taskQuery->where('assigned_to', $user->id);
        })
        ->with(['user:id,name', 'task:id,title', 'task.project:id,name'])
        ->orderBy('created_at', 'desc');
        
        // Apply date filter
        if ($request->has('period')) {
            $period = $request->input('period');
            $now = Carbon::now();
            
            switch ($period) {
                case 'day':
                    $query->whereDate('created_at', $now->toDateString());
                    break;
                case 'week':
                    $query->whereBetween('created_at', [
                        $now->startOfWeek()->toDateTimeString(),
                        $now->endOfWeek()->toDateTimeString()
                    ]);
                    break;
                case 'month':
                    $query->whereMonth('created_at', $now->month)
                          ->whereYear('created_at', $now->year);
                    break;
                default:
                    // No filter, show all
                    break;
            }
        }
        
        // Apply task filter (only from user's assigned tasks)
        if ($request->has('task_id')) {
            $taskId = $request->input('task_id');
            // Verify this task is assigned to the user
            $query->whereHas('task', function($taskQuery) use ($user, $taskId) {
                $taskQuery->where('id', $taskId)->where('assigned_to', $user->id);
            });
        }
        
        $screenshots = $query->paginate(20);
        
        return response()->json($screenshots);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        
        
        $request->validate([
            'task_id' => 'required|exists:tasks,id',
            'image' => 'required|image|mimes:jpeg,png,jpg,gif,svg,webp|max:4096',
            'custom_filename' => 'nullable|string',
            'project_name' => 'nullable|string',
            'task_name' => 'nullable|string',
            'keyboard_clicks' => 'nullable|integer|min:0',
            'mouse_clicks' => 'nullable|integer|min:0',
            'activity_percentage' => 'nullable|numeric|min:0|max:100',
            'activity_start_time' => 'nullable|date',
            'activity_end_time' => 'nullable|date',
            'minute_breakdown' => 'nullable|json',
        ]);

        $user = Auth::user();
        
        if (!$user) {
            return response()->json(['message' => 'User not authenticated'], 401);
        }
        
        try {
            $monthYear = Carbon::now()->format('m-Y');
            $safeUsername = Str::slug($user->name ?? 'user');
            $basePath = "screenshots/{$monthYear}/{$safeUsername}";

            $customFilename = $request->input('custom_filename');
            if ($customFilename) {
                $extension = $request->file('image')->getClientOriginalExtension();
                $nameOnly = pathinfo($customFilename, PATHINFO_FILENAME);
                $filename = Str::slug($nameOnly) . '.' . $extension;
                $path = $request->file('image')->storeAs($basePath, $filename, 'public');
            } else {
                $path = $request->file('image')->store($basePath, 'public');
            }

            

            $minuteBreakdown = null;
            if ($request->minute_breakdown) {
                $minuteBreakdown = is_string($request->minute_breakdown) ? 
                    json_decode($request->minute_breakdown, true) : 
                    $request->minute_breakdown;
            }

            // Fallback: build minute breakdown from ActivitySession if missing or all-zero
            $startTime = $request->activity_start_time ? new Carbon($request->activity_start_time) : null;
            $endTime = $request->activity_end_time ? new Carbon($request->activity_end_time) : null;
            if ((!$minuteBreakdown || self::isZeroBreakdown($minuteBreakdown)) && $startTime && $endTime) {
                $minuteBreakdown = self::buildMinuteBreakdownFromSessions(
                    $user->id,
                    (int) $request->task_id,
                    $startTime,
                    $endTime
                );
                // If screenshot totals are zero, sum from breakdown
                if (($request->keyboard_clicks ?? 0) === 0 || ($request->mouse_clicks ?? 0) === 0) {
                    $totals = self::sumTotals($minuteBreakdown);
                    $request->merge([
                        'keyboard_clicks' => $request->keyboard_clicks ?? $totals['keyboard'],
                        'mouse_clicks' => $request->mouse_clicks ?? $totals['mouse'],
                    ]);
                }
            }

            // Even if minute_breakdown exists (e.g., only movements), backfill totals from ActivitySession
            if ($startTime && $endTime && ((int) ($request->keyboard_clicks ?? 0) === 0 || (int) ($request->mouse_clicks ?? 0) === 0)) {
                $kSum = ActivitySession::where('user_id', $user->id)
                    ->where('task_id', (int) $request->task_id)
                    ->whereBetween('start_time', [$startTime->copy()->startOfMinute(), $endTime->copy()->endOfMinute()])
                    ->sum('keyboard_clicks');
                $mSum = ActivitySession::where('user_id', $user->id)
                    ->where('task_id', (int) $request->task_id)
                    ->whereBetween('start_time', [$startTime->copy()->startOfMinute(), $endTime->copy()->endOfMinute()])
                    ->sum('mouse_clicks');
                $request->merge([
                    'keyboard_clicks' => max(0, (int) ($request->keyboard_clicks ?? 0)) ?: (int) $kSum,
                    'mouse_clicks' => max(0, (int) ($request->mouse_clicks ?? 0)) ?: (int) $mSum,
                ]);
            }
            
            $screenshot = Screenshot::create([
                'user_id' => $user->id,
                'task_id' => $request->task_id,
                'image_path' => $path,
                'keyboard_clicks' => $request->keyboard_clicks ?? 0,
                'mouse_clicks' => $request->mouse_clicks ?? 0,
                'activity_percentage' => $request->activity_percentage ?? 0,
                'activity_start_time' => $request->activity_start_time ? new \DateTime($request->activity_start_time) : null,
                'activity_end_time' => $request->activity_end_time ? new \DateTime($request->activity_end_time) : null,
                'minute_breakdown' => $minuteBreakdown,
            ]);
            
            

            return response()->json([
                'screenshot' => $screenshot,
                'filename' => basename($path),
                'url' => url('/storage/' . $path),
                'message' => 'Screenshot captured successfully'
            ], 201);
            
        } catch (\Exception $e) {
            \Log::error('Screenshot storage failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to store screenshot: ' . $e->getMessage()], 500);
        }
    }

    public function destroy(Screenshot $screenshot)
    {
        $user = auth()->user();
        if (!$user || (!$user->hasRole('admin') && !$user->hasRole('project_manager'))) {
            return response()->json(['message' => 'Unauthorized. Only admin and project managers can delete screenshots.'], 403);
        }
        try {
            if ($screenshot->image_path) {
                Storage::disk('public')->delete($screenshot->image_path);
            }
            $screenshot->delete();
            return response()->json(['message' => 'Screenshot deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to delete screenshot: ' . $e->getMessage()], 500);
        }
    }

    protected static function isZeroBreakdown($breakdown): bool
    {
        if (!is_array($breakdown) || empty($breakdown)) return true;
        foreach ($breakdown as $minute) {
            $k = (int) ($minute['keyboard_clicks'] ?? 0);
            $m = (int) ($minute['mouse_clicks'] ?? 0);
            $mv = (int) ($minute['mouse_movements'] ?? 0);
            if ($k > 0 || $m > 0 || $mv > 0) return false;
        }
        return true;
    }

    protected static function buildMinuteBreakdownFromSessions(int $userId, int $taskId, Carbon $start, Carbon $end): array
    {
        $sessions = ActivitySession::where('user_id', $userId)
            ->where('task_id', $taskId)
            ->whereBetween('start_time', [$start->copy()->startOfMinute(), $end->copy()->endOfMinute()])
            ->get(['start_time', 'end_time', 'keyboard_clicks', 'mouse_clicks']);

        $buckets = [];
        $cursor = $start->copy()->startOfMinute();
        while ($cursor->lte($end)) {
            $key = $cursor->format('H:i');
            $buckets[$key] = [
                'time' => $key,
                'keyboard_clicks' => 0,
                'mouse_clicks' => 0,
                'mouse_movements' => 0,
                'total_activity' => 0,
            ];
            $cursor->addMinute();
        }

        foreach ($sessions as $s) {
            $minuteKey = Carbon::parse($s->start_time)->format('H:i');
            if (isset($buckets[$minuteKey])) {
                $buckets[$minuteKey]['keyboard_clicks'] += (int) $s->keyboard_clicks;
                $buckets[$minuteKey]['mouse_clicks'] += (int) $s->mouse_clicks;
            }
        }

        foreach ($buckets as $key => $val) {
            $buckets[$key]['total_activity'] = $val['keyboard_clicks'] + $val['mouse_clicks'];
        }

        return array_values($buckets);
    }

    protected static function sumTotals(array $breakdown): array
    {
        $k = 0; $m = 0;
        foreach ($breakdown as $b) {
            $k += (int) ($b['keyboard_clicks'] ?? 0);
            $m += (int) ($b['mouse_clicks'] ?? 0);
        }
        return ['keyboard' => $k, 'mouse' => $m];
    }
}
