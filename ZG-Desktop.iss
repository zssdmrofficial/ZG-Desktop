; ============================================================
; ZG-Desktop Inno Setup 腳本
; ============================================================

[Setup]
AppName=ZG-Desktop
AppVersion=1.0.8
AppPublisher=zssdmrofficial
DefaultDirName={userpf}\ZG-Desktop
DefaultGroupName=ZG-Desktop
OutputBaseFilename=ZG-Desktop-Setup
Compression=lzma
SolidCompression=yes
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\ZG-Desktop.exe
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

[Files]
Source: "out\ZG-Desktop-win32-x64\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\ZG-Desktop"; Filename: "{app}\ZG-Desktop.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\ZG-Desktop"; Filename: "{app}\ZG-Desktop.exe"; WorkingDir: "{app}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ZG-UpdateHelper"; ValueData: """{app}\resources\update-helper\ZG-UpdateHelper.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\ZG-Desktop.exe"; Description: "啟動 ZG-Desktop"; Flags: nowait postinstall skipifsilent
Filename: "{app}\resources\update-helper\ZG-UpdateHelper.exe"; Flags: nowait