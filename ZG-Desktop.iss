; ============================================================
; ZG-Desktop Inno Setup 腳本
; ============================================================

[Setup]
AppName=ZG-Desktop
AppVersion=1.0.0
AppPublisher=zssdmrofficial
DefaultDirName={autopf}\ZG-Desktop
DefaultGroupName=ZG-Desktop
OutputBaseFilename=ZG-Desktop-Setup
Compression=lzma
SolidCompression=yes
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\ZG-Desktop.exe

[Files]
Source: "C:\dev\ZG-Desktop\out\ZG-Desktop-win32-x64\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\ZG-Desktop"; Filename: "{app}\ZG-Desktop.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\ZG-Desktop"; Filename: "{app}\ZG-Desktop.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\ZG-Desktop.exe"; Description: "啟動 ZG-Desktop"; Flags: nowait postinstall skipifsilent
