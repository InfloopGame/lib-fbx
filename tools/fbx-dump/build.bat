@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not defined FBX_SDK_ROOT if defined FBXSDK_ROOT set "FBX_SDK_ROOT=%FBXSDK_ROOT%"
if not defined FBX_SDK_ROOT (
  echo FBX_SDK_ROOT is not set.
  echo Set it to the Autodesk FBX SDK install root, e.g.:
  echo   set FBX_SDK_ROOT=D:\Tools\FBX SDK\2020.2.1
  exit /b 1
)
if not exist "%FBX_SDK_ROOT%\include\fbxsdk.h" (
  echo FBX SDK not found: %FBX_SDK_ROOT%
  echo Expected include\fbxsdk.h under FBX_SDK_ROOT.
  exit /b 1
)

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VCVARS="
if exist "%VSWHERE%" (
  for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
    if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=%%i\VC\Auxiliary\Build\vcvars64.bat"
  )
)

if not defined VCVARS (
  echo MSVC not found. Install Visual Studio 2022 Build Tools with C++ workload.
  echo   winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  exit /b 1
)

call "%VCVARS%" >nul
if errorlevel 1 exit /b 1

if not exist build mkdir build
cmake -S . -B build -G "Ninja" -DCMAKE_BUILD_TYPE=Release -DFBX_SDK_ROOT="%FBX_SDK_ROOT%"
if errorlevel 1 (
  cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DFBX_SDK_ROOT="%FBX_SDK_ROOT%"
  if errorlevel 1 exit /b 1
  cmake --build build --config Release
) else (
  cmake --build build --config Release
)
if errorlevel 1 exit /b 1

if exist build\Release\fbx-dump.exe (
  copy /Y build\Release\fbx-dump.exe .\fbx-dump.exe >nul
) else if exist build\fbx-dump.exe (
  copy /Y build\fbx-dump.exe .\fbx-dump.exe >nul
)

echo.
echo Built: %cd%\fbx-dump.exe
echo Usage: fbx-dump.exe scene.fbx [-o out.json]
endlocal
