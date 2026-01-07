# TestSprite MCP Configuration Guide

## Step 1: Locate Claude Desktop Config File

**Windows Path:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Full Path (typically):**
```
C:\Users\eneas\AppData\Roaming\Claude\claude_desktop_config.json
```

## Step 2: Open the Configuration File

1. Press `Win + R`
2. Type: `%APPDATA%\Claude`
3. Press Enter
4. Open `claude_desktop_config.json` with a text editor (Notepad, VS Code, etc.)

## Step 3: Add TestSprite MCP Configuration

If the file is **empty** or has `{}`, replace it with:

```json
{
  "mcpServers": {
    "TestSprite": {
      "command": "npx",
      "args": [
        "@testsprite/testsprite-mcp@latest"
      ],
      "env": {
        "API_KEY": "sk-user--PNblV8yM0lbDNSEdGEkCBElBGGgvk_jGTz3A59H2NkoGugPn_7rYBBo7NkG9JcFwlg2AuX6IXSVkvVxuK3ktX3ESjRiaPkcslkzDK0b9xFsZlKuoiXEb6m0yCOhzCxsCK8"
      }
    }
  }
}
```

If the file **already has other MCP servers**, add TestSprite to the existing `mcpServers` object:

```json
{
  "mcpServers": {
    "existing-server": {
      ...
    },
    "TestSprite": {
      "command": "npx",
      "args": [
        "@testsprite/testsprite-mcp@latest"
      ],
      "env": {
        "API_KEY": "sk-user--PNblV8yM0lbDNSEdGEkCBElBGGgvk_jGTz3A59H2NkoGugPn_7rYBBo7NkG9JcFwlg2AuX6IXSVkvVxuK3ktX3ESjRiaPkcslkzDK0b9xFsZlKuoiXEb6m0yCOhzCxsCK8"
      }
    }
  }
}
```

## Step 4: Save and Restart Claude Desktop

1. **Save** the `claude_desktop_config.json` file
2. **Completely close** Claude Desktop (check system tray)
3. **Reopen** Claude Desktop

## Step 5: Verify Installation

After restarting, you should see TestSprite in the MCP servers list in Claude Desktop.

## Troubleshooting

### If TestSprite doesn't appear:

1. **Check JSON syntax** — Use a JSON validator (jsonlint.com)
2. **Verify path** — Ensure config file is in correct location
3. **Check logs** — Look for errors in Claude Desktop logs
4. **Reinstall npx** — Run: `npm install -g npx`

### Common Issues:

**"Command not found: npx"**
- Install Node.js from nodejs.org
- Restart your terminal/Claude Desktop

**"Invalid API Key"**
- Double-check the API key is exactly:
  ```
  sk-user--PNblV8yM0lbDNSEdGEkCBElBGGgvk_jGTz3A59H2NkoGugPn_7rYBBo7NkG9JcFwlg2AuX6IXSVkvVxuK3ktX3ESjRiaPkcslkzDK0b9xFsZlKuoiXEb6m0yCOhzCxsCK8
  ```

## What is TestSprite?

TestSprite is an MCP server that provides automated testing capabilities for your applications. Once configured, you'll have access to TestSprite tools within Claude Desktop.

## Next Steps

After successful installation:
1. TestSprite will appear in your MCP servers
2. You can use TestSprite commands directly in Claude conversations
3. Check TestSprite documentation for available features

---

**Your API Key (save this):**
```
sk-user--PNblV8yM0lbDNSEdGEkCBElBGGgvk_jGTz3A59H2NkoGugPn_7rYBBo7NkG9JcFwlg2AuX6IXSVkvVxuK3ktX3ESjRiaPkcslkzDK0b9xFsZlKuoiXEb6m0yCOhzCxsCK8
```
