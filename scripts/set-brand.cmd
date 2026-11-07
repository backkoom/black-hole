@echo off
rem Brand asset switcher (ASCII only on purpose: cmd parses .cmd files in the OEM
rem codepage, so non-ASCII text here gets mangled. Chinese messages come from set-brand.sh.)
chcp 65001 >nul
setlocal
set "BASH=D:\Agent\WorkBuddy\resources\vendor\PortableGit\bin\bash.exe"

if "%~2"=="" (
  echo.
  "%BASH%" "%~dp0set-brand.sh"
  echo.
  echo   How to use: drag TWO image files onto this .cmd at once
  echo               vertical for GitHub, horizontal for the app
  echo.
  pause
  exit /b 2
)

set "DEPLOY="
choice /c YN /n /m "Deploy to 192.168.102.102 after build? [Y/N] "
if not errorlevel 2 set "DEPLOY=--deploy"

echo.
"%BASH%" "%~dp0set-brand.sh" "%~1" "%~2" %DEPLOY%
set RC=%ERRORLEVEL%

echo.
if %RC% neq 0 (echo FAILED, exit code %RC%) else (echo DONE)
pause
exit /b %RC%
