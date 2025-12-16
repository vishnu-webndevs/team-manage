<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Screenshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'task_id',
        'image_path',
        'keyboard_clicks',
        'mouse_clicks',
        'activity_percentage',
        'activity_start_time',
        'activity_end_time',
        'minute_breakdown',
    ];

    protected $casts = [
        'activity_start_time' => 'datetime',
        'activity_end_time' => 'datetime',
        'minute_breakdown' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function task()
    {
        return $this->belongsTo(Task::class);
    }
}
