<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\Project;
use App\Models\Task;
use App\Models\Role;
use App\Models\Permission;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Create roles
        $adminRole = Role::create([
            'name' => 'admin',
            'description' => 'Administrator with full access',
        ]);

        $projectManagerRole = Role::create([
            'name' => 'project_manager',
            'description' => 'Project manager can create, edit projects and tasks, and assign to employees',
        ]);

        $memberRole = Role::create([
            'name' => 'member',
            'description' => 'Team member with limited access',
        ]);

        $viewerRole = Role::create([
            'name' => 'viewer',
            'description' => 'Viewer with read-only access',
        ]);

        // Create permissions
        $permissions = [
            'create_team',
            'edit_team',
            'delete_team',
            'create_project',
            'edit_project',
            'delete_project',
            'create_task',
            'edit_task',
            'delete_task',
            'assign_task',
            'manage_team_members',
            'view_reports',
        ];

        foreach ($permissions as $permission) {
            Permission::create([
                'name' => $permission,
                'description' => ucfirst(str_replace('_', ' ', $permission)),
            ]);
        }

        // Assign permissions to roles
        $adminPermissions = Permission::all();
        $adminRole->permissions()->attach($adminPermissions);

        $projectManagerPermissions = Permission::whereIn('name', [
            'create_project',
            'edit_project',
            'create_task',
            'edit_task',
            'assign_task',
            'view_reports',
        ])->get();
        $projectManagerRole->permissions()->attach($projectManagerPermissions);

        $memberPermissions = Permission::whereNotIn('name', [
            'delete_team',
            'delete_project',
            'delete_task',
            'manage_team_members',
        ])->get();
        $memberRole->permissions()->attach($memberPermissions);

        $viewerPermissions = Permission::whereIn('name', [
            'view_reports',
        ])->get();
        $viewerRole->permissions()->attach($viewerPermissions);

        // Create sample users
        $user1 = User::create([
            'name' => 'Hitesh',
            'email' => 'hitesh@example.com',
            'password' => bcrypt('password123'),
            'phone' => '+1234567890',
            'bio' => 'Admin',
        ]);
        $user1->email_verified_at = now();
        $user1->save();

        $user2 = User::create([
            'name' => 'developer',
            'email' => 'developer@example.com',
            'password' => bcrypt('password123'),
            'phone' => '+0987654321',
            'bio' => 'Project Manager',
        ]);
        $user2->email_verified_at = now();
        $user2->save();

        $user3 = User::create([
            'name' => 'Vishnu',
            'email' => 'vishnu@example.com',
            'password' => bcrypt('password123'),
            'phone' => '+5544332211',
            'bio' => 'Employee',
        ]);
        $user3->email_verified_at = now();
        $user3->save();

        // Assign roles to users
        $user1->roles()->attach($adminRole);
        $user2->roles()->attach($projectManagerRole);
        $user3->roles()->attach($memberRole);

        // Create sample teams
        $team1 = Team::create([
            'owner_id' => $user1->id,
            'name' => 'Development Team',
            'description' => 'Our main development team',
        ]);

        $team2 = Team::create([
            'owner_id' => $user1->id,
            'name' => 'Design Team',
            'description' => 'Creative and design team',
        ]);

        // Add team members
        TeamMember::create([
            'team_id' => $team1->id,
            'user_id' => $user1->id,
            'role' => 'admin',
        ]);

        TeamMember::create([
            'team_id' => $team1->id,
            'user_id' => $user2->id,
            'role' => 'project_manager',
        ]);

        TeamMember::create([
            'team_id' => $team1->id,
            'user_id' => $user3->id,
            'role' => 'member',
        ]);


        TeamMember::create([
            'team_id' => $team2->id,
            'user_id' => $user1->id,
            'role' => 'admin',
        ]);

        TeamMember::create([
            'team_id' => $team2->id,
            'user_id' => $user3->id,
            'role' => 'member',
        ]);

        // Create sample projects
        $project1 = Project::create([
            'team_id' => $team1->id,
            'owner_id' => $user1->id,
            'name' => 'Mobile App Development',
            'description' => 'Develop mobile application for iOS and Android',
            'status' => 'active',
            'start_date' => now(),
            'end_date' => now()->addMonths(3),
        ]);

        $project2 = Project::create([
            'team_id' => $team2->id,
            'owner_id' => $user1->id,
            'name' => 'Website Redesign',
            'description' => 'Redesign company website',
            'status' => 'active',
            'start_date' => now(),
            'end_date' => now()->addMonths(2),
        ]);

        // Create sample tasks
        $task1 = Task::create([
            'project_id' => $project1->id,
            'created_by' => $user2->id,
            'assigned_to' => $user3->id,
            'title' => 'Setup project structure',
            'description' => 'Create project directories and configuration files',
            'status' => 'in_progress',
            'priority' => 'high',
            'estimated_hours' => 8,
            'due_date' => now()->addDays(3),
        ]);


        $task2 = Task::create([
            'project_id' => $project2->id,
            'created_by' => $user1->id,
            'assigned_to' => $user3->id,
            'title' => 'Design homepage',
            'description' => 'Create mockups for the new homepage',
            'status' => 'todo',
            'priority' => 'high',
            'estimated_hours' => 12,
            'due_date' => now()->addDays(4),
        ]);
    }
}
