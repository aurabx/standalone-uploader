# Using Jumble in This Project

This project uses Jumble to provide AI agents with structured context about the codebase.

## Getting Started

1. **Always start by calling `get_workspace_overview()`** from the Jumble MCP server to understand the project structure.

2. **Check the project constitution** in `.ai/constitution.md` for any project-specific guidelines and rules that should be followed.

3. **Use the Jumble tools** to access project metadata before making changes.

## When to Use Jumble Tools

### Before suggesting commands
- Call `get_commands(project, type)` to get exact build/test/lint/run commands
- Never guess commands when Jumble can provide them

### Before making architectural changes
- Call `get_architecture(project, concept)` to understand existing patterns
- Use `get_related_files(project, query)` to find related code

### Before writing new code
- Call `get_conventions(project)` for project-specific patterns
- Call `get_workspace_conventions()` for workspace-wide standards
- Review both conventions AND gotchas

### Before searching for documentation
- Call `get_docs(project)` to see available documentation
- Use topic names to get specific doc paths

## Project Guidelines

See `.ai/constitution.md` for project-specific guidelines, conventions, and any special instructions for AI agents working on this codebase.

## Available Jumble Tools

- `list_projects` - List all projects in workspace
- `get_workspace_overview` - Workspace structure and dependencies
- `get_workspace_conventions` - Workspace-level conventions/gotchas
- `get_project_info` - Project metadata and structure
- `get_commands` - Build/test/lint/run commands
- `get_architecture` - Architectural concepts and files
- `get_related_files` - Find files by concept
- `get_conventions` - Project conventions and gotchas
- `get_docs` - Documentation index
- `list_skills` / `get_skill` - Task-specific guidance
