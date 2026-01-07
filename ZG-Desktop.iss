; ============================================================
; ZG-Desktop Inno Setup 腳本
; ============================================================

[Setup]
AppName=ZG-Desktop
AppVersion=1.0.9
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
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ZG-MaintenanceBridge"; ValueData: """{app}\resources\ZG-MaintenanceBridge\ZG-MaintenanceBridge.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\ZG-Desktop.exe"; Description: "啟動 ZG-Desktop"; Flags: nowait postinstall skipifsilent
Filename: "{app}\resources\ZG-MaintenanceBridge\ZG-MaintenanceBridge.exe"; Flags: nowait

[Code]
function GetOldAdminUninstallString(): String;
var
  sUnInstPath: String;
begin
  Result := '';
  sUnInstPath := '';

  if IsWin64 then
  begin
    if RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ZG-Desktop_is1', 'UninstallString', sUnInstPath) then
    begin
      Result := sUnInstPath;
      Exit;
    end;
  end;

  if RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ZG-Desktop_is1', 'UninstallString', sUnInstPath) then
  begin
    Result := sUnInstPath;
    Exit;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  sUnInstString: String;
  iResultCode: Integer;
begin
  if (CurStep = ssInstall) then
  begin
    sUnInstString := GetOldAdminUninstallString();
    if sUnInstString <> '' then
    begin
      StringChange(sUnInstString, '"', '');
      ShellExec('runas', sUnInstString, '/SILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_SHOW, ewWaitUntilTerminated, iResultCode);
    end;
  end;
end;