#define NOMINMAX
#include <windows.h>
#include <winhttp.h>
#include <shlobj.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <chrono>
#include <thread>
#include <algorithm>
#include <cctype>

#include "json.hpp"

#pragma comment(lib, "winhttp.lib")

using json = nlohmann::json;

static const wchar_t* kOwner = L"zssdmrofficial";
static const wchar_t* kRepo = L"ZG-Desktop";
static const wchar_t* kAssetName = L"ZG-Desktop-Setup.exe";
static const wchar_t* kUserAgent = L"ZG-Desktop Auto Updater";
static const wchar_t* kMutexName = L"Global\\ZG-Desktop-UpdateHelper";

static std::wstring ToWString(const std::string& value) {
  if (value.empty()) return L"";
  int len = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0);
  std::wstring result(len, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), len);
  return result;
}

static std::string ToString(const std::wstring& value) {
  if (value.empty()) return "";
  int len = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(len, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), len, nullptr, nullptr);
  return result;
}

static std::wstring GetAppDataPath() {
  PWSTR path = nullptr;
  if (FAILED(SHGetKnownFolderPath(FOLDERID_RoamingAppData, 0, nullptr, &path))) {
    return L"";
  }
  std::wstring result(path);
  CoTaskMemFree(path);
  return result;
}

static std::wstring JoinPath(const std::wstring& base, const std::wstring& child) {
  if (base.empty()) return child;
  if (base.back() == L'\\') return base + child;
  return base + L"\\" + child;
}

static std::wstring GetConfigDir() {
  return JoinPath(GetAppDataPath(), L"ZG-Desktop");
}

static std::wstring GetConfigPath() {
  return JoinPath(GetConfigDir(), L"auto-update.json");
}

static std::wstring GetLogPath() {
  return JoinPath(GetConfigDir(), L"update-helper.log");
}

static void EnsureDirectory(const std::wstring& path) {
  CreateDirectoryW(path.c_str(), nullptr);
}

static void Log(const std::string& message) {
  EnsureDirectory(GetConfigDir());
  std::ofstream out(ToString(GetLogPath()), std::ios::app);
  if (!out.is_open()) return;
  const auto now = std::chrono::system_clock::now();
  const auto nowTime = std::chrono::system_clock::to_time_t(now);
  out << std::string(std::ctime(&nowTime)).substr(0, 24) << " - " << message << "\n";
}

static bool ReadAutoUpdateEnabled() {
  std::ifstream in(ToString(GetConfigPath()));
  if (!in.is_open()) return false;
  std::stringstream buffer;
  buffer << in.rdbuf();
  try {
    auto data = json::parse(buffer.str());
    return data.value("enabled", false);
  } catch (...) {
    return false;
  }
}

static std::string Trim(const std::string& value) {
  auto start = value.find_first_not_of(" \t\r\n");
  auto end = value.find_last_not_of(" \t\r\n");
  if (start == std::string::npos || end == std::string::npos) return "";
  return value.substr(start, end - start + 1);
}

static std::string NormalizeVersion(const std::string& value) {
  std::string trimmed = Trim(value);
  if (!trimmed.empty() && (trimmed[0] == 'v' || trimmed[0] == 'V')) {
    trimmed.erase(0, 1);
  }
  return Trim(trimmed);
}

static std::vector<int> ParseVersionSegments(const std::string& value) {
  std::vector<int> segments;
  std::stringstream stream(value);
  std::string part;
  while (std::getline(stream, part, '.')) {
    if (part.empty()) return {};
    size_t i = 0;
    while (i < part.size() && std::isdigit(static_cast<unsigned char>(part[i]))) {
      i++;
    }
    if (i == 0) return {};
    segments.push_back(std::stoi(part.substr(0, i)));
  }
  return segments;
}

