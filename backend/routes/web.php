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

// Route to serve screenshots with proper CORS headers
Route::get('/storage/screenshots/{filename}', function ($filename) {
    // Check if file exists
    $path = 'public/screenshots/' . $filename;
    
    if (!Storage::exists($path)) {
        abort(404);
    }
    
    $file = Storage::get($path);
    $mimeType = Storage::mimeType($path);
    
    return response($file, 200)
        ->header('Content-Type', $mimeType)
        ->header('Access-Control-Allow-Origin', 'http://localhost:3000')
        ->header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        ->header('Cache-Control', 'public, max-age=31536000');
})->name('screenshots.serve');
