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
        Schema::create('screenshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('task_id')->constrained()->onDelete('cascade');
            $table->string('image_path');
            $table->integer('keyboard_clicks')->default(0);
            $table->integer('mouse_clicks')->default(0);
            $table->decimal('activity_percentage', 5, 2)->default(0);
            $table->timestamp('activity_start_time')->nullable();
            $table->timestamp('activity_end_time')->nullable();
            $table->json('minute_breakdown')->nullable();
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['task_id']);
            $table->index(['created_at']);
            $table->index(['activity_start_time']);
            $table->index(['activity_end_time']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('screenshots');
    }
};
