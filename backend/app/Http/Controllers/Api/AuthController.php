<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Laravel\Socialite\Facades\Socialite;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Events\Verified;
use Illuminate\Foundation\Auth\EmailVerificationRequest;

class AuthController extends Controller
{
    public function verifyEmail(Request $request, $id, $hash)
    {
        $user = User::findOrFail($id);

        if (!hash_equals((string) $hash, sha1($user->getEmailForVerification()))) {
             return response()->json(['message' => 'Invalid verification link'], 403);
        }

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email already verified']);
        }

        if ($user->markEmailAsVerified()) {
            event(new Verified($user));
        }

        // Redirect to frontend login page with success message
        $frontendUrl = env('FRONTEND_URL', 'http://localhost:3000');
        return redirect("$frontendUrl/login?verified=true");
    }

    public function resendVerificationEmail(Request $request)
    {
        if ($request->user()->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email already verified']);
        }

        $request->user()->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification link sent']);
    }

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

        event(new Registered($user));
        $user->sendEmailVerificationNotification();

        $token = $user->createToken('api-token')->plainTextToken;

        $user->load('roles');

        return response()->json([
            'message' => 'User registered successfully. Please verify your email.',
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

        if (!$user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email not verified.'], 403);
        }

        $token = $user->createToken('api-token')->plainTextToken;

        $user->load('roles');

        return response()->json([
            'message' => 'User logged in successfully',
            'user' => $user,
            'token' => $token,
        ]);
    }

    public function redirectToGoogle()
    {
        $url = Socialite::driver('google')->stateless()->redirect()->getTargetUrl();
        return response()->json(['url' => $url]);
    }

    public function handleGoogleCallback()
    {
        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
            
            $user = User::where('email', $googleUser->getEmail())->first();

            if (!$user) {
                $user = User::create([
                    'name' => $googleUser->getName(),
                    'email' => $googleUser->getEmail(),
                    'google_id' => $googleUser->getId(),
                    'avatar' => $googleUser->getAvatar(),
                    'password' => Hash::make(uniqid()), // Random password
                    'email_verified_at' => now(), // Google emails are verified
                ]);
                event(new Registered($user));
            } else {
                if (!$user->google_id) {
                    $user->update([
                        'google_id' => $googleUser->getId(),
                        'avatar' => $user->avatar ?: $googleUser->getAvatar(),
                        'email_verified_at' => $user->email_verified_at ?: now(),
                    ]);
                }
            }

            $token = $user->createToken('api-token')->plainTextToken;
            $user->load('roles');

            // We need to return an HTML page that posts the token back to the opener or redirects
            // Since this is a callback, it's a GET request from the browser.
            // We can redirect to the frontend with the token in URL query param (risky) or a temporary code.
            // Or simpler: redirect to frontend with token.
            
            $frontendUrl = env('FRONTEND_URL', 'http://localhost:3000');
            return redirect("$frontendUrl/auth/google/callback?token=$token");

        } catch (\Exception $e) {
            return response()->json(['error' => 'Google login failed', 'message' => $e->getMessage()], 500);
        }
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
