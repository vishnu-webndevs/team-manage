<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('time_tracks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('task_id')->nullable()->constrained('tasks')->onDelete('set null');
            $table->foreignId('project_id')->nullable()->constrained('projects')->onDelete('set null');
            $table->dateTime('start_time');
            $table->dateTime('end_time')->nullable();
            $table->integer('duration_seconds')->nullable();
            $table->text('description')->nullable();
            $table->string('activity')->nullable();
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['task_id']);
            $table->index(['project_id']);
            $table->index(['start_time']);
            $table->index(['user_id', 'task_id']);
            $table->index(['user_id', 'task_id', 'start_time']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('time_tracks');
    }
};
