<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\Notification;
use Illuminate\Http\Request;

class TeamController extends Controller
{
    public function index()
    {
        // \Log::channel('custom')->info('GET /teams', [
        //     'user_id' => auth()->id(),
        // ]);
        $teams = auth()->user()->teams()->with('members', 'owner')->paginate();
        return response()->json($teams);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'logo' => 'nullable|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        $team = Team::create([
            'owner_id' => auth()->id(),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        // Add owner as a member
        TeamMember::create([
            'team_id' => $team->id,
            'user_id' => auth()->id(),
            'role' => 'admin',
        ]);

        return response()->json([
            'message' => 'Team created successfully',
            'team' => $team->load('members', 'owner'),
        ], 201);
    }

    public function show(Team $team)
    {
        return response()->json($team->load('members', 'owner', 'projects'));
    }

    public function update(Request $request, Team $team)
    {
        $user = auth()->user();
        $isGlobalAdmin = $user->hasRole('admin') || $user->hasRole('project_manager');
        $isOwner = $user->id === $team->owner_id;
        $isTeamAdmin = \App\Models\TeamMember::where('team_id', $team->id)->where('user_id', $user->id)->where('role', 'admin')->exists();
        if (!$isGlobalAdmin && !$isOwner && !$isTeamAdmin) {
            return response()->json(['message' => 'Unauthorized. Only admin, project managers, or team owner can update teams.'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);

        $team->update($validated);

        return response()->json([
            'message' => 'Team updated successfully',
            'team' => $team,
        ]);
    }

    public function destroy(Team $team)
    {
        if (!auth()->user()->hasRole('admin') && auth()->id() !== $team->owner_id) {
            return response()->json(['message' => 'Unauthorized. Only admin or team owner can delete teams.'], 403);
        }

        $team->delete();

        return response()->json(['message' => 'Team deleted successfully']);
    }

    public function addMember(Request $request, Team $team)
    {
        $user = auth()->user();
        $isGlobalAdmin = $user->hasRole('admin') || $user->hasRole('project_manager');
        $isOwner = $user->id === $team->owner_id;
        $isTeamAdmin = \App\Models\TeamMember::where('team_id', $team->id)->where('user_id', $user->id)->where('role', 'admin')->exists();
        if (!$isGlobalAdmin && !$isOwner && !$isTeamAdmin) {
            return response()->json(['message' => 'Unauthorized. Only admin, project managers, or team owner can manage members.'], 403);
        }

        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'role' => 'required|in:admin,member,viewer',
        ]);

        TeamMember::updateOrCreate(
            ['team_id' => $team->id, 'user_id' => $validated['user_id']],
            ['role' => $validated['role']]
        );

        // Notify user
        if ($validated['user_id'] !== auth()->id()) {
            Notification::create([
                'user_id' => $validated['user_id'],
                'type' => 'team_invitation',
                'title' => 'Added to Team',
                'message' => "You have been added to team '{$team->name}' as {$validated['role']}",
                'link' => '/teams',
                'notifiable_id' => $team->id,
                'notifiable_type' => Team::class,
            ]);
        }

        return response()->json(['message' => 'Member added successfully']);
    }

    public function removeMember(Request $request, Team $team)
    {
        $user = auth()->user();
        $isGlobalAdmin = $user->hasRole('admin') || $user->hasRole('project_manager');
        $isOwner = $user->id === $team->owner_id;
        $isTeamAdmin = \App\Models\TeamMember::where('team_id', $team->id)->where('user_id', $user->id)->where('role', 'admin')->exists();
        if (!$isGlobalAdmin && !$isOwner && !$isTeamAdmin) {
            return response()->json(['message' => 'Unauthorized. Only admin, project managers, or team owner can manage members.'], 403);
        }

        $validated = $request->validate(['user_id' => 'required|exists:users,id']);

        TeamMember::where('team_id', $team->id)
            ->where('user_id', $validated['user_id'])
            ->delete();

        return response()->json(['message' => 'Member removed successfully']);
    }
}
