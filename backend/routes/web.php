<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\Response;

Route::get('/', function () {
    return response()->json([
        'app' => config('app.name', 'Laravel'),
        'message' => 'Backend API running',
        'version' => app()->version(),
    ], 200);
});

Route::get('/login', function () {
    abort(404);
})->name('login');

Route::get('/register', function () {
    abort(404);
})->name('register');

// Generic route to serve files from public storage with CORS, including nested paths
Route::get('/storage/{path}', function ($path) {
    $storagePath = 'public/' . ltrim($path, '/');
    if (!Storage::exists($storagePath)) {
        abort(404);
    }
    $file = Storage::get($storagePath);
    $mimeType = Storage::mimeType($storagePath) ?: 'application/octet-stream';
    return response($file, 200)
        ->header('Content-Type', $mimeType)
        ->header('Access-Control-Allow-Origin', env('FRONTEND_URL', 'http://localhost:3000'))
        ->header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        ->header('Cache-Control', 'public, max-age=31536000');
})->where('path', '.*')->name('storage.serve');