static int CompareVersions(const std::string& left, const std::string& right) {
  auto leftSegments = ParseVersionSegments(left);
  auto rightSegments = ParseVersionSegments(right);
  if (leftSegments.empty() || rightSegments.empty()) return 0;
  size_t count = std::max(leftSegments.size(), rightSegments.size());
  for (size_t i = 0; i < count; ++i) {
    int l = i < leftSegments.size() ? leftSegments[i] : 0;
    int r = i < rightSegments.size() ? rightSegments[i] : 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

static bool ReadRegistryStringValue(HKEY root, const std::wstring& subkey, const std::wstring& name, std::wstring* out) {
  HKEY key = nullptr;
  if (RegOpenKeyExW(root, subkey.c_str(), 0, KEY_READ, &key) != ERROR_SUCCESS) return false;
  DWORD type = 0;
  DWORD size = 0;
  if (RegQueryValueExW(key, name.c_str(), nullptr, &type, nullptr, &size) != ERROR_SUCCESS ||
      (type != REG_SZ && type != REG_EXPAND_SZ)) {
    RegCloseKey(key);
    return false;
  }
  std::wstring buffer(size / sizeof(wchar_t), L'\0');
  if (RegQueryValueExW(key, name.c_str(), nullptr, nullptr, reinterpret_cast<LPBYTE>(buffer.data()), &size) != ERROR_SUCCESS) {
    RegCloseKey(key);
    return false;
  }
  RegCloseKey(key);
  buffer.resize((size / sizeof(wchar_t)) - 1);
  *out = buffer;
  return true;
}

static std::string GetInstalledVersionFromRegistry() {
  const std::wstring targetName = L"ZG-Desktop";
  const std::vector<HKEY> rootHandles = { HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER };
  const std::vector<std::wstring> rootKeys = {
    L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    L"SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  };

  for (const auto& rootHandle : rootHandles) {
    for (const auto& rootKey : rootKeys) {
      HKEY key = nullptr;
      if (RegOpenKeyExW(rootHandle, rootKey.c_str(), 0, KEY_READ, &key) != ERROR_SUCCESS) {
        continue;
      }
      DWORD index = 0;
      wchar_t nameBuffer[256];
      DWORD nameSize = static_cast<DWORD>(std::size(nameBuffer));
      while (RegEnumKeyExW(key, index, nameBuffer, &nameSize, nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS) {
        std::wstring subkey = rootKey + L"\\" + nameBuffer;
        std::wstring displayName;
        if (ReadRegistryStringValue(rootHandle, subkey, L"DisplayName", &displayName) && displayName == targetName) {
          std::wstring displayVersion;
          if (ReadRegistryStringValue(rootHandle, subkey, L"DisplayVersion", &displayVersion)) {
            RegCloseKey(key);
            return ToString(displayVersion);
          }
        }
        nameSize = static_cast<DWORD>(std::size(nameBuffer));
        index++;
      }
      RegCloseKey(key);
    }
  }
  return "";
}

static std::string GetFileVersion(const std::wstring& path) {
  DWORD handle = 0;
  DWORD size = GetFileVersionInfoSizeW(path.c_str(), &handle);
  if (size == 0) return "";
  std::vector<char> buffer(size);
  if (!GetFileVersionInfoW(path.c_str(), handle, size, buffer.data())) return "";
  VS_FIXEDFILEINFO* info = nullptr;
  UINT infoSize = 0;
  if (!VerQueryValueW(buffer.data(), L"\\", reinterpret_cast<void**>(&info), &infoSize)) return "";
  if (!info) return "";
  std::ostringstream stream;
  stream << HIWORD(info->dwFileVersionMS) << "."
         << LOWORD(info->dwFileVersionMS) << "."
         << HIWORD(info->dwFileVersionLS) << "."
         << LOWORD(info->dwFileVersionLS);
  return stream.str();
}

static std::string GetInstalledVersionFallback() {
  const std::vector<std::wstring> candidates = {
    L"C:\\Program Files\\ZG-Desktop\\ZG-Desktop.exe",
    L"C:\\Program Files (x86)\\ZG-Desktop\\ZG-Desktop.exe",
  };
  for (const auto& path : candidates) {
    DWORD attrs = GetFileAttributesW(path.c_str());
    if (attrs != INVALID_FILE_ATTRIBUTES) {
      auto version = GetFileVersion(path);
      if (!version.empty()) return version;
    }
  }
  return "";
}

static std::wstring CombineUrl(const std::wstring& base, const std::wstring& relative) {
  if (relative.rfind(L"http://", 0) == 0 || relative.rfind(L"https://", 0) == 0) {
    return relative;
  }

  URL_COMPONENTS components{};
  components.dwStructSize = sizeof(components);
  components.dwHostNameLength = static_cast<DWORD>(-1);
  components.dwSchemeLength = static_cast<DWORD>(-1);
  if (!WinHttpCrackUrl(base.c_str(), 0, 0, &components)) {
    return relative;
  }

  std::wstring scheme(components.lpszScheme, components.dwSchemeLength);
  std::wstring host(components.lpszHostName, components.dwHostNameLength);
  std::wstring prefix = scheme + L"://" + host;
  if (!relative.empty() && relative.front() != L'/') {
    prefix += L"/";
  }
  return prefix + relative;
}

static bool HttpGet(const std::wstring& url, const std::vector<std::wstring>& headers, std::string* outBody, DWORD* outStatus, std::wstring* outLocation) {
  URL_COMPONENTS components{};
  components.dwStructSize = sizeof(components);
  components.dwHostNameLength = static_cast<DWORD>(-1);
  components.dwUrlPathLength = static_cast<DWORD>(-1);
  components.dwSchemeLength = static_cast<DWORD>(-1);
  components.dwExtraInfoLength = static_cast<DWORD>(-1);

  if (!WinHttpCrackUrl(url.c_str(), 0, 0, &components)) {
    return false;
  }

  std::wstring host(components.lpszHostName, components.dwHostNameLength);
  std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
  if (components.dwExtraInfoLength > 0) {
    path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
  }

  HINTERNET session = WinHttpOpen(kUserAgent, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) return false;

  HINTERNET connect = WinHttpConnect(session, host.c_str(), components.nPort, 0);
  if (!connect) {
    WinHttpCloseHandle(session);
    return false;
  }

  DWORD flags = components.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
  HINTERNET request = WinHttpOpenRequest(connect, L"GET", path.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  if (!request) {
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  WinHttpAddRequestHeaders(request, L"Accept-Encoding: identity", -1, WINHTTP_ADDREQ_FLAG_ADD);
  for (const auto& header : headers) {
    WinHttpAddRequestHeaders(request, header.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);
  }

  bool ok = WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
  if (!ok) {
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  ok = WinHttpReceiveResponse(request, nullptr);
  if (!ok) {
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  DWORD status = 0;
  DWORD statusSize = sizeof(status);
  WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize, WINHTTP_NO_HEADER_INDEX);
  if (outStatus) *outStatus = status;

  if (outLocation) {
    DWORD length = 0;
    WinHttpQueryHeaders(request, WINHTTP_QUERY_LOCATION, WINHTTP_HEADER_NAME_BY_INDEX, nullptr, &length, WINHTTP_NO_HEADER_INDEX);
    if (GetLastError() == ERROR_INSUFFICIENT_BUFFER && length > 0) {
      std::wstring location(length / sizeof(wchar_t), L'\0');
      if (WinHttpQueryHeaders(request, WINHTTP_QUERY_LOCATION, WINHTTP_HEADER_NAME_BY_INDEX, location.data(), &length, WINHTTP_NO_HEADER_INDEX)) {
        if (!location.empty() && location.back() == L'\0') location.pop_back();
        *outLocation = location;
      }
    }
  }

  if (outBody) {
    std::string body;
    DWORD available = 0;
    while (WinHttpQueryDataAvailable(request, &available) && available > 0) {
      std::vector<char> buffer(available);
      DWORD read = 0;
      if (!WinHttpReadData(request, buffer.data(), available, &read)) break;
      body.append(buffer.data(), buffer.data() + read);
    }
    *outBody = std::move(body);
  }

  WinHttpCloseHandle(request);
  WinHttpCloseHandle(connect);
  WinHttpCloseHandle(session);
  return true;
}

static bool DownloadFile(const std::wstring& url, const std::wstring& destination, DWORD* outStatus, std::wstring* outLocation) {
  URL_COMPONENTS components{};
  components.dwStructSize = sizeof(components);
  components.dwHostNameLength = static_cast<DWORD>(-1);
  components.dwUrlPathLength = static_cast<DWORD>(-1);
  components.dwSchemeLength = static_cast<DWORD>(-1);
  components.dwExtraInfoLength = static_cast<DWORD>(-1);

  if (!WinHttpCrackUrl(url.c_str(), 0, 0, &components)) {
    return false;
  }

  std::wstring host(components.lpszHostName, components.dwHostNameLength);
  std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
  if (components.dwExtraInfoLength > 0) {
    path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
  }

  HINTERNET session = WinHttpOpen(kUserAgent, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) return false;

  HINTERNET connect = WinHttpConnect(session, host.c_str(), components.nPort, 0);
  if (!connect) {
    WinHttpCloseHandle(session);
    return false;
  }

  DWORD flags = components.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
  HINTERNET request = WinHttpOpenRequest(connect, L"GET", path.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  if (!request) {
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  WinHttpAddRequestHeaders(request, L"Accept-Encoding: identity", -1, WINHTTP_ADDREQ_FLAG_ADD);

  bool ok = WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
  if (!ok) {
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  ok = WinHttpReceiveResponse(request, nullptr);
  if (!ok) {
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  DWORD status = 0;
  DWORD statusSize = sizeof(status);
  WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize, WINHTTP_NO_HEADER_INDEX);
  if (outStatus) *outStatus = status;

  if (outLocation) {
    DWORD length = 0;
    WinHttpQueryHeaders(request, WINHTTP_QUERY_LOCATION, WINHTTP_HEADER_NAME_BY_INDEX, nullptr, &length, WINHTTP_NO_HEADER_INDEX);
    if (GetLastError() == ERROR_INSUFFICIENT_BUFFER && length > 0) {
      std::wstring location(length / sizeof(wchar_t), L'\0');
      if (WinHttpQueryHeaders(request, WINHTTP_QUERY_LOCATION, WINHTTP_HEADER_NAME_BY_INDEX, location.data(), &length, WINHTTP_NO_HEADER_INDEX)) {
        if (!location.empty() && location.back() == L'\0') location.pop_back();
        *outLocation = location;
      }
    }
  }

  if (status >= 300 && status < 400) {
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return true;
  }

  if (status != 200) {
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  std::ofstream out(ToString(destination), std::ios::binary);
  if (!out.is_open()) {
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return false;
  }

  DWORD available = 0;
  while (WinHttpQueryDataAvailable(request, &available) && available > 0) {
    std::vector<char> buffer(available);
    DWORD read = 0;
    if (!WinHttpReadData(request, buffer.data(), available, &read)) break;
    if (read == 0) break;
    out.write(buffer.data(), static_cast<std::streamsize>(read));
  }

  WinHttpCloseHandle(request);
  WinHttpCloseHandle(connect);
  WinHttpCloseHandle(session);
  return true;
}

static bool HttpGetWithRedirects(const std::wstring& url, const std::vector<std::wstring>& headers, std::string* outBody) {
  std::wstring current = url;
  for (int i = 0; i < 5; ++i) {
    DWORD status = 0;
    std::wstring location;
    std::string body;
    if (!HttpGet(current, headers, &body, &status, &location)) return false;
    if (status >= 300 && status < 400 && !location.empty()) {
      current = CombineUrl(current, location);
      continue;
    }
    if (status != 200) return false;
    if (outBody) *outBody = std::move(body);
    return true;
  }
  return false;
}

static bool DownloadFileWithRedirects(const std::wstring& url, const std::wstring& destination) {
  std::wstring current = url;
  for (int i = 0; i < 5; ++i) {
    DWORD status = 0;
    std::wstring location;
    if (!DownloadFile(current, destination, &status, &location)) return false;
    if (status >= 300 && status < 400 && !location.empty()) {
      current = CombineUrl(current, location);
      continue;
    }
    return status == 200;
  }
  return false;
}

static std::wstring BuildApiUrl() {
  std::wstring url = L"https://api.github.com/repos/";
  url += kOwner;
  url += L"/";
  url += kRepo;
  url += L"/releases/latest";
  return url;
}

static bool RunInstaller(const std::wstring& installerPath) {
  std::wstring args = L"\"" + installerPath + L"\" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS";
  STARTUPINFOW si{};
  si.cb = sizeof(si);
  PROCESS_INFORMATION pi{};

  std::wstring cmdLine = args;
  if (!CreateProcessW(nullptr, cmdLine.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
    return false;
  }

  WaitForSingleObject(pi.hProcess, INFINITE);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);
  return true;
}

static std::wstring GetTempInstallerPath(const std::string& version) {
  wchar_t tempPath[MAX_PATH];
  DWORD length = GetTempPathW(MAX_PATH, tempPath);
  std::wstring base = length > 0 ? std::wstring(tempPath) : L"C:\\Windows\\Temp\\";
  std::wstring file = L"ZG-Desktop-Setup-" + ToWString(version) + L".exe";
  return JoinPath(base, file);
}

static void CheckForUpdatesAndInstall() {
  std::string currentVersion = GetInstalledVersionFromRegistry();
  if (currentVersion.empty()) {
    currentVersion = GetInstalledVersionFallback();
  }
  if (currentVersion.empty()) {
    Log("Current version not found, skipping.");
    return;
  }

  std::string payload;
  std::vector<std::wstring> headers = {
    L"Accept: application/vnd.github.v3+json",
  };
  if (!HttpGetWithRedirects(BuildApiUrl(), headers, &payload)) {
    Log("Failed to fetch release JSON.");
    return;
  }

  json release;
  try {
    release = json::parse(payload);
  } catch (...) {
    Log("Failed to parse release JSON.");
    return;
  }

  if (release.value("draft", false) || release.value("prerelease", false)) {
    return;
  }

  std::string latestTag = release.value("tag_name", "");
  std::string latestVersion = NormalizeVersion(latestTag);
  std::string normalizedCurrent = NormalizeVersion(currentVersion);
  if (latestVersion.empty() || normalizedCurrent.empty()) {
    Log("Version parsing failed.");
    return;
  }

  if (CompareVersions(latestVersion, normalizedCurrent) <= 0) {
    return;
  }

  std::string downloadUrl;
  if (release.contains("assets") && release["assets"].is_array()) {
    for (const auto& asset : release["assets"]) {
      if (!asset.is_object()) continue;
      if (asset.value("name", "") == ToString(std::wstring(kAssetName))) {
        downloadUrl = asset.value("browser_download_url", "");
        break;
      }
    }
  }

  if (downloadUrl.empty()) {
    Log("Update asset not found.");
    return;
  }

  std::wstring installerPath = GetTempInstallerPath(latestVersion);
  if (!DownloadFileWithRedirects(ToWString(downloadUrl), installerPath)) {
    Log("Failed to download installer.");
    return;
  }

  Log("Installer downloaded, launching.");
  if (!RunInstaller(installerPath)) {
    Log("Installer failed to run.");
  }
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  HANDLE mutexHandle = CreateMutexW(nullptr, TRUE, kMutexName);
  if (!mutexHandle || GetLastError() == ERROR_ALREADY_EXISTS) {
    if (mutexHandle) CloseHandle(mutexHandle);
    return 0;
  }

  if (!ReadAutoUpdateEnabled()) {
    CloseHandle(mutexHandle);
    return 0;
  }

  Log("Update helper started.");

  while (true) {
    if (!ReadAutoUpdateEnabled()) {
      Log("Auto update disabled, exiting.");
      break;
    }

    CheckForUpdatesAndInstall();

    for (int minute = 0; minute < 30; ++minute) {
      std::this_thread::sleep_for(std::chrono::minutes(1));
      if (!ReadAutoUpdateEnabled()) {
        Log("Auto update disabled during wait.");
        CloseHandle(mutexHandle);
        return 0;
      }
    }
  }

  CloseHandle(mutexHandle);
  return 0;
}
