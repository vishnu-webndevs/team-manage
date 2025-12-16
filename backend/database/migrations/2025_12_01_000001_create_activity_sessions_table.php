<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('activity_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('task_id');
            $table->unsignedBigInteger('project_id')->nullable();
            $table->string('app_name');
            $table->string('window_title')->nullable();
            $table->text('url')->nullable();
            $table->dateTime('start_time');
            $table->dateTime('end_time');
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->unsignedInteger('keyboard_clicks')->default(0);
            $table->unsignedInteger('mouse_clicks')->default(0);
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('task_id')->references('id')->on('tasks')->onDelete('cascade');
            $table->foreign('project_id')->references('id')->on('projects')->onDelete('set null');

            $table->index(['user_id']);
            $table->index(['task_id']);
            $table->index(['project_id']);
            $table->index(['start_time']);
            $table->index(['end_time']);
            $table->index(['user_id', 'task_id']);
            $table->index(['user_id', 'task_id', 'start_time']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_sessions');
    }
};
