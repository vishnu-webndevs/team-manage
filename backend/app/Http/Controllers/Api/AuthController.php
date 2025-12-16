<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        $token = $user->createToken('api-token')->plainTextToken;

        $user->load('roles');

        return response()->json([
            'message' => 'User registered successfully',
            'user' => $user,
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        $token = $user->createToken('api-token')->plainTextToken;

        $user->load('roles');

        return response()->json([
            'message' => 'User logged in successfully',
            'user' => $user,
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $token = $request->user()->currentAccessToken();
        if ($token) {
            $token->delete();
        }

        return response()->json(['message' => 'User logged out successfully']);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('roles');
        return response()->json($user);
    }

    public function updateMe(Request $request)
    {
        $user = $request->user();
        $validated = $request->validate([
            'bio' => 'nullable|string',
        ]);
        if (array_key_exists('bio', $validated)) {
            $user->bio = $validated['bio'];
        }
        $user->save();
        return response()->json($user->fresh());
    }

    public function getAllUsers(Request $request)
    {
        $user = auth()->user();
        
        // Only admin and project managers can get all users list
        if (!$user->hasRole('admin') && !$user->hasRole('project_manager')) {
            // Regular employees can only see themselves
            return response()->json([
                'data' => [$user->only(['id', 'name', 'email'])]
            ]);
        }
        
        // Admin/Manager can see all users
        $users = User::select('id', 'name', 'email', 'bio')
            ->orderBy('name')
            ->get();
        
        return response()->json([
            'data' => $users
        ]);
    }
}
