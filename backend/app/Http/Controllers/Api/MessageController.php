<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use App\Models\ChatGroup;
use Illuminate\Http\Request;

class MessageController extends Controller
{
    public function getChatGroupMessages(ChatGroup $chatGroup, Request $request)
    {
        $messages = $chatGroup->messages()
            ->with('sender')
            ->orderBy('created_at', 'desc')
            ->paginate($request->query('per_page', 20));

        return response()->json($messages);
    }

    public function sendMessage(ChatGroup $chatGroup, Request $request)
    {
        $validated = $request->validate([
            'content' => 'required|string|max:5000',
        ]);

        $message = Message::create([
            'sender_id' => auth()->id(),
            'content' => $validated['content'],
            'messageable_id' => $chatGroup->id,
            'messageable_type' => ChatGroup::class,
        ]);

        return response()->json([
            'message' => 'Message sent successfully',
            'data' => $message->load('sender'),
        ], 201);
    }

    public function editMessage(Message $message, Request $request)
    {
        if ($message->sender_id !== auth()->id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        $validated = $request->validate([
            'content' => 'required|string|max:5000',
        ]);
        $message->content = $validated['content'];
        $message->save();
        return response()->json([
            'message' => 'Message updated successfully',
            'data' => $message->load('sender')
        ]);
    }

    public function deleteMessage(Message $message)
    {
        if ($message->sender_id !== auth()->id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $message->delete();
        return response()->json(['message' => 'Message deleted successfully']);
    }
}
