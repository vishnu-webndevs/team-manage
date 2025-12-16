<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TimeTrack extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'task_id',
        'project_id',
        'start_time',
        'end_time',
        'duration_seconds',
        'description',
        'activity',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
    ];

    protected static function booted()
    {
        static::saving(function (self $model) {
            $dur = (int) ($model->duration_seconds ?? 0);
            if ($model->start_time && $model->end_time) {
                try {
                    $dur = $model->end_time->diffInSeconds($model->start_time, true);
                } catch (\Throwable $e) {}
            }
            if ($dur < 0) $dur = 0;
            $model->duration_seconds = $dur;
        });
    }

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

    public function getDurationHoursAttribute()
    {
        return $this->duration_seconds ? round($this->duration_seconds / 3600, 2) : 0;
    }
}
