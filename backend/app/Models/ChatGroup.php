<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ChatGroup extends Model
{
    use HasFactory;

    protected $fillable = [
        'team_id',
        'name',
        'description',
        'is_group',
    ];

    protected $casts = [
        'is_group' => 'boolean',
    ];

    public function team()
    {
        return $this->belongsTo(Team::class);
    }

    public function members()
    {
        return $this->belongsToMany(User::class, 'chat_members');
    }

    public function messages()
    {
        return $this->morphMany(Message::class, 'messageable');
    }
}
