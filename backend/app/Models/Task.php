<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'created_by',
        'assigned_to',
        'title',
        'description',
        'status',
        'priority',
        'estimated_hours',
        'time_reset_policy',
        'due_date',
    ];

    protected $casts = [
        'due_date' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function timeTracks()
    {
        return $this->hasMany(TimeTrack::class);
    }

    public function logs()
    {
        return $this->morphMany(TaskLog::class, 'loggable');
    }

    public function messages()
    {
        return $this->morphMany(Message::class, 'messageable');
    }

    public function screenshots()
    {
        return $this->hasMany(Screenshot::class);
    }
}
