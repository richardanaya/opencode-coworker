<img width="400" alt="image" src="https://github.com/user-attachments/assets/f8533501-7ebc-4f39-ba2f-b0749d2a25b2" />


# opencode-coworker

Create named sessions as coworkers you can send messages to by name.

## Description

This OpenCode plugin enables you to create and manage persistent AI coworker sessions. Each coworker is a named session with a specific agent type that can be messaged and assigned tasks independently.

**IMPORTANT: this plugin is meant to be ultra simplistic, it effectively just gives you named sessions and does not have features like session cross-talk. Ideally coworkers talking autonomously to each other would be handled by a seperate plugin that you choose is appropriate.  This tool just allows you to create the async sessions and bump them to get them started sometimes explicitly.**


**WARNING: warning, there is no protection from unbounded cycles of communication between coworkers! use this plugin responsibly**

## Installation

```bash
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-coworker"
  ]
  ...
}
```

## Usage

The plugin provides three tools and one command:

### Tools

- **create_coworker** - Create a new coworker with a name and agent type
- **list_coworkers** - List all existing coworkers and their status
- **tell_coworker** - Send a message or task to a specific coworker

### Command

- **/coworkers** - List all coworkers (formatted view)

## API

### create_coworker

Create a new coworker session.

**Parameters:**
- `name` (string, required) - User-friendly name for this coworker
- `agent_type` (string, optional) - Agent type to use (e.g., code, researcher). Defaults to 'code'
- `prompt` (string, required) - Initial prompt/task for the coworker

### tell_coworker

Send a message to an existing coworker.

**Parameters:**
- `name` (string, required) - Name of the coworker to message
- `message` (string, required) - Message or task to send to the coworker

### list_coworkers

List all coworkers and their current status.

## Storage

Coworker data is persisted in `~/.config/opencode/coworkers.json`.

## Requirements

- Peer dependency: `@opencode-ai/plugin` ^1.1.25

## License

MIT

## Repository

https://github.com/richardanaya/opencode-coworker
