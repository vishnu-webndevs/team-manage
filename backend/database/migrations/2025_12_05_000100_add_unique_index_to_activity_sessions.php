<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_sessions', function (Blueprint $table) {
            $table->unique(['user_id', 'task_id', 'app_name', 'start_time', 'end_time'], 'activity_sessions_unique_slot');
        });
    }

    public function down(): void
    {
        Schema::table('activity_sessions', function (Blueprint $table) {
            $table->dropUnique('activity_sessions_unique_slot');
        });
    }
};

