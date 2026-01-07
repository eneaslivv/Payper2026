@echo off
echo ========================================
echo TestSprite MCP Configuration Script
echo ========================================
echo.

REM Define the config file path
set CONFIG_DIR=%APPDATA%\Claude
set CONFIG_FILE=%CONFIG_DIR%\claude_desktop_config.json

echo Checking for Claude Desktop config directory...
if not exist "%CONFIG_DIR%" (
    echo ERROR: Claude Desktop config directory not found at:
    echo %CONFIG_DIR%
    echo.
    echo Please ensure Claude Desktop is installed.
    pause
    exit /b 1
)

echo Config directory found: %CONFIG_DIR%
echo.

REM Check if config file exists
if exist "%CONFIG_FILE%" (
    echo Config file exists. Creating backup...
    copy "%CONFIG_FILE%" "%CONFIG_FILE%.backup" >nul
    echo Backup created: claude_desktop_config.json.backup
    echo.
    
    echo Opening config file for manual editing...
    echo.
    echo INSTRUCTIONS:
    echo 1. Your config file will open in Notepad
    echo 2. Add this TestSprite configuration:
    echo.
    echo    "TestSprite": {
    echo      "command": "npx",
    echo      "args": ["@testsprite/testsprite-mcp@latest"],
    echo      "env": {
    echo        "API_KEY": "sk-user--PNblV8yM0lbDNSEdGEkCBElBGGgvk_jGTz3A59H2NkoGugPn_7rYBBo7NkG9JcFwlg2AuX6IXSVkvVxuK3ktX3ESjRiaPkcslkzDK0b9xFsZlKuoiXEb6m0yCOhzCxsCK8"
    echo      }
    echo    }
    echo.
    echo 3. Save and close Notepad
    echo 4. Restart Claude Desktop
    echo.
    pause
    notepad "%CONFIG_FILE%"
) else (
    echo Config file not found. Creating new configuration...
    
    REM Create new config file with TestSprite
    (
        echo {
        echo   "mcpServers": {
        echo     "TestSprite": {
        echo       "command": "npx",
        echo       "args": [
        echo         "@testsprite/testsprite-mcp@latest"
        echo       ],
        echo       "env": {
        echo         "API_KEY": "sk-user--PNblV8yM0lbDNSEdGEkCBElBGGgvk_jGTz3A59H2NkoGugPn_7rYBBo7NkG9JcFwlg2AuX6IXSVkvVxuK3ktX3ESjRiaPkcslkzDK0b9xFsZlKuoiXEb6m0yCOhzCxsCK8"
        echo       }
        echo     }
        echo   }
        echo }
    ) > "%CONFIG_FILE%"
    
    echo.
    echo SUCCESS! Configuration file created with TestSprite MCP.
    echo.
    echo Opening the config file to verify...
    notepad "%CONFIG_FILE%"
)

echo.
echo ========================================
echo NEXT STEPS:
echo ========================================
echo 1. Close Claude Desktop completely
echo 2. Reopen Claude Desktop
echo 3. TestSprite should appear in MCP servers
echo ========================================
echo.
pause
