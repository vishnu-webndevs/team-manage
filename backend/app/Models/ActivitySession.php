<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivitySession extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'task_id',
        'project_id',
        'app_name',
        'window_title',
        'url',
        'start_time',
        'end_time',
        'duration_seconds',
        'keyboard_clicks',
        'mouse_clicks',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
