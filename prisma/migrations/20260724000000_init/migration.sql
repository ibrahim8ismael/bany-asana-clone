-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar_url" TEXT,
    "password_hash" TEXT,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "active_workspace_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "User_active_workspace_id_fkey" FOREIGN KEY ("active_workspace_id") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMember_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Team_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "TeamMember_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "color" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Client_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "client_id" TEXT,
    "team_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "color" TEXT,
    "icon" TEXT,
    "owner_id" TEXT NOT NULL,
    "privacy" TEXT NOT NULL,
    "default_view" TEXT NOT NULL,
    "quality_policy" TEXT NOT NULL DEFAULT 'off',
    "default_reviewer_id" TEXT,
    "review_sla_days" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Project_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_default_reviewer_id_fkey" FOREIGN KEY ("default_reviewer_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProjectMember_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "position" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Section_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Section_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT,
    "client_id" TEXT,
    "parent_task_id" TEXT,
    "section_id" TEXT,
    "title" TEXT NOT NULL,
    "description_rich_text" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT,
    "assignee_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "start_date" DATETIME,
    "due_date" DATETIME,
    "due_time" TEXT,
    "completed_at" DATETIME,
    "approval_state" TEXT,
    "task_type" TEXT NOT NULL DEFAULT 'task',
    "quality_required" BOOLEAN NOT NULL DEFAULT false,
    "quality_policy_override" TEXT,
    "quality_state" TEXT NOT NULL DEFAULT 'not_required',
    "reviewer_id" TEXT,
    "first_submitted_at" DATETIME,
    "original_due_date" DATETIME,
    "rework_due_date" DATETIME,
    "approved_at" DATETIME,
    "quality_score" INTEGER,
    "first_quality_grade" TEXT,
    "final_quality_grade" TEXT,
    "review_cycle_count" INTEGER NOT NULL DEFAULT 0,
    "rework_count" INTEGER NOT NULL DEFAULT 0,
    "quality_blocker_count" INTEGER NOT NULL DEFAULT 0,
    "position" REAL NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Task_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskQualityCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "TaskQualityCriterion_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskQualityReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "grade" TEXT,
    "score" INTEGER,
    "decision" TEXT,
    "submission_note" TEXT,
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_due_at" DATETIME NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "reviewed_at" DATETIME,
    "review_note" TEXT,
    "rework_due_date" DATETIME,
    "affects_score" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "TaskQualityReview_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskQualityReview_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskQualityReview_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskQualityCriterionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "review_id" TEXT NOT NULL,
    "criterion_id" TEXT,
    "criterion_title" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    CONSTRAINT "TaskQualityCriterionResult_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "TaskQualityReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskQualityCriterionResult_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "TaskQualityCriterion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskQualityIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "review_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskQualityIssue_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "TaskQualityReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskProjectLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "section_id" TEXT,
    "position" REAL NOT NULL,
    CONSTRAINT "TaskProjectLink_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskProjectLink_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskProjectLink_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blocking_task_id" TEXT NOT NULL,
    "blocked_task_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'finish_to_start',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDependency_blocking_task_id_fkey" FOREIGN KEY ("blocking_task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskDependency_blocked_task_id_fkey" FOREIGN KEY ("blocked_task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    CONSTRAINT "Tag_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    CONSTRAINT "TaskTag_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CustomField_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomField_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomFieldOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "custom_field_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "position" REAL NOT NULL,
    CONSTRAINT "CustomFieldOption_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "CustomField" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskCustomFieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "custom_field_id" TEXT NOT NULL,
    "value_json" TEXT NOT NULL,
    CONSTRAINT "TaskCustomFieldValue_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskCustomFieldValue_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "CustomField" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body_rich_text" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "edited_at" DATETIME,
    CONSTRAINT "Comment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommentReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    CONSTRAINT "CommentReaction_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentReaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskFollower" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "TaskFollower_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskFollower_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "meta_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "related_entity_type" TEXT NOT NULL,
    "related_entity_id" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "snoozed_until" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminAccessRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "requested_role" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "review_note" TEXT,
    "reviewed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "AdminAccessRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminAccessRequest_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminAccessRequest_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "team_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_value" REAL,
    "current_value" REAL,
    "start_date" DATETIME,
    "due_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Goal_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Goal_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goal_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    CONSTRAINT "GoalLink_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Portfolio_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Portfolio_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolio_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "position" REAL NOT NULL,
    CONSTRAINT "PortfolioProject_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortfolioProject_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Budget_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Form_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Form_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "form_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "config_json" TEXT,
    "position" REAL NOT NULL,
    CONSTRAINT "FormField_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "Form" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "form_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT,
    "response_json" TEXT NOT NULL,
    "created_task_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormSubmission_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "Form" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trigger_type" TEXT NOT NULL,
    "conditions_json" TEXT NOT NULL,
    "actions_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "AutomationRule_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template_json" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ProjectTemplate_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectTemplate_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AsanaConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL DEFAULT 'pat',
    "access_token_encrypted" TEXT NOT NULL,
    "asana_workspace_gid" TEXT NOT NULL,
    "asana_workspace_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_inventory_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "AsanaConnection_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AsanaConnection_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connection_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'asana',
    "kind" TEXT NOT NULL DEFAULT 'inventory',
    "status" TEXT NOT NULL DEFAULT 'running',
    "phase" TEXT,
    "cursor_json" TEXT,
    "summary_json" TEXT,
    "error_message" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ImportRun_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "AsanaConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportRun_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportRun_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalObjectMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connection_id" TEXT NOT NULL,
    "import_run_id" TEXT,
    "source_type" TEXT NOT NULL,
    "source_gid" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "source_modified_at" DATETIME,
    "source_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ExternalObjectMap_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "AsanaConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalObjectMap_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "ImportRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "import_run_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source_type" TEXT,
    "source_gid" TEXT,
    "message" TEXT NOT NULL,
    "details_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportIssue_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "ImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_active_workspace_id_idx" ON "User"("active_workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_user_id_role_idx" ON "WorkspaceMember"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspace_id_user_id_key" ON "WorkspaceMember"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "Team_workspace_id_name_idx" ON "Team"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_team_id_user_id_key" ON "TeamMember"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "Client_workspace_id_archived_updated_at_idx" ON "Client"("workspace_id", "archived", "updated_at");

-- CreateIndex
CREATE INDEX "Project_workspace_id_archived_updated_at_idx" ON "Project"("workspace_id", "archived", "updated_at");

-- CreateIndex
CREATE INDEX "Project_client_id_status_idx" ON "Project"("client_id", "status");

-- CreateIndex
CREATE INDEX "Project_team_id_idx" ON "Project"("team_id");

-- CreateIndex
CREATE INDEX "Project_default_reviewer_id_idx" ON "Project"("default_reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_project_id_user_id_key" ON "ProjectMember"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "Section_project_id_position_idx" ON "Section"("project_id", "position");

-- CreateIndex
CREATE INDEX "Section_user_id_position_idx" ON "Section"("user_id", "position");

-- CreateIndex
CREATE INDEX "Task_workspace_id_archived_status_idx" ON "Task"("workspace_id", "archived", "status");

-- CreateIndex
CREATE INDEX "Task_project_id_section_id_position_idx" ON "Task"("project_id", "section_id", "position");

-- CreateIndex
CREATE INDEX "Task_client_id_project_id_status_idx" ON "Task"("client_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "Task_assignee_id_archived_due_date_idx" ON "Task"("assignee_id", "archived", "due_date");

-- CreateIndex
CREATE INDEX "Task_workspace_id_first_submitted_at_idx" ON "Task"("workspace_id", "first_submitted_at");

-- CreateIndex
CREATE INDEX "Task_reviewer_id_quality_state_idx" ON "Task"("reviewer_id", "quality_state");

-- CreateIndex
CREATE INDEX "Task_parent_task_id_position_idx" ON "Task"("parent_task_id", "position");

-- CreateIndex
CREATE INDEX "TaskQualityCriterion_task_id_position_idx" ON "TaskQualityCriterion"("task_id", "position");

-- CreateIndex
CREATE INDEX "TaskQualityReview_reviewer_id_status_review_due_at_idx" ON "TaskQualityReview"("reviewer_id", "status", "review_due_at");

-- CreateIndex
CREATE INDEX "TaskQualityReview_submitted_by_id_submitted_at_idx" ON "TaskQualityReview"("submitted_by_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "TaskQualityReview_task_id_cycle_number_key" ON "TaskQualityReview"("task_id", "cycle_number");

-- CreateIndex
CREATE INDEX "TaskQualityCriterionResult_criterion_id_idx" ON "TaskQualityCriterionResult"("criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskQualityCriterionResult_review_id_criterion_id_key" ON "TaskQualityCriterionResult"("review_id", "criterion_id");

-- CreateIndex
CREATE INDEX "TaskQualityIssue_review_id_severity_idx" ON "TaskQualityIssue"("review_id", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "TaskProjectLink_task_id_project_id_key" ON "TaskProjectLink"("task_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_blocking_task_id_blocked_task_id_key" ON "TaskDependency"("blocking_task_id", "blocked_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTag_task_id_tag_id_key" ON "TaskTag"("task_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCustomFieldValue_task_id_custom_field_id_key" ON "TaskCustomFieldValue"("task_id", "custom_field_id");

-- CreateIndex
CREATE INDEX "Comment_task_id_created_at_idx" ON "Comment"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "CommentReaction_comment_id_user_id_emoji_key" ON "CommentReaction"("comment_id", "user_id", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "TaskFollower_task_id_user_id_key" ON "TaskFollower"("task_id", "user_id");

-- CreateIndex
CREATE INDEX "ActivityLog_workspace_id_created_at_idx" ON "ActivityLog"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "ActivityLog_entity_type_entity_id_created_at_idx" ON "ActivityLog"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "Notification_user_id_is_read_created_at_idx" ON "Notification"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "AdminAccessRequest_status_created_at_idx" ON "AdminAccessRequest"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "GoalLink_goal_id_entity_type_entity_id_key" ON "GoalLink"("goal_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioProject_portfolio_id_project_id_key" ON "PortfolioProject"("portfolio_id", "project_id");

-- CreateIndex
CREATE INDEX "AsanaConnection_created_by_status_idx" ON "AsanaConnection"("created_by", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AsanaConnection_workspace_id_asana_workspace_gid_key" ON "AsanaConnection"("workspace_id", "asana_workspace_gid");

-- CreateIndex
CREATE INDEX "ImportRun_workspace_id_status_created_at_idx" ON "ImportRun"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ImportRun_connection_id_created_at_idx" ON "ImportRun"("connection_id", "created_at");

-- CreateIndex
CREATE INDEX "ExternalObjectMap_target_type_target_id_idx" ON "ExternalObjectMap"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ExternalObjectMap_import_run_id_idx" ON "ExternalObjectMap"("import_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalObjectMap_connection_id_source_type_source_gid_key" ON "ExternalObjectMap"("connection_id", "source_type", "source_gid");

-- CreateIndex
CREATE INDEX "ImportIssue_import_run_id_severity_idx" ON "ImportIssue"("import_run_id", "severity");

-- CreateIndex
CREATE INDEX "ImportIssue_source_type_source_gid_idx" ON "ImportIssue"("source_type", "source_gid");
