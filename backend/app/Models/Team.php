<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Team extends Model
{
    use HasFactory;

    protected $fillable = [
        'owner_id',
        'name',
        'description',
        'logo',
    ];

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function members()
    {
        return $this->belongsToMany(User::class, 'team_members');
    }

    public function projects()
    {
        return $this->hasMany(Project::class);
    }

    public function chatGroups()
    {
        return $this->hasMany(ChatGroup::class);
    }

    public function messages()
    {
        return $this->morphMany(Message::class, 'messageable');
    }
}
