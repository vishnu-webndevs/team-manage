<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatGroup;
use Illuminate\Http\Request;

class ChatGroupController extends Controller
{
    public function index()
    {
        $user = auth()->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $chatGroups = $user->chatGroups()
            ->with('members', 'team')
            ->paginate();

        return response()->json($chatGroups);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'team_id' => 'required|exists:teams,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'is_group' => 'required|boolean',
            'member_ids' => 'required|array|min:1',
            'member_ids.*' => 'exists:users,id',
        ]);

        $chatGroup = ChatGroup::create([
            'team_id' => $validated['team_id'],
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'is_group' => $validated['is_group'],
        ]);

        // Add members
        $members = array_unique(array_merge($validated['member_ids'], [auth()->user()->id]));
        $chatGroup->members()->attach($members);

        return response()->json([
            'message' => 'Chat group created successfully',
            'chat_group' => $chatGroup->load('members'),
        ], 201);
    }

    public function show(ChatGroup $chatGroup)
    {
        return response()->json($chatGroup->load('members', 'team', 'messages.sender'));
    }

    public function update(Request $request, ChatGroup $chatGroup)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);

        $chatGroup->update($validated);

        return response()->json([
            'message' => 'Chat group updated successfully',
            'chat_group' => $chatGroup,
        ]);
    }

    public function addMember(Request $request, ChatGroup $chatGroup)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
        ]);

        if (!$chatGroup->members()->where('user_id', $validated['user_id'])->exists()) {
            $chatGroup->members()->attach($validated['user_id']);
        }

        return response()->json(['message' => 'Member added successfully']);
    }

    public function removeMember(Request $request, ChatGroup $chatGroup)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
        ]);

        $chatGroup->members()->detach($validated['user_id']);

        return response()->json(['message' => 'Member removed successfully']);
    }

    public function destroy(ChatGroup $chatGroup)
    {
        $chatGroup->delete();
        return response()->json(['message' => 'Chat group deleted successfully']);
    }
}
