<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\Screenshot;
use App\Models\ActivitySession;
use App\Models\TimeTrack;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProjectController extends Controller
{
    public function index(Request $request)
    {
        // \Log::channel('custom')->info('GET /projects', [
        //     'user_id' => auth()->id(),
        //     'project_id' => $request->project_id ?? null,
        // ]);
        $user = auth()->user();

        // Admin and Project Manager can see all projects; team members see their teams' projects
        if ($user->hasRole('admin') || $user->hasRole('project_manager')) {
            $query = Project::query();
        } else {
            $teamIds = \App\Models\TeamMember::where('user_id', $user->id)->pluck('team_id');
            $query = Project::whereIn('team_id', $teamIds);
        }

        // Optional filter by project_id for consistency
        if ($request->filled('project_id')) {
            $query->where('id', (int) $request->project_id);
        }

        $projects = $query->with('team', 'owner', 'tasks')->paginate();
        return response()->json($projects);
    }

    public function store(Request $request)
    {
        // Check if user has permission to create projects
        if (!auth()->user()->hasRole('admin') && !auth()->user()->hasRole('project_manager')) {
            return response()->json([
                'message' => 'Unauthorized. Only admin and project managers can create projects.',
            ], 403);
        }

        $validated = $request->validate([
            'team_id' => 'required|exists:teams,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after:start_date',
        ]);

        $project = Project::create([
            'team_id' => $validated['team_id'],
            'owner_id' => auth()->id(),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'start_date' => $validated['start_date'] ?? null,
            'end_date' => $validated['end_date'] ?? null,
        ]);

        return response()->json([
            'message' => 'Project created successfully',
            'project' => $project->load('team', 'owner'),
        ], 201);
    }

    public function show(Project $project)
    {
        $user = auth()->user();
        if ($user->hasRole('admin') || $user->hasRole('project_manager')) {
            return response()->json($project->load('team', 'owner', 'tasks', 'timeTracks'));
        }
        $isTeamMember = \App\Models\TeamMember::where('team_id', $project->team_id)->where('user_id', $user->id)->exists();
        if (!$isTeamMember) {
            return response()->json(['message' => 'Unauthorized. Only team members can view this project.'], 403);
        }
        return response()->json($project->load('team', 'owner', 'tasks', 'timeTracks'));
    }

    public function update(Request $request, Project $project)
    {
        // Check if user is admin, project_manager, or the project owner
        if (!auth()->user()->hasRole('admin') && !auth()->user()->hasRole('project_manager') && auth()->id() !== $project->owner_id) {
            return response()->json([
                'message' => 'Unauthorized. Only admin, project managers, or project owner can update projects.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'required|in:draft,public,active,archived,completed',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after:start_date',
        ]);

        $project->update($validated);

        return response()->json([
            'message' => 'Project updated successfully',
            'project' => $project,
        ]);
    }

    public function destroy(Project $project)
    {
        if (!auth()->user()->hasRole('admin') && !auth()->user()->hasRole('project_manager') && auth()->id() !== $project->owner_id) {
            return response()->json([
                'message' => 'Unauthorized. Only admin, project managers, or project owner can delete projects.',
            ], 403);
        }

        $tasks = $project->tasks()->get();
        foreach ($tasks as $task) {
            $screens = $task->screenshots()->get();
            foreach ($screens as $s) {
                if ($s->image_path) {
                    Storage::disk('public')->delete($s->image_path);
                }
                $s->delete();
            }
            ActivitySession::where('task_id', $task->id)->delete();
            TimeTrack::where('task_id', $task->id)->delete();
        }
        ActivitySession::where('project_id', $project->id)->delete();
        TimeTrack::where('project_id', $project->id)->delete();
        $project->tasks()->delete();
        $project->delete();

        return response()->json(['message' => 'Project deleted successfully']);
    }
}
